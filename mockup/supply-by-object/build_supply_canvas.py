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
are modelled on the HART. YT save of day 73, with six states seeded so every verdict
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
.sb-t tr.sb-kid.sb-open{display:table-row;animation:rowin .3s ease}
.sb-t tr.sb-gr{cursor:pointer}
.sb-t tr.sb-gr:hover td{background:var(--surface)}
.sb-t tr.sb-kid td{background:color-mix(in srgb,var(--surface) 55%,transparent)}
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
tr.sb-opened .sb-kids svg{transform:rotate(90deg)}
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

/* sizing: 24/7 or demand, remembered per device ------------------------------ */
.sb-sizing{display:flex;align-items:center;gap:14px;margin-top:16px;font-size:12.5px;color:var(--ink-3)}
.sb-sizing .lab{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);white-space:nowrap}
.sb-sizing .seg a{display:inline-flex;align-items:center;gap:6px}
.sb-sizing .seg a svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.sb-sizing .seg a:hover svg{animation:sp-spin 1.6s linear infinite}
.sb-sizing .what{max-width:560px}
.sb-sizing .what b{color:var(--ink-2);font-weight:500}
.sb-sizing .mem{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font:500 11px/1 "IBM Plex Mono",monospace;white-space:nowrap}
.sb-sizing .mem svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}

/* a young shop downstream: its demand is a straight line so far ---------------- */
.sb-ramp{display:flex;align-items:flex-start;gap:12px;margin:12px 0 4px;padding:10px 14px;border-radius:8px;background:#f0913a14;box-shadow:inset 0 0 0 1px #f0913a55;font-size:12.5px;color:var(--ink-2)}
.sb-ramp b{color:var(--ink);font-weight:600}
.sb-ramp .ic{color:var(--warn);flex:none;margin-top:1px}
.sb-ramp .ic svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.sb-ramp:hover .ic svg{animation:sb-climb 1s ease-in-out infinite}
@keyframes sb-climb{50%{transform:translate(2px,-2px)}}
.sb-rampt{display:inline-block;margin-left:6px;padding:0 5px;border-radius:3px;background:#f0913a22;color:var(--warn);font:500 9.5px/1.6 "IBM Plex Mono",monospace;letter-spacing:.04em;vertical-align:1px;cursor:help}

/* staffing for factory lines: hours for the sizing, people, wages --------------- */
.sb-staff{margin-top:34px}
.sb-staff .sechead .sp-ico{width:28px;height:28px}
.sb-srows{display:flex;flex-direction:column;border-top:1px solid var(--rule)}
.sb-srow{display:grid;grid-template-columns:230px minmax(0,1fr) 150px 130px 150px;gap:18px;align-items:center;padding:14px 0;border-bottom:1px solid var(--rule-soft);font-size:13px}
.sb-srow.quiet{color:var(--ink-3)}
.sb-srow .lines{display:flex;flex-direction:column;gap:7px}
.sb-srow .ln{display:flex;align-items:center;gap:10px;color:var(--ink-2)}
.sb-srow .ln b{color:var(--ink);font-weight:500}
.sb-srow .ln .sb-chg{font:500 12px/1 "IBM Plex Mono",monospace}
.sb-srow .ppl{display:flex;align-items:center;gap:8px;font:500 13px/1 "IBM Plex Mono",monospace}
.sb-srow .ppl .d{padding:2px 7px;border-radius:4px;font-size:11px}
.sb-srow .ppl .d.up{background:#f0913a22;color:var(--warn)}
.sb-srow .ppl .d.dn{background:var(--accent-soft);color:var(--accent)}
.sb-srow .ppl .dots{display:inline-flex;gap:2px;flex-wrap:wrap;max-width:70px}
.sb-srow .wage{display:flex;flex-direction:column;align-items:flex-end;font:500 13.5px/1 "IBM Plex Mono",monospace;text-align:right}
.sb-srow .wage.dn{color:var(--accent)}.sb-srow .wage.up{color:var(--warn)}
.sb-srow .wage small{display:block;margin-top:4px;font-size:10.5px;color:var(--ink-3)}
.sb-srow .go{justify-self:end}
.sb-stot{display:flex;align-items:center;gap:18px;padding:12px 0;font:500 12.5px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.sb-stot b{color:var(--ink);font-weight:500}
.sb-stot .dn{color:var(--accent)}.sb-stot .up{color:var(--warn)}
.sb-staff .sb-srow .sp-dot{width:8px;height:8px}
.sb-srow:hover .sp-dot{animation:sp-hop .5s ease-in-out;animation-delay:calc(var(--k)*25ms)}
.sb-dot-gone{background:none!important;box-shadow:inset 0 0 0 1px var(--ink-3)}
.sb-dot-new{background:none!important;border:1.5px dashed var(--warn);box-sizing:border-box}

/* the option not chosen ------------------------------------------------------- */
.sb-notchosen{display:inline-flex;align-items:center;gap:8px;margin-top:22px;padding:6px 12px;border-radius:6px;border:1px dashed var(--rule);font:500 11.5px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.board.sb-dim .wrap>*:not(.sb-notchosen):not(.mast){opacity:.55}

/* plan a chain: the finished layout, what is placed, what runs ------------------ */
.sb-growsub{display:flex;align-items:center;gap:14px;margin-top:28px}
.sb-planhead{display:flex;align-items:center;gap:14px;margin-top:34px}
.sb-planhead h2{margin:0;font-size:17px;font-weight:600}
.sb-planhead .aside{margin-left:auto;display:flex;gap:10px;align-items:center}
.sb-planhead select,.sb-build select{font:inherit;font-size:13px;color:var(--ink);background:var(--surface);border:1px solid var(--rule);border-radius:7px;padding:7px 10px}
.sb-build{display:flex;align-items:center;gap:14px;margin-top:18px;padding:12px 16px;border-radius:10px;background:var(--surface);border:1px solid var(--rule-soft);font-size:13px;color:var(--ink-2)}
.sb-build .lab{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.sb-build .state{display:inline-flex;align-items:center;gap:10px;font:500 13px/1 "IBM Plex Mono",monospace;color:var(--ink)}
.sb-build .state i{font-style:normal;color:var(--ink-3)}
.sb-build .why{margin-left:2px}
.sb-pm{display:inline-flex;gap:4px;flex-wrap:nowrap;vertical-align:middle}
.sb-pm i{width:14px;height:14px;border-radius:4px;display:block;box-sizing:border-box;transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.sb-pm i.run{background:var(--accent)}
.sb-pm i.placed{box-shadow:inset 0 0 0 1.5px var(--accent);background:var(--accent-soft)}
.sb-pm i.plan{border:1.5px dashed var(--ink-3)}
.sb-pm:hover i.plan{transform:translateY(-2px)}
.sb-pm:hover i.run{animation:sp-hop .6s ease-in-out;animation-delay:calc(var(--k)*40ms)}
.sb-build .state span{white-space:nowrap}
.sb-build .lab{white-space:nowrap}
.sb-pmleg{display:flex;gap:16px;white-space:nowrap;font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.sb-pmleg span{display:inline-flex;align-items:center;gap:6px}
.sb-pmleg .sb-pm i{width:11px;height:11px}
.sb-save{display:flex;align-items:center;gap:16px;margin-top:22px;padding:14px 16px;border-radius:10px;border:1px solid var(--accent);background:var(--accent-soft)}
.sb-save .txt{font-size:13px;color:var(--ink-2);flex:1}
.sb-save .txt b{color:var(--ink);font-weight:600}
.sb-save .btn2.primary svg{width:14px;height:14px}
.sb-save .saved{display:none;align-items:center;gap:8px;font:500 12.5px/1 "IBM Plex Mono",monospace;color:var(--accent)}
.sb-save.is-saved .saved{display:inline-flex}
.sb-save.is-saved .dosave{display:none}
.sb-save .rm{font-size:12.5px}
.sb-save:not(.is-saved) .rm{display:none}
.sb-fill{display:flex;align-items:center;gap:12px;margin-top:12px;padding:10px 14px;border-radius:8px;background:var(--surface);border:1px dashed var(--warn);font-size:13px;color:var(--ink-2)}
.sb-fill b{color:var(--ink);font-weight:600}
.sb-fill .ic{color:var(--warn);display:grid;place-items:center}
.sb-fill .ic svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.sb-fill .mono{color:var(--ink)}
.sb-plan{display:flex;align-items:center;gap:14px;margin-top:16px;padding:11px 14px;border-radius:10px;border:1px solid var(--rule);background:var(--surface);font-size:13px;color:var(--ink-2)}
.sb-plan .ic{width:30px;height:30px;border-radius:8px;background:var(--raised);display:grid;place-items:center;color:var(--accent);flex:none}
.sb-plan .ic svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.sb-plan:hover .ic svg{animation:sp-spin 2.4s linear infinite}
.sb-plan b{color:var(--ink);font-weight:600}
.sb-plan .aside{margin-left:auto;display:flex;align-items:center;gap:14px}
.sb-plantag{display:inline-block;margin-left:6px;padding:0 5px;border-radius:3px;box-shadow:inset 0 0 0 1px var(--accent);color:var(--accent);font:500 9.5px/1.6 "IBM Plex Mono",monospace;letter-spacing:.04em;vertical-align:1px;cursor:help}

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
    "clock247": '<circle cx="12" cy="12" r="8.500"></circle><path d="M12 7v5l3.500 2"></path>',
    "target": '<circle cx="12" cy="12" r="8.500"></circle><circle cx="12" cy="12" r="4.500"></circle><circle cx="12" cy="12" r=".800"></circle>',
    "ramp": '<path d="M4 19h16M5 16l5-5 3 3 6-7"></path><path d="M15 7h4v4"></path>',
    "device": '<rect x="7" y="3" width="10" height="18" rx="2"></rect><path d="M11 17h2"></path>',
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


def masthead(active: str = "supply") -> str:
    items = "".join(f'<a class="{"on" if key == active else ""}" href="#">{svg(key)}<span>{label}</span>'
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
LEFT = {"Shops": 10, "Warehouses": 7, "Factories": 6}  # sized 24/7
LEFT_DEMAND = {"Shops": 10, "Warehouses": 2, "Factories": 1}  # sized for demand
TOTAL, TOTAL_DEMAND = sum(LEFT.values()), sum(LEFT_DEMAND.values())


def subhead(active: str, every: bool = False, left: dict | None = None, fourth: bool = False, diagram: bool | None = False,
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

SHOP_W = [200, 170, 90, 100, 80, 100, 160, None]
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
    # idle rows fold into one group that opens on a click (Peter, 24 Sep)
    kids = [r for r in rows if 'class="sb-v idle"' in r["cells"][7][0]]
    if len(kids) > 1:
        at = rows.index(kids[0])
        for r in kids:
            rows.remove(r)
            r["cls"] = (r.get("cls", "") + " sb-kid").strip()
            r["kid"] = "bags"
        parent = {"cls": "sb-gr", "cells": [
            ('<span class="sb-site"><span class="hood">3</span>3 jewelry shops</span>', "3 jewelry shops"),
            (f'Paper Bag<button type="button" class="sb-kids" data-kids="bags" aria-label="Open the 3 shops">{svg("chev")}+3</button>', "Paper Bag"),
            ("309", 309), ("—", None), ("9,407", 9407), (gauge(4), 4),
            ('<span class="sb-chg"><b>3 to type</b></span><span class="sub r">click to open</span>', None),
            (v("idle", "top-ups hold 30 to 31 days of sales", "Paper Bag top-up targets 30 to 31 times daily sales at MT, MH and GD HART. Jewelry. A week's worth is 1,200 and 700."), "0idle")]}
        rows[at:at] = [parent] + kids
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
{tray(total_done, TOTAL)}
{verdict("<b>6 shelves have no plan and 1 runs short on Fridays</b>; 90 of 100 clear tomorrow's round. 3 hold a month of paper bags.")}
{table(SHOP_COLS, shop_rows(done_keys), "shopsT", SHOP_W)}
{more(10, 100, "shelves")}
"""


def shops_empty() -> str:
    left = {"Shops": 0, "Warehouses": 7, "Factories": 6}
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
{tray(0, 13)}
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


def uses(val: str, parts: list[str], rated: bool = False, demand: str = "") -> str:
    """What a week uses at the ends of the routes, with the chain behind it on hover: end demand
    along the routes, one margin for the whole chain, the order."""
    total = int(val.replace(",", ""))
    with_m = total * (100 + MARGIN) / 100
    order_ = math.ceil(with_m / 100) * 100
    tip = ("End demand along the routes: " + " · ".join(parts) + f". Sum {val} a week. One {MARGIN}% margin for the whole chain, "
           f"import to sale: {with_m:,.0f}. Order {order_:,} (rounded up to 100). The depots and factories on the way add no margin of their own.")
    tag = (f'<span class="sb-rated" data-tip="Sized 24/7 (the switch on Factories): factory lines at their rated output round the clock. '
           f'Sized for Demand this line would use {demand} a week.">24/7</span>') if rated else ""
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


def warehouses(arrived: bool = True, every: bool = False, diag: bool = False) -> str:
    ELEC = [("Resistors", "127,900", "3,086", "151,300"), ("Transistors", "127,900", "3,086", "151,300"), ("Speaker", "50,960", "1,234", "60,500"),
            ("Integrated Circuits", "42,400", "1,029", "50,500"), ("Microphone", "33,700", "829", "40,400"),
            ("Copper Clad Laminate", "20,800", "514", "25,300"), ("Battery", "16,300", "429", "20,200"), ("Plastic", "14,350", "343", "16,900"),
            ("Glass", "9,950", "243", "11,800")]
    R = "sized 24/7: the lines at their rated rate, 24 hours a day, 7 days"
    hub = [
        wh_row("Uncut Gems (Expensive)", "4,342", "488", "488", rail(8.9, 5), order(4800, 5040, 5700, "7 Pier"),
               uses("5,040", ["Factory Jewelry: Jewelry (Expensive), 1 machine × 30 an hour × 24 h × 7 = 5,040", R], rated=True, demand="1,890"),
               "short", "uses 5,040 a week; the level brings 4,800",
               "Holdings reach Monday's import, but the Smart Delivery level refills less than a week of what the jewelry line uses.", key="w0", wv=5040),
        wh_row("Fabric (Cheap)", "63,824", "7,770", "7,770", rail(8.2, 5), order(80700, 80640, 90400, "7 Pier"),
               uses("80,640", ["Factory Clothing: 4 cheap lines, 4 machines × 60 an hour × 24 h × 7 = 80,640", R], rated=True, demand="48,972"),
               "tight", "covers the 80,640 a week it uses, not the 12% margin", key="w3", wv=80640),
        wh_row("Fabric (Expensive)", "65,354", "6,612", "6,612", rail(9.9, 5), order(80700, 80640, 90400, "7 Pier"),
               uses("80,640", ["Factory Clothing: 4 expensive lines, 8 machines × 30 an hour × 24 h × 7 = 80,640", R], rated=True, demand="42,994"),
               "tight", "covers the 80,640 a week it uses, not the 12% margin", key="w4", wv=80640),
        wh_row("Metal Band", "12,442", "1,644", "1,644", rail(7.6, 5), order(15200, 15120, 17000, "7 Pier"),
               uses("15,120", ["Factory Jewelry: Jewelry (Expensive) 30 an hour and Jewelry (Cheap) 60 an hour, × 24 h × 7 = 15,120",
                               "Not counted: the one-off 5,000 filled into Jewelry Distrib. on days 66 to 68", R], rated=True, demand="8,631"),
               "tight", "covers the 15,120 a week it uses, not the 12% margin", key="w5", wv=15120),
        wh_row("Uncut Gems (Cheap)", "8,200", "897", "897", rail(9.1, 5), order(10200, 10080, 11300, "7 Pier"),
               uses("10,080", ["Factory Jewelry: Jewelry (Cheap), 1 machine × 60 an hour × 24 h × 7 = 10,080 (rostered 12 h today)", R], rated=True, demand="6,741"),
               "tight", "covers the 10,080 a week it uses, not the 12% margin", key="w6", wv=10080),
        wh_row(f'Idle stock<button type="button" class="sb-kids" data-kids="idle" aria-label="Open the 12 idle lines">{svg("chev")}+12</button>',
               "579,160", "—", "—", rail(None, None, dead=True), '<span class="sub r">click to open</span>', "—", "idle",
               '7,000 drinks nothing draws; 10 electronics parts hold 6 weeks', cls="sb-gr"),
        wh_row("Energy Drink", "4,000", "—", "—", rail(None, None, dead=True), order(4000, None, None, "1 Pier"), "—", "idle",
               'nothing draws it; <a href="Shops.dc.html">3 gyms sell 554 a day with no plan</a>', cls="sb-kid", kid="idle"),
        wh_row("Soda Can", "3,000", "—", "—", rail(None, None, dead=True), order(3000, None, None, "1 Pier"), "—", "idle",
               'nothing draws it; <a href="Shops.dc.html">the same gyms sell 369 a day</a>', cls="sb-kid", kid="idle"),
        wh_row("Capacitors", "127,900", "3,086", "3,086", rail(41, 5), order(151300, 20160, None, "7 Pier"),
               uses("20,160", ["Factory Electronics: 2 smartwatch lines, 2 machines × 2 capacitors × 30 an hour × 24 h × 7 = 20,160", R], rated=True,
                    demand="0 (no shop sells a smartwatch yet)"), "idle",
               "the level holds 7.5 weeks of what the lines use", cls="sb-kid", kid="idle", wv=20160),
    ]
    for item, hand, draw, lvl in ELEC:
        hub.append(wh_row(item, hand, draw, draw, rail(41, 5), chg(int(lvl.replace(",", "")), None, "in stock", ""), "—", "idle", "", cls="sb-kid", kid="idle"))
    hub += [
        wh_row("Paper Bag", "17,387", "2,790", "Fri 3,236", rail(6.3, 5), order(25000, 20300, None, "1 Pier"),
               uses("20,300", ["7 clothing shops 14,970, via Clothing Distr. and Factory Clothing",
                               "7 jewelry shops 5,330, via Jewelry Distrib. and Factory Jewelry",
                               "the factories only pass bags on"]),
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
{subhead("Warehouses", every=every, left={**LEFT, "Shops": 8}, diagram=diag)}
{tray(2, TOTAL)}
{verdict("<b>2 settings fall short and 4 import levels sit inside their 12% margin</b>; 29 of 35 lines reach their next delivery with room. <b>7,000 drinks and 5,000 Metal Band sit idle</b>.", crumb=crumb)}
<div class="sb-listonly">
{block("warehouse", "GD", "Clothing Distr.", clo_how, stat("On the floor", "13,653") + stat("Takes / day", "8,973", "Sat 10,590", "What the rounds into here have to bring, and on its busiest day", "take"), clo, "whClo", "1 to change")}
{block("warehouse", "GD", "Jewelry Distrib.", jew_how, stat("On the floor", "10,307") + stat("Takes / day", "1,696", "Fri 1,970", "", "take"), jew, "whJew", "1 to change", lit=arrived)}
{block("warehouse", "GD", "Import Hub", hub_how, stat("On the floor", "750,709") + stat("Uses / week", "321,000", "24/7", "What a week uses along every route out of here, factory lines sized 24/7: what the two import contracts have to bring, before the one chain margin. Sized for Demand: 173,000.", "take"), hub, "whHub", "5 to change")}
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


def line_row(item, ws, count, staffed, need, makes, ships, held, word, why, tip="", key=None, cls="", done=False, set_hours=None, mode="247"):
    share = staffed / 24
    mtip = f"{staffed} of 24 hours a day someone is posted here"
    what = "sized 24/7" if mode == "247" else "for what the shops use, plus the chain margin"
    hours = (f'<span class="sb-hrs">{day_strip(staffed, need, f"Staffed {staffed} h; needs {need} h a day {what}")}'
             + (f'<span class="n">{chg(staffed, set_hours, "h")}</span>' if set_hours else f'<span class="n"><b>{staffed} h</b> · needs {need}</span>')
             + "</span>")
    r = {"cells": [(f'{item}<span class="sub">{ws}</span>', item), (machines(share, count, mtip), None), (hours, staffed - need),
                   (makes, _num(makes)), (ships, _num(ships)), (held, _num(held)), (v(word, why, tip), word)], "cls": cls}
    if key:
        r["key"] = key
        r["tick"] = tick(f"{item}: hours set", done)
    return r


def input_row(item, eats, hand, arrived, top, word, why, tip="", key=None, cls="", ev=None):
    r = {"cells": [(item, item), (eats, ev if ev is not None else _num(eats)), (hand, _num(hand)), (arrived, _num(arrived)), (top, None),
                   (v(word, why, tip), word)], "cls": cls}
    if key:
        r["key"] = key
        r["tick"] = tick(f"{item}: typed in")
    return r


def eats(val: str, parts: list[str], ramp: bool = False) -> str:
    """What the lines eat a day, and on hover the chain behind it: one margin, the top-up."""
    total = int(val.replace(",", ""))
    with_m = total * (100 + MARGIN) / 100
    top = math.ceil(with_m / 100) * 100
    tip = (" · ".join(parts) + f". One {MARGIN}% margin for the whole chain: {with_m:,.0f}. Daily top-up {top:,} (rounded up to 100), "
           "the same margin the import behind it carries, not a second one.")
    rt = ('<span class="sb-rampt" data-tip="Includes [GD] and [MH] HART. Jewelry, open 6 days: their demand is a straight line '
          'through the days they have traded, so it may still be ramping.">ramping</span>') if ramp else ""
    return f'<span class="sb-uses" data-tip="{esc(tip)}">{val}</span>{rt}'


RAMP = ("<b>2 shops downstream have traded under a week</b>: [GD] HART. Jewelry and [MH] HART. Jewelry, open 6 days each. "
        "Their demand is a straight line through those 6 days (78 and 74 a day of Jewelry (Cheap), heading for about 96 and 90), "
        "so the figures below <b>may still be ramping</b>.")


def sizing(mode: str) -> str:
    """The player's choice: size factory lines for their rated output or for demand. Remembered per device."""
    a = lambda m, lab, icon, href: (f'<a class="{"on" if m == mode else ""}" href="{href}">{svg(icon)}{lab}</a>')
    what = ("<b>24/7</b>: every line, its Factory inputs and the imports behind them are sized for the machines' rated output, round the clock."
            if mode == "247" else
            f"<b>Demand</b>: sized for what the shops at the end of each chain use, plus one {MARGIN}% margin, import to sale.")
    return (f'<div class="sb-sizing"><span class="lab">Size lines for</span><span class="seg">{a("247", "24/7", "clock247", "Factories.dc.html")}'
            f'{a("demand", "Demand", "target", "FactoriesDemand.dc.html")}</span><span class="what">{what}</span>'
            f'<span class="mem" data-tip="Kept on this device. Warehouses sizes its imports the same way.">{svg("device")}remembered here</span></div>')


def staff_card(mode: str) -> str:
    """Staffing for factory lines, like the shops' Staffing: hours each line should run for the
    sizing, the factory workers that takes, and the wage effect. Planned on the factory's page."""
    def dots(now, after):
        out = ""
        for k in range(max(now, after)):
            cls = "sb-dot-gone" if k >= after else "sb-dot-new" if k >= now else ""
            out += f'<span class="sp-dot {cls}" style="--k:{k}"></span>'
        return f'<span class="dots">{out}</span>'

    def row(code, name, lines, now, after, wage, quiet=False, ramp=False):
        d = after - now
        chip = "" if not d else f'<span class="d {"up" if d > 0 else "dn"}">{"+" if d > 0 else "−"}{abs(d)}</span>'
        ppl = f'<span class="ppl">{now}{f" → <b>{after}</b>" if d else ""} {chip}</span>' if not quiet else f'<span class="ppl">{now}</span>'
        wg = ("" if not wage else f'<span class="wage {"up" if wage > 0 else "dn"}">{"+" if wage > 0 else "−"}${abs(wage):,}<small>a day in wages</small></span>')
        rt = ' <span class="sb-rampt">ramping</span>' if ramp else ""
        return (f'<div class="sb-srow{" quiet" if quiet else ""}"><span>{site(code, name)}{rt}</span><span class="lines">{lines}</span>'
                f'{ppl if quiet else ppl.replace("</span>", "", 0)}{wg or "<span></span>"}'
                f'<a class="link go" href="#">Staffing on its page ›</a></div>')

    def ln(label, now, need):
        return f'<span class="ln">{day_strip(now, need, f"{now} h staffed, {need} h needed")}<b>{label}</b>{chg(now, need, "h")}</span>'

    if mode == "247":
        rows = (row("IC", "Factory Jewelry", ln("Jewelry (Cheap)", 12, 24), 6, 8, 420)
                + row("IC", "Factory Clothing", '<span class="ln">8 lines run 24 h, as sized</span>', 48, 48, 0, quiet=True)
                + row("IC", "Factory Electronics", '<span class="ln">2 lines run 24 h · new since day 72</span>', 8, 8, 0, quiet=True))
        tot = '<span>Sized 24/7:</span><b class="up">+2 factory workers</b><b class="up">+$420 a day</b>'
    else:
        rows = (row("IC", "Factory Clothing", ln("4 expensive lines", 24, 15) + ln("4 cheap lines", 24, 17), 48, 32, -3380)
                + row("IC", "Factory Jewelry", ln("Jewelry (Cheap)", 12, 18) + ln("Jewelry (Expensive)", 24, 11), 6, 5, -210, ramp=True)
                + row("IC", "Factory Electronics", '<span class="ln">too new to plan: judged from day 76</span>', 8, 8, 0, quiet=True))
        tot = '<span>Sized for demand:</span><b class="dn">−17 factory workers</b><b class="dn">−$3,590 a day</b>'
    why = ("Hours each line should run for the sizing you picked, and the factory workers that takes. A worker covers about 6 machine-hours "
           "a day (42 a week, 12-hour shifts at most); wages are this save's $211 a day each. A dashed dot is a hire, a hollow one a post to cut. "
           "Only too few hours is a change to type; cutting hours is a suggestion.")
    return f"""
<section class="sb-staff rv">
  <div class="sechead"><span class="sp-ico">{svg("crew")}</span><h2>Staffing for factory lines</h2><span class="why" data-tip="{esc(why)}"><i>?</i></span>
    <span class="quiet">hours a line should run, people, wages</span></div>
  <div class="sb-srows">{rows}</div>
  <div class="sb-stot">{tot}</div>
</section>"""


def factories(every: bool = False, mode: str = "247") -> str:
    ev = "" if every else "sb-ev"
    dm = mode == "demand"
    if not dm:
        jl = [
            line_row("Jewelry (Cheap)", "Jewelry Workstation · #2 · 60 an hour", 1, 12, 24, "720<span class=\"sub\">of 1,440 at 24 h</span>", "897",
                     "540<span class=\"sub\">3 days left</span>", "short", "sized 24/7; staffed 12 of its 24 hours",
                     "The line is sized to run round the clock and is staffed 12 hours a day. Post a worker to machine #2 for the other 12.", key="f0", set_hours=24),
            line_row("Jewelry (Expensive)", "Jewelry Workstation · #1 · 30 an hour", 1, 24, 24, "720", "411", "902<span class=\"sub\">of 1,000</span>", "covered",
                     "runs 24/7, as sized", cls=ev),
        ]
        ji = [
            input_row("Uncut Gems (Expensive)", eats("720", ["Jewelry (Expensive) at 24/7: 1 machine × 30 an hour × 24 h = 720 gems a day"]), "480", "488",
                      chg(600, 900, "/day", "from Import Hub"), "short", "tops up 600; the line eats 720 a day", key="f1", ev=720),
            input_row("Uncut Gems (Cheap)", eats("1,440", ["Jewelry (Cheap) at 24/7: 1 machine × 60 an hour × 24 h = 1,440 a day"]), "960", "897",
                      chg(1500, 1700, "/day", "from Import Hub"), "tight", "covers the 1,440 a day, not the margin", key="f2", ev=1440),
            input_row("Metal Band", eats("2,160", ["both jewelry lines at 24/7: 720 + 1,440 a day"]), "1,390", "1,644",
                      chg(2200, 2500, "/day", "from Import Hub"), "tight", "covers the 2,160 a day, not the margin", key="f3", ev=2160),
        ]
        ci = [input_row("Fabric (Expensive)", eats("11,520", ["4 expensive lines at 24/7: 8 machines × 30 an hour × 24 h × 2 fabric = 11,520 a day"]), "7,280", "6,612",
                        chg(11600, 13000, "/day", "from Import Hub"), "tight", "covers the 11,520 a day, not the margin",
                        "Every clothing machine has Produce up to switched on, so today they draw 6,612. Sized 24/7, the top-up covers the rated need plus the chain margin.", key="f4", ev=11520),
              input_row("Fabric (Cheap)", eats("11,520", ["4 cheap lines at 24/7: 4 machines × 60 an hour × 24 h × 2 fabric = 11,520 a day"]), "7,280", "7,770",
                        chg(11600, 13000, "/day", "from Import Hub"), "tight", "covers the 11,520 a day, not the margin", key="f5", ev=11520)]
        cneed, cwhy = {30: 24, 60: 24}, "runs 24/7, as sized"
    else:
        jl = [
            line_row("Jewelry (Cheap)", "Jewelry Workstation · #2 · 60 an hour", 1, 12, 18, "720<span class=\"sub\">of 1,440 at 24 h</span>", "897",
                     "540<span class=\"sub\">3 days left</span>", "short", "shops use 963 a day, 1,079 with the margin; 12 hours make 720 · may still be ramping",
                     "Demand is what the 14 shops that sell Jewelry (Cheap) use, two of them extrapolated from 6 days. Post a worker to machine #2 for 18 hours a day.",
                     key="f0", set_hours=18, mode="demand"),
            line_row("Jewelry (Expensive)", "Jewelry Workstation · #1 · 30 an hour", 1, 24, 11, "720", "411", "902<span class=\"sub\">of 1,000</span>", "covered",
                     "needs 11 of its 24 hours · may still be ramping", cls=ev, mode="demand"),
        ]
        ji = [
            input_row("Uncut Gems (Expensive)", eats("270", ["7 jewelry shops 210 + 7 clothing shops 60 = 270 jewels a day, 1 gem each"], ramp=True), "480", "488",
                      chg(600, None, "/day", "from Import Hub"), "covered", "600 holds the 400 it needs with the margin", cls=ev, ev=270),
            input_row("Uncut Gems (Cheap)", eats("963", ["jewelry and clothing shops 963 Jewelry (Cheap) a day, 1 gem each"], ramp=True), "960", "897",
                      chg(1500, None, "/day", "from Import Hub"), "covered", "", cls=ev, ev=963),
            input_row("Metal Band", eats("1,233", ["963 + 270 jewels a day, 1 band each"], ramp=True), "1,390", "1,644",
                      chg(2200, None, "/day", "from Import Hub"), "covered", "", cls=ev, ev=1233),
        ]
        ci = [input_row("Fabric (Expensive)", eats("6,142", ["7 clothing shops 3,071 expensive garments a day × 2 fabric"]), "7,280", "6,612",
                        chg(11600, None, "/day", "from Import Hub"), "covered", "needs 6,900 with the margin", ev=6142),
              input_row("Fabric (Cheap)", eats("6,996", ["7 clothing shops 3,498 cheap garments a day × 2 fabric"]), "7,280", "7,770",
                        chg(11600, None, "/day", "from Import Hub"), "covered", "needs 7,900 with the margin", ev=6996)]
        cneed, cwhy = {30: 15, 60: 17}, "needs {n} of its 24 hours"
    CL = [("Clothing (Classic Expensive Female)", "#4 #12", 2, 30, 1440, 827, 1737), ("Clothing (Modern Expensive Female)", "#3 #10", 2, 30, 1440, 827, 1716),
          ("Clothing (Modern Expensive Male)", "#2 #11", 2, 30, 1440, 827, 1736), ("Clothing (Classic Expensive Male)", "#5 #9", 2, 30, 1440, 825, 1730),
          ("Clothing (Classic Cheap Female)", "#1", 1, 60, 1440, 914, 1638), ("Clothing (Modern Cheap Male)", "#8", 1, 60, 1440, 917, 1629),
          ("Clothing (Classic Cheap Male)", "#6", 1, 60, 1440, 913, 1630), ("Clothing (Modern Cheap Female)", "#7", 1, 60, 1440, 912, 1630)]
    cl = [line_row(item, f"Clothing Workstation · {slots} · {rate} an hour", m, 24, cneed[rate], n(mk), n(sh), f'{n(hd)}<span class="sub">of 2,000</span>', "covered",
                   cwhy.format(n=cneed[rate]), mode=mode, cls=ev if not every else "") for item, slots, m, rate, mk, sh, hd in CL]
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

    def parts(lines, inputs, a, b):
        tab = table(INPUT_COLS, inputs, b, INPUT_W)
        if not every and all("sb-ev" in r.get("cls", "") for r in inputs):
            tab = (f'<div class="sb-clear sb-only"><span class="check">{svg("tick")}</span>All {len(inputs)} Factory inputs cover what the lines need, with the chain margin</div>'
                   f'<div class="sb-evonly">{tab}</div>')
        ltab = table(LINE_COLS, lines, a, LINE_W)
        if not every and all("sb-ev" in r.get("cls", "") for r in lines):
            ltab = (f'<div class="sb-clear sb-only"><span class="check">{svg("tick")}</span>All {len(lines)} lines run the hours they need{" , as sized 24/7".replace(" ,", ",") if not dm else ""}</div>'
                    f'<div class="sb-evonly">{ltab}</div>')
        return (f'<p class="sb-part">Lines</p>{ltab}'
                f'<p class="sb-part">Factory inputs</p>{tab}')

    ramp = f'<div class="sb-ramp"><span class="ic">{svg("ramp")}</span><span>{RAMP}</span></div>' if dm else ""
    jcnt = "1 to change" if dm else "4 to change"
    jblock = block("IC", "Factory Jewelry", f'<span>{ic("truck")}<em>each morning from <b>Import Hub</b></em></span><span>{ic("right")}<em>ships to Jewelry Distrib. and Clothing Distr.</em></span>',
                   stat("Machines", "2", "1 short of hours") + stat("Staffed", "36", "h a day", "Hours a day someone is posted to a machine, all lines together"),
                   ramp + parts(jl, ji, "facJl", "facJi"), jcnt)
    cblock = block("IC", "Factory Clothing", f'<span>{ic("truck")}<em>each morning from <b>Import Hub</b></em></span><span>{ic("right")}<em>ships to Clothing Distr.</em></span>',
                   stat("Machines", "12", "all 24 h") + stat("Staffed", "288", "h a day"), parts(cl, ci, "facCl", "facCi"),
                   "2 to change" if not dm else "all covered")
    eparts = parts(el, ei, "facEl", "facEi")
    eblock = block("IC", "Factory Electronics", f'<span>{ic("truck")}<em>each morning from <b>Import Hub</b></em></span><span>{ic("right")}<em>ships to Jewelry Distrib.</em></span>',
                   stat("Machines", "2", "since day 72") + stat("Staffed", "48", "h a day"), eparts, "new")
    eflat = f"""
<div class="sb-flat"><span class="ic">{svg("gear")}</span><span>{site("IC", "Factory Electronics")} &nbsp; 2 lines and 10 inputs, too new to judge until day 76</span>{v("new")}</div>"""
    cflat = f"""
<div class="sb-flat"><span class="ic">{svg("gear")}</span><span>{site("IC", "Factory Clothing")} &nbsp; 8 lines and 2 factory inputs, all covered</span><span class="check">{svg("tick")}</span></div>"""
    if every:
        body = jblock + cblock + eblock
    elif dm:
        body = jblock + cflat + eflat
    else:
        body = jblock + cblock + eflat
    left = LEFT_DEMAND if dm else LEFT
    verdict_text = ("<b>1 line is short of its hours</b>; every Factory input covers what the shops use with the margin. 2 machines are too new to judge."
                    if dm else
                    "<b>1 line is short of its 24 hours; 1 Factory input tops up short and 4 sit inside the margin</b>. 2 machines are too new to judge.")
    return f"""
{subhead("Factories", every=every, left={**left, "Shops": 8})}
{tray(2, TOTAL_DEMAND if dm else TOTAL)}
{sizing(mode)}
{verdict(verdict_text)}
{body}
{staff_card(mode)}
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
    body = warehouses(arrived=False, diag=True)
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
<p class="sb-notchosen">Not chosen · Peter picked option A on 24 Sep 2026</p>
{subhead("Goods flow", left={**LEFT, "Shops": 8}, fourth=True, tabs_only=True, diagram=None)}
{tray(2, TOTAL)}
<div class="sb-flowbox" style="margin-top:22px">{flow_svg("cd")}{LEGEND}</div>
<div class="sb-detail">
  <div class="head"><h3>{site("GD", "Clothing Distr.")}</h3><span class="quiet">Warehouse · fed each morning · 11 lines</span>
    <a class="link" style="margin-left:auto" href="Warehouses.dc.html">Its rows on Warehouses</a></div>
  {io}
  <p class="sb-part" style="margin-top:18px">Held against need · the same rows and words as Warehouses</p>
  {table(WH_COLS, rows, "flowT", WH_W)}
</div>"""


# --------------------------------------------------------------------------
# PLAN A CHAIN: order ahead for a factory still being built
# --------------------------------------------------------------------------
PLAN = "Factory Electronics, 12 machines"


def pm(run: int, placed: int, planned: int) -> str:
    """The finished layout, a square a machine: running, placed but not running, still to place."""
    out = "".join(f'<i class="run" style="--k:{k}"></i>' for k in range(run))
    out += '<i class="placed"></i>' * (placed - run) + '<i class="plan"></i>' * (planned - placed)
    return f'<span class="sb-pm" data-tip="{run} running · {placed - run} placed, not running yet · {planned - placed} still to place">{out}</span>'


# ingredient, used by, per day, per week, company target, on order now, change
PLAN_ING = [
    ("Capacitors", "both watches · 2 each", 17280, 120960, 135500, "151,300 Smart Delivery · 7 Pier", None),
    ("Resistors", "both watches · 2 each", 17280, 120960, 135500, "151,300 Smart Delivery · 7 Pier", None),
    ("Transistors", "both watches · 2 each", 17280, 120960, 135500, "151,300 Smart Delivery · 7 Pier", None),
    ("Battery", "both watches", 8640, 60480, 67800, "20,200 Smart Delivery · 7 Pier", 47600),
    ("Copper Clad Laminate", "both watches", 8640, 60480, 67800, "25,300 Smart Delivery · 7 Pier", 42500),
    ("Microphone", "both watches", 8640, 60480, 67800, "40,400 Smart Delivery · 7 Pier", 27400),
    ("Integrated Circuits", "both watches", 8640, 60480, 67800, "50,500 Smart Delivery · 7 Pier", 17300),
    ("Speaker", "both watches", 8640, 60480, 67800, "60,500 Smart Delivery · 7 Pier", 7300),
    ("Glass", "both watches · 1 in 6", 1440, 10080, 11300, "11,800 Smart Delivery · 7 Pier", None),
    ("Plastic", "both watches · 1 in 6", 1440, 10080, 11300, "16,900 Smart Delivery · 7 Pier", None),
]
HUB_ELEC = {"Capacitors": ("127,900", "3,086"), "Resistors": ("127,900", "3,086"), "Transistors": ("127,900", "3,086"), "Battery": ("16,300", "429"),
            "Copper Clad Laminate": ("20,800", "514"), "Microphone": ("33,700", "829"), "Integrated Circuits": ("42,400", "1,029"),
            "Speaker": ("50,960", "1,234"), "Glass": ("9,950", "243"), "Plastic": ("14,350", "343")}
FIRST_FILL = "Battery 18,300 · Copper Clad Laminate 13,800 · Microphone 900"


def plan_chain() -> str:
    rows = ""
    for item, ws, run, placed, planned in [("ZanaMan Smartwatch", "Electronics Workstation", 1, 3, 6), ("Arty Fish Smartwatch", "Electronics Workstation", 1, 2, 6)]:
        rows += (f'<tr><td class="l">{item}<span class="sub">30/h rated · {ws}</span></td>'
                 f'<td class="l"><span class="step"><a href="#" aria-label="one machine fewer">−</a><b>{planned}</b><a href="#" aria-label="one machine more">+</a></span> {pm(run, placed, planned)}</td>'
                 f'<td>{planned * 30 * 24 * 7:,}</td><td class="l"><span class="quiet">no electronics shop yet: all export</span></td>'
                 f'<td class="l"><span class="ing">capacitors, resistors, transistors <b>×2</b>; battery, laminate, ICs, microphone, speaker <b>×1</b>; glass, plastic <b>1 in 6</b></span></td></tr>')
    ing = ""
    for item, used, day, week, target, on, change in PLAN_ING:
        ch = (f'<span class="sb-chg"><b>+{change:,}</b></span>' if change else '<span class="quiet">covered</span>')
        ing += (f'<tr><td class="l">{item}</td><td class="l" style="color:var(--ink-2)">{used}</td><td>{day:,}</td><td>{week:,}</td>'
                f'<td><span class="sb-uses" data-tip="{esc(f"{week:,} a week at the finished layout, 12 machines at 24/7. One {MARGIN}% margin for the whole chain: {week * 1.12:,.0f}. Rounded up to 100.")}">{target:,}</span></td>'
                f'<td class="l" style="color:var(--ink-2);font-family:Archivo,sans-serif;font-size:12.5px">{on}</td><td>{ch}</td></tr>')
    growth_seg = '<nav class="seg" aria-label="Growth"><a href="#">Market demand</a><a class="on" href="#">Plan a chain</a></nav>'
    return f"""
<div class="sb-growsub">{growth_seg}</div>
<div class="sb-planhead"><h2>Plan a chain</h2><span class="why" data-tip="The steppers set the finished layout. Machines already placed in the factory count as built; a placed machine with no recipe or nobody posted counts as built but not running, so a half-built factory reads right without anything to type." tabindex="0"><i>?</i></span>
  <span class="quiet">2 products · sold at an Electronics Store, which you do not run yet</span>
  <div class="aside"><span class="seg"><a href="#">Clothing Store</a><a href="#">Jewelry Store</a><a href="#">Gym</a></span>
    <select aria-label="Another business type"><option>Electronics Store · 2</option></select></div></div>
<div class="sb-build">
  <span class="lab">Built at</span><select aria-label="The factory this plan builds"><option>Factory Electronics · Industry City</option><option>A new factory</option></select>
  <span class="state">{pm(2, 5, 12)} <span>12 planned <i>·</i> 5 placed <i>·</i> 2 running</span></span>
  <span class="sb-pmleg" style="margin-left:auto"><span><span class="sb-pm"><i class="run"></i></span>running</span><span data-tip="Placed in the factory, but no recipe chosen or nobody posted to it yet"><span class="sb-pm"><i class="placed"></i></span>placed, not running</span><span><span class="sb-pm"><i class="plan"></i></span>to place</span></span>
</div>
<div class="planstats" style="margin-top:18px">
  <div class="planstat"><span class="lab">Machines</span><div class="v">12<small>5 placed · 2 running</small></div></div>
  <div class="planstat"><span class="lab">Made / week</span><div class="v">60,480<small>at the finished layout</small></div></div>
  <div class="planstat"><span class="lab">Raw material / week</span><div class="v">685,440<small>units to import</small></div></div>
</div>
<table style="margin-top:8px"><thead><tr><th>Product</th><th class="l">Machines, finished layout</th><th>Made / week</th><th class="l">Supplies</th><th class="l">Raw material / unit</th></tr></thead>
<tbody>{rows}</tbody></table>
<div class="sb-save is-saved">
  <span class="txt"><b>Order ahead for the finished factory.</b> Saving turns the Company targets below into the orders on Supply: the weekly imports go to the full layout now, so Monday's delivery (day 78) lands as the factory opens. Kept on this device for HART. YT.</span>
  <button type="button" class="btn2 primary dosave" data-save>{svg("tick")}<span>Save as plan</span></button>
  <span class="saved">{svg("tick")}Saved · 5 changes on Supply</span>
  <a class="link rm" href="#" data-save>Remove plan</a>
</div>
<div class="sb-fill"><span class="ic">{svg("truck")}</span><span><b>First fill before Monday:</b> the factory opens Friday, 4 rounds before the import lands. One urgent import: <span class="mono">{FIRST_FILL}</span>.</span></div>
<div class="sechead" style="margin-top:34px"><h2>Ingredients</h2><span class="why" data-tip="Company target: the finished layout's week plus one 12% margin for the whole chain, rounded up to 100, on top of what the running factories already eat. Change is what saving the plan puts on Supply's checklist." tabindex="0"><i>?</i></span></div>
<table class="ingtable"><thead><tr><th>Ingredient</th><th class="l">Used by</th><th>Per day</th><th>Per week</th><th>Company target</th><th class="l">On order now</th><th>Change</th></tr></thead>
<tbody>{ing}</tbody></table>
"""


def supply_plan() -> str:
    """Warehouses while a plan is saved and its machines are not all running."""
    kids = []
    for item, used, day, week, target, on, change in PLAN_ING:
        now = int(on.split()[0].replace(",", ""))
        setting = order(now, week if change else None, target if change else None, "7 Pier")
        if change:
            setting = setting.replace(f"{n(week)} + {MARGIN}% · ", f"plan {n(week)} + {MARGIN}% · ")
        tag = '<span class="sb-plantag" data-tip="What the planned layout will use, 12 machines at 24/7">plan</span>'
        why = (f"order ahead: the plan uses {week:,} a week, {target:,} with the margin" if change
               else f"ordered ahead · plan: {PLAN}")
        hand, draw = HUB_ELEC[item]
        kids.append(wh_row(item, hand, draw, draw, rail(41, 5), setting, f'<span class="sb-uses">{week:,}</span>{tag}', "new", why,
                           key=f"p{len(kids)}" if change else None, cls="sb-kid sb-open", kid="plan", wv=week))
    parent = wh_row(f'Plan: {PLAN}<button type="button" class="sb-kids" data-kids="plan" aria-expanded="true">{svg("chev")}+10</button>',
                    "572,160", "—", "—", rail(None, None, dead=True), '<span class="sub r">5 to raise</span>', "685,440", "new",
                    "ordered ahead for a factory still being built", cls="sb-gr sb-opened")
    body = f"""
<details class="sb-obj" open>
  <summary><span class="ic">{svg("warehouse")}</span>
    <span class="who">{site("GD", "Import Hub", go=True)}<span class="how"><span>{ic("ship")}<em>weekly from <b>7 Pier</b> and <b>1 Pier</b>, Monday · 4.5 days</em></span></span></span>
    <span class="sb-stats"></span><span class="cnt red">11 to change</span><span class="tog">{svg("chev")}</span></summary>
  <div class="body">{table(WH_COLS, [parent] + kids, "planT", WH_W)}
  <p class="sb-more">+ 5 other Import Hub lines to change, as on Warehouses &nbsp;<a class="link" href="Warehouses.dc.html">Warehouses</a></p></div>
</details>
<div class="sb-flat"><span class="ic">{svg("warehouse")}</span><span>{site("GD", "Clothing Distr.")} &nbsp; and {site("GD", "Jewelry Distrib.")} &nbsp; 1 change each, as on Warehouses</span><span></span></div>"""
    plan = f"""
<div class="sb-plan"><span class="ic">{svg("gear")}</span>
  <span><b>Plan saved: {PLAN}.</b> {pm(2, 5, 12)} &nbsp;5 placed · 2 running. Its inputs read <b>new</b> until all 12 run; then the plan clears itself.</span>
  <span class="aside"><a class="link" href="PlanChain.dc.html">Open the plan</a><a class="link" href="#">Remove</a></span></div>
<div class="sb-fill" data-chg="pf">{tick("First fill typed in")}<span class="ic">{svg("truck")}</span><span><b>First fill before Monday</b>, one urgent import: <span class="mono">{FIRST_FILL}</span>.</span></div>"""
    return f"""
{subhead("Warehouses", left={**LEFT, "Shops": 8, "Warehouses": 13})}
{tray(2, TOTAL + 6)}
{plan}
{verdict("<b>The plan adds 5 import levels to raise and a first fill</b>; its other 5 inputs are already ordered ahead. Nothing it holds reads idle while the factory is being built.")}
{body}
"""


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
{tray(2, TOTAL)}
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
{card("Uncut Gems (Expensive)", "short", "uses 5,040 a week (24/7); the level brings 4,800", f(("on hand", "4,342"), ("uses", "5,040/wk"), ("cover", "8.9 d")),
      chg(4800, 5700, "in stock"), "5,040 a week + one 12% chain margin · 7 Pier", key="w0")}
{card("Fabric (Cheap)", "tight", "covers the 80,640 a week it uses (24/7), not the 12% margin", f(("on hand", "63,824"), ("uses", "80,640/wk")),
      chg(80700, 90400, "in stock"), "80,640 + one 12% chain margin · 7 Pier", key="w3")}
<p class="more3">+ 3 more inside their margin: Fabric (Expensive), Metal Band, Uncut Gems (Cheap)</p>
{card("Idle stock · 12 lines", "idle", '7,000 drinks nothing draws (<a href="Shops.dc.html">the gyms have no plan</a>); 10 electronics parts hold 6 weeks. Tap to open.', f(("on hand", "579,160")))}
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
    fab_247 = (f'<table><tbody><tr><td class="l">Fabric (Expensive)</td><td>{chg(11600, 13000, "/day")}</td><td class="l">'
               f'{v("tight", "covers the 11,520 a day, not the margin")}</td></tr></tbody></table>')
    fab_dem = (f'<table><tbody><tr><td class="l">Fabric (Expensive)</td><td>11,600</td><td class="l">'
               f'{v("covered", "needs 6,900 with the margin")}</td></tr></tbody></table>')

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
    <p class="sb-part" style="margin:14px 0 0">Fabric (Expensive) into Factory Clothing: five answers today, one word per sizing</p>
    <div class="sb-pair">
      {place("clock247", "Sized 24/7 · Supply, the factory page, Goods flow", fab_247)}
      {place("target", "Sized for demand · the same places", fab_dem)}
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
    $$('[data-save]').forEach(a => a.addEventListener('click', () => a.closest('.sb-save').classList.toggle('is-saved')));
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
    const kids = (b) => { const t = b.closest('table'), id = b.dataset.kids, rows = $$('tr[data-kid="' + id + '"]', t);
      const open = !rows.some(r => r.classList.contains('sb-open')); rows.forEach(r => r.classList.toggle('sb-open', open));
      b.closest('tr').classList.toggle('sb-opened', open); b.setAttribute('aria-expanded', open ? 'true' : 'false'); };
    $$('.sb-kids').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); kids(b); }));
    $$('tr.sb-gr').forEach(r => r.addEventListener('click', (e) => { if (e.target.closest('a,input,button')) return; const b = $('.sb-kids', r); if (b) kids(b); }));
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
    ("Main.dc.html", "Shops", lambda: shops({"s0", "s1"}), DESK, 990, ""),
    ("Warehouses.dc.html", "Warehouses · arrived from a finding", lambda: warehouses(), DESK, 1590, ""),
    ("Factories.dc.html", "Factories · sized 24/7", lambda: factories(), DESK, 1610, ""),
    ("FactoriesDemand.dc.html", "Factories · sized for demand", lambda: factories(mode="demand"), DESK, 1250, ""),
    ("FactoriesAll.dc.html", "Factories · Everything, sized 24/7", lambda: factories(every=True), DESK, 2600, "sb-every"),
    ("ShopsEmpty.dc.html", "Shops · nothing to change", shops_empty, DESK, 830, ""),
    ("Phone.dc.html", "Phone · Warehouses", phone, PHONE, 1560, "phone"),
    ("FlowToggle.dc.html", "Goods flow · a diagram view on each tab (chosen)", flow_toggle, DESK, 930, "sb-diag"),
    ("FlowTab.dc.html", "Goods flow B · not chosen", flow_tab, DESK, 1370, "sb-dim"),
    ("Words.dc.html", "One word per supply fact (R8)", vocabulary, DESK, 1040, ""),
    ("PlanChain.dc.html", "Plan a chain · order ahead, factory half built", plan_chain, DESK, 1350, ""),
    ("SupplyPlan.dc.html", "Warehouses · while a plan is saved", supply_plan, DESK, 1600, ""),
]
ACTIVE = {"PlanChain.dc.html": "growth"}
# the tab links point at artboards; Shops is the entry artboard
LINK_FIX = {"Shops.dc.html": "Main.dc.html"}

TIPS = {
    "Main.dc.html": "Shops: every shelf against tomorrow morning's round. It opens on the 10 rows that need a change; Everything lists all 100. The checklist is the tick at the head of each row, and the figure to type sits where the setting lives (Daily top-up). Tick a row: the truck drives along the road, the tab badge counts down. Two gym rows are ticked already. Click a heading to sort; a third click puts the usual order back.",
    "Warehouses.dc.html": "Warehouses: every depot, including the second tier that no import reaches (#78). Each head says what fills it and what it takes a day, which is what the site upstream has to deliver. A daily round reads as a gauge, a weekly import as the rail from the depot page. An import's figure to type is what the routes use plus one 12% margin for the whole chain; hover Uses / week for the chain. Idle lines fold into one group: click it. This board arrived from the Today finding on Metal Band: that row and its depot are lit, and the crumb clears it.",
    "Factories.dc.html": "Factories, sized 24/7 (today's behaviour): every line should run round the clock, and its Factory inputs top up the rated need plus the one chain margin. The switch under the checklist picks 24/7 or Demand and is remembered per device; click Demand to go to the next board. Below the lines: Staffing for factory lines, the hours, people and wages the sizing asks for (the top vote, 42).",
    "FactoriesDemand.dc.html": "Factories, sized for demand: what the shops at the end of each chain use, plus one 12% margin for the whole chain. Two jewelry shops have traded 6 days, so their demand is a straight line and Factory Jewelry says it may still be ramping. The inputs all cover the need; the clothing lines need 15 to 17 of their 24 hours, and Staffing proposes cutting 17 factory workers.",
    "FactoriesAll.dc.html": "Everything on Factories, sized 24/7: each line's day, a cell an hour; red outlines are hours needed and not staffed. Fabric reads tight here and on every other page: the top-up covers the rated need, not the one chain margin. Hover Eats / day for the chain.",
    "ShopsEmpty.dc.html": "A tab with nothing to change: the badge turns into a tick, the shelf gets its moment, and the three closest to the edge still show, so the all-clear has something to stand on. Hover the drawing.",
    "Phone.dc.html": "390 px: rows become cards, the setting to type gets its own line, the tabs fill the width. The same ticks and the same words.",
    "FlowToggle.dc.html": "Chosen (Peter, 24 Sep). Goods flow is a view of the tab you are on (the icon pair by Needs a change). Click a site and the list opens on its rows, lit. Nothing on the diagram has its own table any more.",
    "FlowTab.dc.html": "Not chosen (Peter, 24 Sep): Goods flow as a fourth tab. Kept for the record; option A, the diagram view on each tab, is the one to port.",
    "PlanChain.dc.html": "Growth › Plan a chain for a factory being built. The steppers set the finished layout (12 machines); what is already in Factory Electronics counts by itself: 5 placed, 2 running, the rest dashed. Save as plan turns the Company targets into the orders on Supply now, so Monday's import lands as the factory opens; a first fill covers the days before. Kept per character on this device; click Remove plan / Save as plan to see both states.",
    "SupplyPlan.dc.html": "Supply while the plan is saved: the ordered-ahead inputs read new ('ordered ahead · plan: Factory Electronics, 12 machines') instead of idle, the five levels to raise are on the checklist, and the first fill is one ticked line. The plan clears itself once all 12 machines run, or on Remove.",
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
        "Main.dc.html": (0, 0), "Warehouses.dc.html": (0, 1), "Factories.dc.html": (0, 2), "FactoriesDemand.dc.html": (0, 3),
        "FactoriesAll.dc.html": (1, 0), "ShopsEmpty.dc.html": (1, 1), "Phone.dc.html": (1, 2),
        "FlowToggle.dc.html": (2, 0), "FlowTab.dc.html": (2, 1),
        "Words.dc.html": (3, 0),
        "PlanChain.dc.html": (4, 0), "SupplyPlan.dc.html": (4, 1),
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
                .replace("__MAST__", masthead(ACTIVE.get(name, "supply"))).replace("__BODY__", body)
                .replace("__PROPS__", json.dumps(props, separators=(",", ":"))).replace("__LOGIC__", LOGIC))
        (ROOT / name).write_text(page, encoding="utf-8", newline="\n")
        if preview_dir:
            out = Path(preview_dir)
            out.mkdir(parents=True, exist_ok=True)
            for theme in ("", "light"):
                (out / f"{name.split('.')[0]}{'-light' if theme else ''}.html").write_text(
                    PREVIEW.replace("__TITLE__", title).replace("__FONTS__", FONTS.replace("&", "&amp;")).replace("__CSS__", css(theme or "dark"))
                    .replace("__THEME__", theme).replace("__CLS__", cls).replace("__W__", str(w)).replace("__MAST__", masthead(ACTIVE.get(name, "supply")))
                    .replace("__BODY__", body).replace("__WIRE__", WIRE), encoding="utf-8", newline="\n")
        r, c = layout[name]
        x = sum(b["w"] + 120 for k, b in boards.items() if layout[k][0] == r and layout[k][1] < c)
        boards[name] = {"x": x, "y": row_y[r], "w": w, "h": h, "title": title, "is_interactive": True}
        order.append(name)
        notes["try-" + name.split(".")[0].lower()] = {"x": x, "y": row_y[r] - 280, "w": 620, "maxH": 230, "text": TIPS[name]}
    wx = boards["Warehouses.dc.html"]["x"]
    notes["decided-sizing"] = {"x": wx + 680, "y": row_y[0] - 280, "w": 620, "maxH": 230, "fill": "green",
                               "text": "Decided (Peter, 24 Sep): the player picks the sizing, 24/7 (rated output, today's behaviour) or Demand (what the shops at the end use), "
                                       "on the Factories tab. One 12% margin for the whole chain, import to sale, never stacked per hop; the daily factory top-ups carry the same one. "
                                       "Warehouses is drawn sized 24/7, tagged '24/7'; hover Uses / week for the chain."}
    titles = {0: "Supply by object: Shops, Warehouses, Factories", 1: "States: everything, nothing to change, phone",
              2: "Goods flow: option A chosen", 3: "One word per supply fact", 4: "Plan a chain: order ahead for a factory being built"}
    for r, t in titles.items():
        width = max(b["x"] + b["w"] for k, b in boards.items() if layout[k][0] == r)
        notes[f"title-{r}"] = {"x": 0, "y": row_y[r] - 520, "text": t, "kind": "title1", "maxW": width}
    index = {"v": 3, "createdOnFiles": {"v": 1, "at": CREATED_AT}, "title": "Big Copilot Supply by object", "launch": {"view": "canvas"},
             "pages": [], "boards": boards, "order": order, "notes": notes, "designSystems": []}
    (ROOT / "canvas.json").write_text(json.dumps(index, indent=1), encoding="utf-8", newline="\n")
    print("wrote", len(order), "artboards")


if __name__ == "__main__":
    arg = sys.argv[sys.argv.index("--preview") + 1] if "--preview" in sys.argv else None
    build(arg)
