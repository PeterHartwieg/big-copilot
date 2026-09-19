"""Generates the site-panel canvas: project/*.dc.html and project/canvas.json.

The brief is docs/site-panel-detail-scope.md. One panel, six artboards: a shop, a shop
too new to judge, an office, a warehouse, a factory and a home. The board's own
stylesheet is borrowed from mockup/revamp/build_canvas.py so the two never drift; every
class added here carries the sp- prefix the port will need anyway.

The canvas is published at https://claude.ai/artifact/9FUpajdLn5KqLSricga5BA.
Never hand-edit project/: change this and rerun. `--preview` also writes plain HTML
copies into _preview/ for measuring in a browser.
"""
from __future__ import annotations

import html
import json
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE / "project"
sys.path.insert(0, str(HERE.parent / "revamp"))
from build_canvas import CSS as BOARD_CSS  # noqa: E402

CREATED_AT = "2026-09-19T12:00:00Z"
FONTS = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"

# --------------------------------------------------------------------------
# the panel's own additions, all under sp-
# --------------------------------------------------------------------------
SP_CSS = r"""
.board{--sp-on:#08130d;min-height:0}
.board.light{--sp-on:#ffffff}
:where(.board) svg:where([aria-hidden]){width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.sp-i{display:inline-grid;place-items:center;flex:none}
.sp-i svg,.sp-ico svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.sp-ico{width:28px;height:28px;border-radius:8px;background:var(--raised);display:grid;place-items:center;color:var(--ink-2);flex:none;transition:transform .3s cubic-bezier(.34,1.56,.64,1),color .2s}
section:hover>.sechead .sp-ico,.sp-find:hover .ev{color:var(--accent)}
section:hover>.sechead .sp-ico{transform:rotate(-8deg) scale(1.08)}
.sp-read{min-height:18px;margin-top:12px;font:500 12px/1.5 "IBM Plex Mono",monospace;color:var(--ink-3)}
.sp-read b{color:var(--ink);font-weight:500}

/* a finding lights the block that holds its evidence ------------------------ */
[data-block]{transition:opacity .25s,outline-color .25s;outline:1px solid transparent;outline-offset:14px;border-radius:6px;scroll-margin-top:140px}
.sp-focus [data-block]:not(.sp-lit){opacity:.3}
[data-block].sp-lit{outline-color:var(--accent)}
.sp-finds{display:flex;flex-direction:column;border-top:1px solid var(--rule);margin-top:26px}
.sp-find{display:grid;grid-template-columns:22px 28px 1fr auto 24px;gap:0 12px;align-items:center;min-height:46px;padding:6px 6px 6px 0;box-sizing:border-box;border-bottom:1px solid var(--rule-soft);text-decoration:none;color:inherit;border-radius:0 6px 6px 0;transition:background .15s}
.sp-find:hover,.sp-find.arrived{background:var(--surface);color:inherit}
.sp-find .mark{width:8px;height:8px;border-radius:50%;justify-self:center;transition:transform .2s cubic-bezier(.34,1.56,.64,1)}
.sp-find:hover .mark{transform:scale(1.6)}
.sp-find.crit .mark{background:var(--neg)}.sp-find.watch .mark{background:var(--warn)}.sp-find.opp .mark{background:var(--accent)}
.sp-find.arrived .mark{animation:sp-ping 1.6s ease-out infinite}
@keyframes sp-ping{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--warn) 60%,transparent)}100%{box-shadow:0 0 0 10px transparent}}
.sp-find .ev{color:var(--ink-3);transition:color .15s,transform .25s cubic-bezier(.34,1.56,.64,1)}
.sp-find:hover .ev{transform:translateY(3px)}
.sp-find .what{font-weight:600;font-size:14px}
.sp-find .more{grid-column:3/5;max-height:0;overflow:hidden;opacity:0;font-size:12.5px;color:var(--ink-2);transition:max-height .28s ease,opacity .2s,margin .28s}
.sp-find:hover .more,.sp-find.arrived .more{max-height:60px;opacity:1;margin:2px 0 4px}
.sp-find .amt{font-family:"IBM Plex Mono",monospace;font-size:13.5px;text-align:right;white-space:nowrap}
.sp-find .amt small{display:block;font-size:10.5px;color:var(--ink-3);letter-spacing:.04em}
.sp-find .go{color:var(--ink-3);display:grid;place-items:center;transition:transform .2s,color .15s}
.sp-find:hover .go{color:var(--accent);transform:translateY(3px)}
.sp-find.extra{display:none}.sp-finds.all .sp-find.extra{display:grid;animation:rowin .3s ease}
.sp-findmore{margin:10px 0 0;font-size:12.5px;color:var(--ink-3)}

/* the head: a lamp says whether the doors are open --------------------------- */
.sp-lamp{width:10px;height:10px;border-radius:50%;background:var(--accent);display:inline-block;margin-left:12px;vertical-align:3px;animation:sp-glow 2.4s ease-in-out infinite}
.sp-lamp.off{background:var(--neg);animation:none}
@keyframes sp-glow{50%{box-shadow:0 0 0 5px var(--accent-soft)}}
.sp-pre{display:inline-flex;gap:6px;margin-left:14px;vertical-align:-7px}
.sp-pre span{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;color:var(--accent);background:var(--accent-soft);transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.sp-pre span.no{color:var(--neg);background:color-mix(in srgb,var(--neg) 14%,transparent);animation:sp-nag 2.2s ease-in-out infinite}
.sp-pre span:hover{transform:translateY(-3px)}
@keyframes sp-nag{0%,88%,100%{transform:none}92%{transform:rotate(-7deg)}96%{transform:rotate(7deg)}}

/* where this site stands: its place by the last seven days' profit -------------- */
.sp-rank{display:inline-flex;align-items:center;gap:9px;margin-left:16px;vertical-align:4px;padding:5px 10px 5px 9px;border-radius:7px;border:1px solid var(--rule);background:var(--surface);font:500 13px/1 "IBM Plex Mono",monospace;letter-spacing:0;color:var(--ink);cursor:default;transition:border-color .15s,transform .25s cubic-bezier(.34,1.56,.64,1)}
.sp-rank small{font-size:11px;color:var(--ink-3)}
.sp-rank.top{border-color:var(--accent);color:var(--accent)}
.sp-rank:hover{transform:translateY(-2px);border-color:var(--ink-3)}
.sp-rank .ladder{display:inline-flex;align-items:flex-end;gap:1px;height:12px}
.sp-rank .ladder i{width:2px;border-radius:1px;background:var(--ink-3);opacity:.55;height:calc(3px + var(--t)*9px);transition:height .3s}
.sp-rank .ladder i.me{background:currentColor;opacity:1;height:12px;width:3px}
.sp-rank:hover .ladder i{animation:sp-hop .5s ease-in-out;animation-delay:calc(var(--k)*12ms)}

/* tiles ------------------------------------------------------------------------ */
.sstat{position:relative}
.sstat .v small{font-size:12px;color:var(--ink-3);margin-left:6px;letter-spacing:0}
.sstat .chip{vertical-align:3px;margin-left:8px}
.sstat .chip svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.sp-flag{position:absolute;top:14px;right:14px;width:8px;height:8px;border-radius:50%;background:var(--neg);animation:sp-ping2 1.6s ease-out infinite}
@keyframes sp-ping2{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--neg) 60%,transparent)}100%{box-shadow:0 0 0 10px transparent}}
.sp-cost{display:flex;height:6px;gap:1px;margin-top:14px;border-radius:3px;overflow:hidden}
.sp-cost i{display:block;height:100%;min-width:2px;background:color-mix(in srgb,var(--ink) var(--k,40%),var(--surface));transition:transform .15s,filter .15s;transform-origin:bottom}
.sp-cost i:hover{transform:scaleY(2);filter:brightness(1.25)}
.sp-cost i.p{background:var(--accent)}.sp-cost i.l{background:var(--neg)}
.sp-tread{min-height:15px;margin-top:6px;font:500 10.5px/1.4 "IBM Plex Mono",monospace;letter-spacing:.04em;color:var(--ink-3)}
.sp-tread b{color:var(--ink);font-weight:500}

/* standards -------------------------------------------------------------------- */
.sp-std{display:flex;align-items:flex-end;gap:30px;flex-wrap:wrap}
.sp-big{font:500 38px/1 "IBM Plex Mono",monospace;letter-spacing:-.03em}
.sp-big small{font-size:14px;color:var(--ink-3);margin-left:2px}
.sp-eq{position:relative;display:flex;gap:16px;align-items:flex-end;padding:0 6px}
.sp-eq .th{position:absolute;left:0;right:-14px;bottom:72px;border-top:1px dashed var(--ink-3);opacity:.7;pointer-events:none}
.sp-eq .th::after{content:"80";position:absolute;right:0;top:-13px;font:500 9px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.sp-eqb{display:flex;flex-direction:column;align-items:center;gap:6px;color:var(--ink-3);cursor:default;min-width:24px}
.sp-eqb .t{position:relative;width:14px;height:60px;border-radius:4px;background:var(--raised);overflow:hidden}
.sp-eqb .t b{position:absolute;left:0;right:0;bottom:0;height:var(--v);background:var(--accent);border-radius:4px;transform-origin:bottom;transform:scaleY(0);transition:transform .7s cubic-bezier(.34,1.56,.64,1)}
.rv.in .sp-eqb .t b{transform:none}
.sp-eqb.low .t b{background:var(--warn)}.sp-eqb.bad .t b{background:var(--neg)}
.sp-eqb.low{color:var(--warn)}.sp-eqb.bad{color:var(--neg)}
.sp-eqb:hover .t b{transform:scaleY(1.06)}
.sp-lamps{display:grid;gap:10px;margin-left:auto}
.sp-lamprow{display:flex;gap:10px;align-items:center}
.sp-lampb{position:relative;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;border:1px solid transparent;cursor:default;transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.sp-lampb svg{width:19px;height:19px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.sp-lampb.miss{border-color:var(--neg);color:var(--neg);background:color-mix(in srgb,var(--neg) 12%,transparent)}
.sp-lampb.miss::after{content:"";position:absolute;left:5px;right:5px;top:50%;border-top:1.5px solid var(--neg);transform:rotate(-45deg)}
.sp-lampb:hover{transform:translateY(-3px) scale(1.06)}
.sp-lampb:hover svg{animation:sp-wiggle .5s ease-in-out}
.sp-lampb.music:hover svg{animation:sp-bounce .32s ease-in-out infinite alternate}
.sp-lampb.door:hover svg{animation:sp-swing .7s ease-in-out}
.sp-lampb .drip{transition:none}
.sp-lampb.sink:hover .drip{animation:sp-drip .7s ease-in infinite}
@keyframes sp-wiggle{25%{transform:rotate(-9deg)}75%{transform:rotate(9deg)}}
@keyframes sp-bounce{to{transform:translateY(-4px) rotate(-6deg)}}
@keyframes sp-swing{50%{transform:perspective(60px) rotateY(-38deg)}}
@keyframes sp-drip{0%{transform:translateY(-2px);opacity:0}30%{opacity:1}100%{transform:translateY(6px);opacity:0}}
.sp-role{font:600 10px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;padding:4px 6px;border-radius:4px;border:1px solid var(--warn);color:var(--warn)}
.sp-sep{width:1px;height:28px;background:var(--rule);margin:0 4px}

/* pull ------------------------------------------------------------------------- */
.sp-promorow{display:flex;align-items:center;gap:16px}
.sp-promo{position:relative;flex:1;display:flex;height:16px;border-radius:8px;border:1px dashed var(--rule);overflow:hidden}
.sp-promo i{display:block;height:100%;transform-origin:left;transform:scaleX(0);transition:transform .8s cubic-bezier(.2,.7,.2,1)}
.rv.in .sp-promo i{transform:none}
.sp-promo .tr{background:var(--ink-2)}.sp-promo .mk{background:var(--accent);transition-delay:.25s}
.sp-promo i:hover{filter:brightness(1.2)}
.sp-promo u{position:absolute;top:5px;right:12px;width:5px;height:5px;border-radius:50%;background:var(--accent);opacity:0}
section:hover .sp-promo u{animation:sp-pull 1.3s ease-in infinite}
.sp-promo u:nth-of-type(2){right:34px;animation-delay:.35s!important}.sp-promo u:nth-of-type(3){right:58px;animation-delay:.7s!important}
@keyframes sp-pull{0%{transform:translateX(30px);opacity:0}40%{opacity:.9}100%{transform:translateX(-46px);opacity:0}}
section:hover>.sechead .sp-ico.magnet{transform:rotate(90deg) scale(1.1)}
.sp-minis{display:flex;gap:22px;margin-top:16px;font:500 13px/1 "IBM Plex Mono",monospace;color:var(--ink)}
.sp-minis span{display:inline-flex;align-items:center;gap:7px;cursor:default}
.sp-minis .sp-i{color:var(--ink-3)}
.sp-wave{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;margin-top:16px;padding-top:14px;border-top:1px solid var(--rule-soft);font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink-2);cursor:default}
.sp-wave .sp-i{color:var(--warn)}
.sp-wave:hover .sp-i svg{animation:sp-surf 1s ease-in-out infinite}
@keyframes sp-surf{50%{transform:translateX(3px) translateY(-2px)}}
.sp-wavebar{display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--rule-soft)}
.sp-wavebar .base{background:var(--ink-2)}
.sp-wavebar .lift{background:repeating-linear-gradient(135deg,var(--warn) 0 4px,transparent 4px 7px)}
.sp-pips{display:inline-flex;gap:3px;align-items:center}
.sp-pips i{width:6px;height:6px;border-radius:50%;background:var(--rule)}
.sp-pips i.on{background:var(--warn)}

/* hours ------------------------------------------------------------------------ */
.hc.slack{background-image:repeating-linear-gradient(135deg,transparent 0 3px,color-mix(in srgb,var(--ink) 35%,transparent) 3px 4.5px)}
.hours.sp-showcap .hc:not(.cap),.hours.sp-showidle .hc:not(.slack){opacity:.2}
.hours.sp-showcap .hc.cap,.hours.sp-showidle .hc.slack{animation:sp-cell .8s ease-in-out infinite}
@keyframes sp-cell{50%{transform:scale(1.22)}}
.sp-hchips{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.sp-hchip{display:inline-flex;align-items:center;gap:9px;min-height:34px;padding:0 12px;border-radius:7px;border:1px solid var(--rule);background:var(--surface);font:500 12px/1.3 "IBM Plex Mono",monospace;color:var(--ink-2);cursor:default;transition:border-color .15s,transform .2s}
.sp-hchip:hover{border-color:var(--ink-3);transform:translateY(-2px)}
.sp-hchip b{color:var(--ink);font-weight:500}
.sp-hchip .sp-sw{width:12px;height:12px;border-radius:3px;flex:none}
.sp-hchip.cap .sp-sw{box-shadow:inset 0 0 0 1.5px var(--neg)}
.sp-hchip.cap .sp-i{color:var(--neg)}
.sp-hchip.idle .sp-sw{background-image:repeating-linear-gradient(135deg,transparent 0 3px,var(--ink-2) 3px 4.5px);background-color:var(--raised)}
.sp-hchip .fix{display:inline-flex;align-items:center;gap:5px;color:var(--accent)}

/* crew ------------------------------------------------------------------------- */
.person .sp-i{color:var(--warn);margin-left:-2px}
.person .sp-i svg{width:12px;height:12px}
.sp-dems{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.sp-dem{display:inline-flex;align-items:center;gap:7px;min-height:30px;padding:0 10px;border-radius:6px;background:var(--raised);font-size:12.5px;color:var(--ink-2);cursor:default;transition:transform .2s}
.sp-dem:hover{transform:translateY(-2px)}
.sp-dem b{font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink)}
.sp-dem.quit{background:color-mix(in srgb,var(--neg) 14%,transparent);color:var(--neg)}
.sp-dem.quit b{color:var(--neg)}
.sp-dem:hover .sp-i svg{animation:sp-wiggle .5s ease-in-out}
.sp-pri{display:inline-flex;gap:2px;align-items:flex-end;height:11px}
.sp-pri i{width:3px;border-radius:1px;background:var(--rule)}
.sp-pri i:nth-child(1){height:5px}.sp-pri i:nth-child(2){height:8px}.sp-pri i:nth-child(3){height:11px}
.sp-pri i.on{background:var(--warn)}.sp-pri.hi i.on{background:var(--neg)}

/* the roster: the plan to type, on the hour grid's own columns ------------------------ */
.sp-ba{display:flex;gap:40px;align-items:flex-end;flex-wrap:wrap;margin-bottom:18px}
.sp-ba>div{cursor:default}
.sp-ba .lab{display:block;font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px}
.sp-ba .v{font:500 22px/1 "IBM Plex Mono",monospace;letter-spacing:-.02em;display:flex;align-items:center;gap:8px}
.sp-ba .v s{font-size:14px;color:var(--ink-3);text-decoration-thickness:1px}
.sp-ba .v .sp-i{color:var(--ink-3)}
.sp-typed{margin-left:auto;display:flex;align-items:center;gap:10px;font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.sp-typed b{color:var(--ink);font-weight:500}
.sp-ring{width:30px;height:30px;border-radius:50%;background:conic-gradient(var(--accent) calc(var(--p)*1%),var(--rule) 0);display:grid;place-items:center;transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
.sp-ring::after{content:"";width:22px;height:22px;border-radius:50%;background:var(--ground)}
.sp-ring.bump{transform:scale(1.25)}
.sp-steps{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.sp-step{display:inline-flex;align-items:center;gap:9px;min-height:36px;padding:0 12px 0 9px;border-radius:8px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);font:500 12.5px/1 Archivo,sans-serif;cursor:pointer;transition:border-color .15s,transform .2s}
.sp-step:hover{border-color:var(--ink-3);transform:translateY(-1px)}
.sp-step .box{width:16px;height:16px;border-radius:5px;border:1.5px solid var(--rule);display:grid;place-items:center;color:var(--sp-on);transition:all .25s cubic-bezier(.34,1.56,.64,1)}
.sp-step .box svg{width:10px;height:10px;stroke-width:2.6;opacity:0}
.sp-step.done .box{background:var(--accent);border-color:var(--accent)}.sp-step.done .box svg{opacity:1}
.sp-step.done{color:var(--ink-3)}
.sp-step small{font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.sp-daytabs a{position:relative;min-width:30px;text-align:center}
.sp-daytabs a u{position:absolute;left:-4px;top:50%;width:6px;border-top:1.5px solid var(--ink-3);text-decoration:none}
.sp-day{display:none}.sp-day.on{display:block}
.sp-grow{position:relative;display:grid;grid-template-columns:40px repeat(24,minmax(0,1fr));gap:3px;align-items:center;min-height:38px}
.sp-grow::before{content:"";grid-column:2/-1;grid-row:1;height:32px;border-radius:7px;background:var(--raised);opacity:.45}
.sp-grow .lab{grid-column:1;grid-row:1;font:600 10px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;color:var(--ink-3);cursor:default}
.sp-grow .hh{font:500 9px/1 "IBM Plex Mono",monospace;color:var(--ink-3);text-align:center;padding-bottom:6px}
.sp-grow.need{min-height:30px;align-items:end;margin-bottom:4px}
.sp-grow.need::before{display:none}
.sp-grow.need .lab{align-self:end;padding-bottom:2px}
.sp-need{grid-row:1;height:calc(var(--n)*8px);border-radius:2px;background:var(--ink-2);transition:transform .15s;transform-origin:bottom}
.sp-need:hover{transform:scaleY(1.2)}
.sp-shift{grid-row:1;z-index:1;height:32px;min-width:0;border-radius:7px;border:1px solid color-mix(in srgb,var(--accent) 45%,transparent);background:var(--accent-soft);color:var(--ink);display:flex;align-items:center;gap:7px;padding:0 10px;font:500 12.5px/1 Archivo,sans-serif;white-space:nowrap;overflow:hidden;cursor:pointer;transition:opacity .3s,transform .35s cubic-bezier(.34,1.56,.64,1),outline-color .15s;outline:1.5px solid transparent;outline-offset:1px;transform-origin:left;box-sizing:border-box}
.sp-shift small{margin-left:auto;font:500 10.5px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.sp-shift .sp-i svg{width:12px;height:12px}
.sp-shift.clean,.sp-shift.security{background:var(--raised);border-color:var(--rule)}
.sp-shift.hire{background:none;border:1px dashed var(--warn);color:var(--warn);cursor:default}.sp-shift.hire small{color:var(--warn)}
.sp-shift .pin{color:var(--warn)}
.sp-shift:hover{transform:translateY(-2px)}
.sp-shift.done{opacity:.4;text-decoration:line-through}
.sp-shift .tick{display:none;color:var(--accent)}.sp-shift.done .tick{display:inline-grid;animation:pop .35s cubic-bezier(.34,1.56,.64,1)}
.sp-me{outline-color:var(--accent)!important}
.person.sp-me{outline:1.5px solid var(--accent);outline-offset:1px}
.sp-hc{display:flex;flex-wrap:wrap;gap:10px 26px;align-items:center;margin-top:16px;padding-top:14px;border-top:1px solid var(--rule-soft)}
.sp-hc>span{display:inline-flex;align-items:center;gap:9px;font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink-2);cursor:default}
.sp-hc .code{width:26px;height:26px;border-radius:50%;background:var(--raised);display:grid;place-items:center;font:600 9.5px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.sp-hc .sp-dots{padding:0;gap:4px}
.sp-dot.bench{background:none;box-shadow:inset 0 0 0 1.5px var(--ink-2);position:relative}
.sp-dot.bench::after{content:"";position:absolute;inset:3px;border-radius:50%;background:var(--ink-2)}
.sp-dot.hire{background:none;box-shadow:none;border:1.5px dashed var(--warn);box-sizing:border-box}
.sp-hc .new{color:var(--warn)}
.sp-hc .new b{font-weight:600}

.sp-hit{animation:sp-hit .9s ease-in-out infinite}
@keyframes sp-hit{50%{box-shadow:0 0 0 6px var(--accent-soft)}}
.sp-pre span.unk{color:var(--ink-3);background:none;box-shadow:inset 0 0 0 1px var(--rule)}
.sp-rank.none{border-style:dashed;color:var(--ink-3)}
.chip.none{border:1px dashed var(--rule);color:var(--ink-3)}
.sp-spark{display:flex;align-items:flex-end;gap:3px;height:24px;margin-top:10px}
.sp-spark i{flex:1;height:var(--v);border-radius:1.5px;background:var(--rule);transition:transform .15s;transform-origin:bottom}
.sp-spark i.l{background:var(--ink-2)}.sp-spark.dn i.l{background:var(--neg)}.sp-spark.up i.l{background:var(--accent)}
.sp-spark i:hover{transform:scaleY(1.15)}
.sp-meter{height:6px;border-radius:3px;background:var(--rule);margin-top:14px;overflow:hidden}
.sp-meter i{display:block;height:100%;width:var(--w);background:var(--accent);border-radius:3px}
.sp-meter.bad i{background:var(--neg)}
.sp-ceil{display:flex;gap:10px;margin-top:11px;color:var(--ink-3)}
.sp-ceil .on{color:var(--neg)}
.sp-eqb.unk .t{background:none;border:1px dashed var(--rule);box-sizing:border-box}
.sp-lampb.ok{background:var(--accent-soft);color:var(--accent)}
.sp-lampb.unk{border:1px dashed var(--rule);color:var(--ink-3)}
.sp-wavebar.unk{background:repeating-linear-gradient(135deg,var(--ink-3) 0 4px,transparent 4px 7px);opacity:.6}
.sp-ba .sp-meter{width:150px;margin-top:0}
.sp-ba .sp-meter i{background:var(--ink-2)}
.sp-need.c{background:repeating-linear-gradient(135deg,var(--neg) 0 3px,transparent 3px 5px);box-shadow:inset 0 0 0 1px var(--neg)}
.sp-need.s{background:none;box-shadow:inset 0 0 0 1px var(--ink-3);border:0}
.sp-frag{grid-row:1;z-index:1;height:32px;border-radius:4px;background:color-mix(in srgb,var(--ink) 22%,var(--surface));opacity:0;transform:scaleX(.6);transition:opacity .3s,transform .4s cubic-bezier(.34,1.56,.64,1);transition-delay:calc(var(--k)*14ms);pointer-events:none}
.sp-gantt.now .sp-frag{opacity:1;transform:none}
.sp-gantt.now .sp-shift{opacity:0;transform:scaleX(.9);pointer-events:none}
.sp-gantt.now .sp-grow.need{opacity:.35}
.sp-gantt.none .sp-grow::before{background:none;box-shadow:inset 0 0 0 1px var(--rule);opacity:1;border-radius:7px}

/* a big roster: one row a role, one dot a person ------------------------------------ */
.sp-roster{display:flex;flex-direction:column;border-top:1px solid var(--rule)}
.sp-rrow{display:grid;grid-template-columns:200px 1fr 240px;gap:18px;align-items:center;min-height:48px;border-bottom:1px solid var(--rule-soft)}
.sp-rbtn{display:flex;align-items:center;gap:10px;min-height:44px;padding:0;border:0;background:none;color:var(--ink);font:500 13.5px/1.2 Archivo,sans-serif;cursor:pointer;text-align:left}
.sp-rbtn i{width:26px;height:26px;border-radius:50%;background:var(--raised);display:grid;place-items:center;font:600 9.5px/1 "IBM Plex Mono",monospace;font-style:normal;color:var(--ink-2)}
.sp-rbtn .sp-i{color:var(--ink-3);transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.sp-rbtn:hover .sp-i{color:var(--accent);transform:translateX(2px)}
.sp-rrow.open .sp-rbtn .sp-i{transform:rotate(90deg)}
.sp-dots{display:flex;flex-wrap:wrap;gap:5px;padding:8px 0}
.sp-dot{width:11px;height:11px;border-radius:50%;background:var(--ink-2);cursor:default;transition:transform .2s cubic-bezier(.34,1.56,.64,1),background .15s}
.sp-dot.off{background:none;box-shadow:inset 0 0 0 1.5px var(--ink-3)}
.sp-dot:hover{transform:scale(1.7);background:var(--accent)}
.sp-dot.off:hover{background:none;box-shadow:inset 0 0 0 1.5px var(--accent)}
.sp-rrow:hover .sp-dot{animation:sp-hop .5s ease-in-out;animation-delay:calc(var(--k)*18ms)}
@keyframes sp-hop{40%{transform:translateY(-4px)}}
.sp-rrow .c{font:500 12px/1.3 "IBM Plex Mono",monospace;color:var(--ink-2);text-align:right;white-space:nowrap}
.sp-rrow .c b{color:var(--ink);font-weight:500}
.sp-rpeople{display:none;grid-column:1/-1;padding:4px 0 14px}
.sp-rrow.open .sp-rpeople{display:block;animation:rowin .3s ease}

/* shelves, stock, inputs --------------------------------------------------------- */
.sp-noplan{display:inline-flex;align-items:center;gap:5px;padding:2px 7px;border:1px dashed var(--warn);border-radius:4px;color:var(--warn);font-size:11px}
.sp-noplan svg{width:11px;height:11px}
.sp-red{color:var(--neg)}
.sub.sp-red{color:var(--neg)}
.sp-up{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:6px;border:1px solid var(--rule);font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-2);background:var(--surface)}
.sp-up.bad{border-color:var(--neg);color:var(--neg)}
.sp-up svg{width:12px;height:12px}
.sp-rail{position:relative;display:inline-grid;grid-template-columns:repeat(7,20px);gap:3px;height:28px;align-items:end;padding-bottom:4px;box-sizing:border-box;vertical-align:middle}
.sp-rail i{display:block;height:6px;border-radius:2px;background:var(--rule)}
.sp-rail i.c{background:var(--accent)}
.sp-rail i.d{background:repeating-linear-gradient(135deg,var(--neg) 0 3px,transparent 3px 5px)}
.sp-rail .trk{position:absolute;top:0;left:calc(var(--d)*23px + 2px);color:var(--ink);transition:left 1.2s cubic-bezier(.2,.7,.2,1) .3s}
.rv:not(.in) .sp-rail .trk{left:-26px}
.sp-rail .trk svg{width:16px;height:16px}
.sp-rail .trk.held{color:var(--ink-3)}
.sp-rail .trk.held::after{content:"";position:absolute;left:0;right:0;top:50%;border-top:1.5px solid var(--neg);transform:rotate(-35deg)}
tr:hover .sp-rail .trk:not(.held) svg{animation:sp-drive .5s ease-in-out infinite}
@keyframes sp-drive{50%{transform:translateY(-1.5px)}}
.sp-days{display:inline-grid;grid-template-columns:repeat(7,20px);gap:3px;text-align:center}
.sp-days b{font-weight:500}.sp-days b.now{color:var(--ink)}
.sp-zz{font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3);letter-spacing:.1em}
tr:hover .sp-zz{animation:sp-zz 1.2s ease-in-out infinite}
@keyframes sp-zz{50%{transform:translateY(-2px);opacity:.5}}
.sp-feeds{display:flex;flex-direction:column;gap:9px}
.sp-feed{display:grid;grid-template-columns:24px 1fr 90px 64px;gap:10px;align-items:center;font-size:13px}
.sp-feed .tr{height:6px;border-radius:3px;background:var(--rule-soft);overflow:hidden}
.sp-feed .tr i{display:block;height:100%;width:var(--w);background:var(--ink-2);border-radius:3px;transition:background .2s}
.sp-feed:hover .tr i{background:var(--accent)}
.sp-feed .c{font:500 12px "IBM Plex Mono",monospace;color:var(--ink-2);text-align:right}

/* factory lines -------------------------------------------------------------------- */
.sp-line{display:grid;grid-template-columns:230px 116px 1fr 110px 110px 110px;gap:14px;align-items:center;padding:13px 0;border-bottom:1px solid var(--rule-soft);transition:opacity .2s}
.sp-line.head{padding:0 0 8px;border-bottom:1px solid var(--rule);font:500 10.5px/1.4 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}
.sp-line .n{font-family:"IBM Plex Mono",monospace;font-size:13.5px;text-align:right;white-space:nowrap}
.sp-line.head .n{font-size:10.5px}
.sp-line .n small{display:block;font-size:10.5px;color:var(--ink-3)}
.sp-lines.dim .sp-line:not(.lit):not(.head){opacity:.3}
.sp-mach{display:flex;gap:6px}
.sp-m{position:relative;width:32px;height:32px;border-radius:8px;background:var(--raised);overflow:hidden;display:grid;place-items:center;color:var(--sp-on);cursor:default}
.sp-m::before{content:"";position:absolute;left:0;right:0;bottom:0;height:var(--h,100%);background:var(--accent)}
.sp-m svg{position:relative;width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.sp-line:hover .sp-m:not(.q):not(.z) svg,.sp-line.lit .sp-m:not(.q):not(.z) svg{animation:sp-spin 2.4s linear infinite}
@keyframes sp-spin{to{transform:rotate(360deg)}}
.sp-m.q,.sp-m.z{background:none;box-sizing:border-box}
.sp-m.q{border:1px dashed var(--warn);color:var(--warn);font:600 14px/1 "IBM Plex Mono",monospace}
.sp-m.z{border:1px dashed var(--rule);color:var(--ink-3);font:500 9px/1 "IBM Plex Mono",monospace;letter-spacing:.06em}
.sp-m.q::before,.sp-m.z::before{display:none}
.sp-belt{height:2px;background-image:repeating-linear-gradient(90deg,var(--ink-3) 0 6px,transparent 6px 12px);opacity:.45}
.sp-line:hover .sp-belt,.sp-line.lit .sp-belt{opacity:1;background-image:repeating-linear-gradient(90deg,var(--accent) 0 6px,transparent 6px 12px);animation:sp-belt .5s linear infinite}
.sp-belt.stop{background-image:repeating-linear-gradient(90deg,var(--neg) 0 2px,transparent 2px 12px)!important;animation:none!important}
@keyframes sp-belt{to{background-position:12px 0}}
.sp-pile{display:inline-flex;align-items:center;gap:5px;color:var(--warn)}
.sp-pick{font:inherit;font-size:12.5px;color:var(--ink);background:var(--surface);border:1px solid var(--warn);border-radius:6px;padding:5px 8px;min-height:30px}

/* profit with its two weeks ------------------------------------------------------------ */
.sp-band{fill:var(--ink);opacity:.05;transition:opacity .15s;cursor:default}
.sp-band.last{opacity:.09}
.sp-band:hover{opacity:.16}

/* a home ------------------------------------------------------------------------------- */
.sp-home{display:grid;grid-template-columns:400px 1fr;gap:32px;align-items:stretch;margin-top:26px}
.sp-house{border-radius:10px;background:var(--surface);border:1px solid var(--rule-soft);display:grid;place-items:end center;padding:20px 20px 0;overflow:hidden;cursor:default}
.sp-house svg{width:100%;height:auto;overflow:visible}
.sp-house .wall{fill:var(--raised);stroke:var(--rule);stroke-width:1.5}
.sp-house .win{fill:var(--ground);stroke:var(--rule);stroke-width:1.2;transition:fill .35s}
.sp-house .win.on{fill:var(--warn)}
.sp-house:hover .win{fill:var(--warn)}
.sp-house:hover .win.late{fill:var(--ground)}
.sp-house .doorleaf{fill:var(--accent);transform-origin:183px 0;transform-box:fill-box;transition:transform .5s cubic-bezier(.34,1.56,.64,1)}
.sp-house:hover .doorleaf{transform:perspective(200px) scaleX(.55)}
.sp-house .moon{fill:var(--ink-2);transition:transform 1.2s cubic-bezier(.2,.7,.2,1)}
.sp-house:hover .moon{transform:translate(18px,-8px)}
.sp-house .star{fill:var(--ink-3)}
.sp-house:hover .star{animation:blink 1.4s steps(1) infinite}
.sp-house .ground{stroke:var(--rule);stroke-width:1.5}
.sp-house .tree{fill:var(--accent-soft);stroke:var(--accent);stroke-width:1.3}
.sp-house:hover .tree{animation:sp-sway 1.8s ease-in-out infinite;transform-origin:50% 100%;transform-box:fill-box}
@keyframes sp-sway{50%{transform:rotate(3deg)}}
.sp-hometiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-content:start}
@media (prefers-reduced-motion:reduce){.board *{animation:none!important;transition:none!important}.rv{opacity:1;transform:none}}
"""

# --------------------------------------------------------------------------
# icons (stroke, 24 grid)
# --------------------------------------------------------------------------
P = {
    "alert": '<path d="M12 4l9 16H3z"></path><path d="M12 10v4.500M12 17.500v.01"></path>',
    "standards": '<path d="M12 3l2.600 5.600 6 .700-4.500 4.100 1.300 6L12 16.400 6.600 19.400l1.300-6L3.400 9.300l6-.700z"></path>',
    "magnet": '<path d="M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4zM6 8h4M14 8h4"></path>',
    "hours": '<circle cx="12" cy="12" r="8.500"></circle><path d="M12 7v5l3.500 2"></path>',
    "crew": '<circle cx="9" cy="8" r="3.500"></circle><path d="M2.500 20a6.500 6.500 0 0 1 13 0"></path><circle cx="17" cy="9" r="2.500"></circle><path d="M15.500 14.500a5 5 0 0 1 6 5"></path>',
    "shelves": '<path d="M4 3v18M20 3v18M4 8h16M4 14h16M4 20h16"></path><path d="M8 8V5.500M12 8V5M16 14v-2.500M9 14v-3"></path>',
    "fees": '<path d="M6 3h9l4 4v14H6z"></path><path d="M14 3v5h5M9.500 13h5M9.500 16.500h5"></path>',
    "profit": '<path d="M4 19h16"></path><path d="M5 15l4-5 4 3 6-7"></path>',
    "week": '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path>',
    "toilet": '<path d="M7 4h4v7H7zM5 11h13a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5zM10 16l-1 4h6l-1-4"></path>',
    "door": '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M4 21h16"></path><path d="M14.500 12v1"></path>',
    "sink": '<path d="M4 14h16v2a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM9 14V8a3 3 0 0 1 6 0"></path><path class="drip" d="M15 10.200v1.600"></path>',
    "music": '<path d="M9 18V6l10-2v12"></path><circle cx="6.500" cy="18" r="2.500"></circle><circle cx="16.500" cy="16" r="2.500"></circle>',
    "interior": '<path d="M6 11V8a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v3"></path><path d="M4 13a2 2 0 0 1 4 0v2h8v-2a2 2 0 0 1 4 0v5H4zM7 18v2M17 18v2"></path>',
    "shirt": '<path d="M8 4L3 7l2 4 2-1v10h10V10l2 1 2-4-5-3a4 4 0 0 1-8 0z"></path>',
    "locker": '<rect x="6" y="3" width="12" height="18" rx="1.500"></rect><path d="M9 7h6M9 10h6M14.500 14v2"></path>',
    "shield": '<path d="M12 3l7 3v6c0 4.500-3 7.500-7 9-4-1.500-7-4.500-7-9V6z"></path>',
    "person": '<circle cx="12" cy="8" r="3.500"></circle><path d="M5 20a7 7 0 0 1 14 0"></path>',
    "tag": '<path d="M3 12V4h8l10 10-8 8z"></path><path d="M7.500 8.500v.01"></path>',
    "sparkle": '<path d="M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800z"></path><path d="M18.500 16v4M16.500 18h4"></path>',
    "building": '<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"></path><path d="M14 10h5a1 1 0 0 1 1 1v10M4 21h17M8 8h2M8 12h2M8 16h2M17 14h1M17 18h1"></path>',
    "wave": '<path d="M2 14c2.500 0 2.500-4 5-4s2.500 4 5 4 2.500-4 5-4 2.500 4 5 4"></path>',
    "truck": '<path d="M2 7h11v9H2zM13 10h4l3 3v3h-7z"></path><circle cx="6.500" cy="17.500" r="1.800"></circle><circle cx="16.500" cy="17.500" r="1.800"></circle>',
    "pause": '<path d="M9 6v12M15 6v12"></path>',
    "crate": '<path d="M3.500 8.500 12 4l8.500 4.500v8L12 21l-8.500-4.500z"></path><path d="M3.500 8.500 12 13l8.500-4.500M12 13v8"></path>',
    "gear": '<circle cx="12" cy="12" r="3.200"></circle><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M5.600 18.400l2.100-2.100M16.300 7.700l2.100-2.100"></path>',
    "exit": '<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H8"></path>',
    "desk": '<path d="M3 9h18M5 9v10M19 9v10M13 9v6h6"></path>',
    "clock": '<circle cx="12" cy="12" r="8.500"></circle><path d="M12 7v5l3.500 2"></path>',
    "heart": '<path d="M12 20s-7.500-4.600-7.500-10.200A4.300 4.300 0 0 1 12 7.200a4.300 4.300 0 0 1 7.500 2.600C19.500 15.400 12 20 12 20z"></path>',
    "route": '<circle cx="6" cy="18" r="2"></circle><circle cx="18" cy="5" r="2"></circle><path d="M8 18h7a3.250 3.250 0 0 0 0-6.500H9a3.250 3.250 0 0 1 0-6.500h7"></path>',
    "counter": '<rect x="4" y="11" width="16" height="8" rx="1.500"></rect><path d="M7 11V6h7v5M9 15h6"></path>',
    "monitor": '<rect x="3" y="4.500" width="18" height="12" rx="2"></rect><path d="M9 20.500h6M12 16.500v4"></path>',
    "down": '<path d="M12 5v14M6 13l6 6 6-6"></path>',
    "right": '<path d="M5 12h14M13 6l6 6-6 6"></path>',
    "up": '<path d="M12 19V5M6 11l6-6 6 6"></path>',
    "trend_up": '<path d="M4 17l6-6 4 4 6-7"></path>',
    "trend_dn": '<path d="M4 7l6 6 4-4 6 7"></path>',
    "ramp": '<path d="M4 19h16M5 16l14-9"></path>',
    "pin": '<path d="M12 21s-6-5.500-6-11a6 6 0 0 1 12 0c0 5.500-6 11-6 11z"></path><circle cx="12" cy="10" r="2.200"></circle>',
    "roster": '<path d="M4 7h9M4 12h16M4 17h6"></path><path d="M16 5v4M13 15v4"></path>',
    "list": '<path d="M8 6h12M8 12h12M8 18h12M4 6v.01M4 12v.01M4 18v.01"></path>',
    "coin": '<circle cx="12" cy="12" r="8.500"></circle><path d="M14.500 9.500c-.500-1-1.500-1.500-2.500-1.500-1.500 0-2.500.800-2.500 2s1 1.700 2.500 2 2.500.800 2.500 2-1 2-2.500 2c-1.200 0-2.200-.600-2.600-1.600M12 6.500V8M12 16v1.500"></path>',
    "bench": '<path d="M4 11h16M5 11V7M19 11V7M6 11v7M18 11v7M4 15h16"></path>',
    "pinned": '<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"></path>',
    "tick": '<path d="M5 12.500l4.500 4.500L19 7"></path>',
    "chev": '<path d="M9 6l6 6-6 6"></path>',
    "close": '<path d="M6 6l12 12M18 6L6 18"></path>',
    "pipe": '<path d="M3 8h6v8h12M3 12h2M17 20v-2M21 20v-2"></path>',
    "key": '<circle cx="8" cy="14" r="4"></circle><path d="M11 11l9-8M16 6.500l3 3"></path>',
    "today": '<circle cx="12" cy="12" r="4"></circle><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600l1.400 1.400M17 17l1.400 1.400M5.600 18.400 7 17M17 7l1.400-1.400"></path>',
    "results": '<path d="M4 19h16"></path><path d="M5 15l4-5 4 3 6-7"></path>',
    "supply": '<path d="M3.500 8.500 12 4l8.500 4.500v8L12 21l-8.500-4.500z"></path><path d="M3.500 8.500 12 13l8.500-4.500M12 13v8"></path>',
    "growth": '<path d="M4 18 10 12l4 4 6-7"></path><path d="M15 9h5v5"></path>',
}


def svg(name: str) -> str:
    return f'<svg viewBox="0 0 24 24" aria-hidden="true">{P[name]}</svg>'


def i(name: str) -> str:
    return f'<span class="sp-i">{svg(name)}</span>'


def esc(text: str) -> str:
    return html.escape(text, quote=True)


# --------------------------------------------------------------------------
# shared pieces
# --------------------------------------------------------------------------
PAGES = [("today", "Today"), ("results", "Results"), ("supply", "Supply"), ("growth", "Growth"), ("building", "Company")]


def masthead() -> str:
    items = "".join(
        f'<a class="{"on" if key == "results" else ""}" href="#">{svg(key)}<span>{label}</span></a>' for key, label in PAGES)
    return f"""
<header class="mast">
  <div class="brand"><span class="wordmark">Costco</span><span class="dot"></span></div>
  <nav class="nav" id="nav">{items}<i class="ink"></i></nav>
  <div class="clock tr" data-tip="Game time when the save was written. Day 1 was a Monday."><b>Day 189<i>·</i>Sun 02:00</b><small>YEAR 4 · 35 SITES · 581 STAFF</small></div>
</header>"""


def sechead(icon: str, title: str, why: str = "", quiet: str = "", aside: str = "", cls: str = "") -> str:
    return (f'<div class="sechead"><span class="sp-ico {cls}">{svg(icon)}</span><h2>{title}</h2>'
            + (f'<span class="why" data-tip="{esc(why)}"><i>?</i></span>' if why else "")
            + (f'<span class="quiet">{quiet}</span>' if quiet else "")
            + (f'<div class="aside">{aside}</div>' if aside else "") + "</div>")


def head(code: str, name: str, sub: str, prev: tuple, nxt: tuple, lamp: str = "") -> str:
    """The bullet, the name, the lamp; the picker steps through the other artboards."""
    step = lambda t, arrow: f'<a href="{t[1]}">{arrow if arrow == "‹" else ""} {t[0]} {arrow if arrow == "›" else ""}</a>'
    return f"""
<div class="sitehead rv">
  <span class="bullet">{code}</span>
  <div><h2>{name}{lamp}</h2><span class="sub">{sub}</span></div>
  <div class="aside" style="margin-left:auto;display:flex;gap:8px;align-items:center">
    <span class="seg">{step(prev, "‹")}<a class="on" href="#">{name}</a>{step(nxt, "›")}</span>
    <a href="#" class="ibtn tr" data-tip="Show on the map" aria-label="Show on the map">{svg("pin")}</a>
    <a href="#" class="ibtn tr" data-tip="Close" aria-label="Close">{svg("close")}</a>
  </div>
</div>"""


def rank(place: int | None, of: int, tip: str) -> str:
    """Where the site stands by profit over the last seven days: 1 is the most important."""
    if place is None:
        return f'<span class="sp-rank none" data-tip="{esc(tip)}"><span>–<small>/{of}</small></span></span>'
    ladder = "".join(f'<i class="{"me" if k == place - 1 else ""}" style="--t:{1 - k / (of - 1):.2f};--k:{k}"></i>' for k in range(of))
    return (f'<span class="sp-rank {"top" if place <= 3 else ""}" data-tip="{esc(tip)}"><span>{place}<small>/{of}</small></span>'
            f'<span class="ladder">{ladder}</span></span>')


LAMP_ON = '<span class="sp-lamp" data-tip="Trading"></span>'


def find(sev: str, icon: str, block: str, what: str, more: str, amt: str = "", small: str = "",
         hit: str = "", arrived: bool = False, extra: bool = False) -> str:
    cls = f'sp-find {sev}{" arrived" if arrived else ""}{" extra" if extra else ""}'
    return (f'<a class="{cls}" href="#sp-{block}" data-ev="{block}" data-hit="{hit}">'
            f'<span class="mark"></span><span class="ev sp-i">{svg(icon)}</span>'
            f'<span class="what">{what}</span>'
            f'<span class="amt">{amt}{f"<small>{small}</small>" if small else ""}</span>'
            f'<span class="go sp-i">{svg("down")}</span>'
            f'<span class="more">{more}</span></a>')


def finds(rows: list[str], hidden: int = 0) -> str:
    more = (f'<p class="sp-findmore">{hidden} more &nbsp;<a class="link" href="#" data-allfinds>show all</a></p>' if hidden else "")
    return f'<div class="sp-finds rv">{"".join(rows)}</div>{more}'


def tile(label: str, value: str, extra: str = "", flag: bool = False, tip: str = "") -> str:
    return (f'<div class="sstat"{f" data-tip=\"{esc(tip)}\"" if tip else ""}>{'<i class="sp-flag"></i>' if flag else ""}'
            f'<span class="lab">{label}</span><div class="v">{value}</div>{extra}</div>')


def costbar(parts: list[tuple], total: float, home: str = "") -> str:
    """One bar the width of yesterday's revenue: what each cost ate, and what was left."""
    shade = {"Goods": 62, "Wages": 46, "Rent": 32, "Marketing": 24, "Theft": 18, "Licensing": 14}
    segs = ""
    for label, v in parts:
        cls = "p" if label == "Profit" else "l" if label == "Loss" else ""
        segs += (f'<i class="{cls}" style="flex:{v / total:.4f} 0 0;--k:{shade.get(label, 40)}%" '
                 f'data-read="{esc(f"{label} <b>${v:,.0f}</b>")}"></i>')
    return f'<div data-readzone><div class="sp-cost">{segs}</div><div class="sp-tread sp-readout">{home}</div></div>'


def spark(vals: list[float], first_day: int, unit: str, tone: str = "") -> str:
    """A fortnight: the week before in grey, the last seven days in ink."""
    lo, top = min(vals), max(vals)
    bars = "".join(f'<i class="{"l" if k >= len(vals) - 7 else ""}" style="--v:{25 + (v - lo) / ((top - lo) or 1) * 75:.0f}%" '
                   f'data-read="{esc(f"day {first_day + k} <b>{unit}{v:,.0f}</b>")}"></i>' for k, v in enumerate(vals))
    return f'<div data-readzone><div class="sp-spark {tone}">{bars}</div><div class="sp-tread sp-readout"></div></div>'


def meter(pct: float, read: str, bad: bool = False) -> str:
    return (f'<div data-readzone><div class="sp-meter {"bad" if bad else ""}" data-read="{esc(read)}"><i style="--w:{pct:.0f}%"></i></div>'
            f'<div class="sp-tread sp-readout"></div></div>')


def ceiling(kinds: list[str], on: str) -> str:
    return '<div class="sp-ceil">' + "".join(f'<span class="sp-i {"on" if k == on else ""}">{svg(k)}</span>' for k in kinds) + "</div>"


def chip(kind: str, icon: str, text: str, tip: str = "") -> str:
    return f'<span class="chip {kind}"{f" data-tip=\"{esc(tip)}\"" if tip else ""}>{svg(icon) if icon else ""}{text}</span>'


def eq(bars: list[tuple], unknown: bool = False) -> str:
    """Satisfaction's four parts as an equaliser against the 80 line."""
    out = '<div class="sp-eq"><span class="th"></span>'
    for icon, label, v in bars:
        cls = "unk" if unknown else "bad" if v < 60 else "low" if v < 80 else ""
        read = f"{label} <b>not scored yet</b>" if unknown else f"{label} <b>{v}%</b>"
        out += (f'<div class="sp-eqb {cls}" data-read="{esc(read)}"><span class="t"><b style="--v:{0 if unknown else v}%"></b></span>'
                f'<span class="sp-i">{svg(icon)}</span></div>')
    return out + "</div>"


SAT_PARTS = [("person", "Service"), ("tag", "Pricing"), ("sparkle", "Cleanliness"), ("building", "Facility")]


def lamps(items: list[tuple]) -> str:
    out = ""
    for icon, state, label, el in items:
        if icon == "|":
            out += '</div><div class="sp-lamprow">'
            continue
        if icon == "role":
            out += f'<span class="sp-role" data-el="{el}" data-read="{esc(label)}">{state}</span>'
            continue
        out += (f'<span class="sp-lampb {state} {icon}" data-el="{el}" data-read="{esc(label)}" '
                f'role="img" aria-label="{esc(html.unescape(label.replace("<b>", "").replace("</b>", "")))}">{svg(icon)}</span>')
    return f'<div class="sp-lamps"><div class="sp-lamprow">{out}</div></div>'


def pri(level: int) -> str:
    return f'<span class="sp-pri {"hi" if level == 3 else ""}">' + "".join(f'<i class="{"on" if k < level else ""}"></i>' for k in range(3)) + "</span>"


def demand(icon: str, text: str, count: int, level: int, company: bool = False, tip: str = "") -> str:
    return (f'<span class="sp-dem" data-el="demand" data-tip="{esc(tip)}">{i(icon)}{text} <b>×{count}</b>{pri(level)}'
            f'{i("building") if company else ""}</span>')


def person(code: str, name: str, role: str, off: bool = False, noshirt: bool = False) -> str:
    mark = f'<span class="sp-i" data-el="uniform" data-tip="No uniform set for this role">{svg("shirt")}</span>' if noshirt else ""
    return (f'<span class="person {"off" if off else ""}" data-p="{name.lower().replace(" ", "-")}"><i>{code}</i>{name}'
            f'<small>{role}{" · off today" if off else ""}</small>{mark}</span>')


DN = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
DF = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def hour_grid(cap: int, seed: int, open_h: tuple, peak_h: int, caps, slack, unit: str, office: bool = False, thin: int = -1) -> str:
    random.seed(seed)
    g = "<div></div>" + "".join(f'<div class="hh">{h if h % 3 == 0 else ""}</div>' for h in range(24))
    for d in range(7):
        g += f'<div class="dd {"now" if d == 6 else ""}">{DN[d]}{"*" if d == thin else ""}</div>'
        for h in range(24):
            shut = h < open_h[0] or h > open_h[1] or (office and d >= 5)
            if shut:
                v = 0
            else:
                base = cap * .3 + cap * .42 * math.exp(-((h - peak_h) ** 2) / 12) + (cap * .22 if (d >= 4 and not office) else 0)
                v = min(cap - 2, int(base + random.uniform(-cap * .07, cap * .07)))
            at = caps(d, h) and not shut
            idle = slack(d, h) and not shut
            if at:
                v = cap
            if idle:
                v = 2
            a = 6 + v / cap * 70
            bg = f"color-mix(in oklab, var(--accent) {a:.0f}%, var(--surface))" if v else "var(--raised)"
            read = f"<b>{DF[d]} {h:02d}:00</b> {v} customers"
            read += f" · <b>at the {unit}</b>" if at else " · capacity idle" if idle else ""
            g += f'<div class="hc {"cap" if at else "slack" if idle else ""}" style="background:{bg}" data-read="{esc(read)}"></div>'
    return f'<div class="hours" data-readzone>{g}</div>'


def hours_block(grid: str, why: str, chips: str, title: str = "Hours") -> str:
    return f"""
<section class="sec rv" data-block="hours" id="sp-hours">
  {sechead("hours", title, why)}
  <div class="chartbox" data-readzone>{grid}<div class="sp-read sp-readout">Hover an hour</div></div>
  <div class="sp-hchips">{chips}</div>
</section>"""


def profit_chart(vals: list[float], first_day: int, trend: bool = True) -> str:
    W, H, T, B = 540, 120, 10, 18
    lo, hi = min(min(vals), 0), max(vals)
    pad = (hi - lo) * .1
    lo, hi = lo - pad, hi + pad
    n = len(vals)
    X = lambda k: 4 + k / max(n - 1, 1) * (W - 10)
    Y = lambda v: T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
    pts = " ".join(f"{X(k):.1f},{Y(v):.1f}" for k, v in enumerate(vals))
    bands = ""
    if trend and n >= 14:
        for a, b, cls in ((n - 14, n - 8, ""), (n - 7, n - 1, "last")):
            avg = sum(vals[a:b + 1]) / 7
            read = f"<b>days {first_day + a}–{first_day + b}</b> ${avg / 1000:,.0f}k a day"
            bands += (f'<rect class="sp-band {cls}" x="{X(a) - 4:.1f}" y="{T}" width="{X(b) - X(a) + 8:.1f}" height="{H - T - B}" rx="4" data-read="{esc(read)}"></rect>'
                      f'<line x1="{X(a):.1f}" x2="{X(b):.1f}" y1="{Y(avg):.1f}" y2="{Y(avg):.1f}" stroke="var(--ink-2)" stroke-width="1.2" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"></line>')
    dash = "" if trend else ' stroke-dasharray="5 5"'
    return f"""<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" style="width:100%;height:{H}px;overflow:visible">
  {bands}
  <polygon points="{X(0):.1f},{Y(max(lo, 0)):.1f} {pts} {X(n - 1):.1f},{Y(max(lo, 0)):.1f}" fill="var(--accent)" opacity=".10" pointer-events="none"></polygon>
  <polyline points="{pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke" pointer-events="none"{dash}></polyline>
  <circle cx="{X(n - 1):.1f}" cy="{Y(vals[-1]):.1f}" r="3.2" fill="var(--surface)" stroke="var(--accent)" stroke-width="2"></circle>
  <text x="4" y="{H - 3}" fill="var(--ink-3)" font-family="IBM Plex Mono, monospace" font-size="10">day {first_day}</text>
  <text x="{W - 6}" y="{H - 3}" text-anchor="end" fill="var(--ink-3)" font-family="IBM Plex Mono, monospace" font-size="10">day {first_day + n - 1}</text>
</svg>"""


def week_bars(week: list[int]) -> str:
    out = ""
    for k, v in enumerate(week):
        h = abs(v) * 1.6
        pos = "bottom:50%" if v > 0 else "top:50%"
        lab = f"bottom:calc(50% + {h + 8}px)" if v > 0 else f"top:calc(50% + {h + 8}px)"
        out += (f'<div class="wd {"now" if k == 6 else ""}"><div class="track">'
                f'<i class="bar2 {"down" if v < 0 else ""}" style="height:{h}px;{pos}"></i>'
                f'<span class="n" style="{lab}">{v:+d} pts</span></div><span class="d"><span>{DN[k]}</span><b>{DF[k]}</b></span></div>')
    return f'<div class="week">{out}</div>'


def money_blocks(vals: list[float], first_day: int, week: list[int], delta: str, peak: str, trend: bool = True) -> str:
    return f"""
<div class="duo sec">
  <section class="rv" data-block="profit" id="sp-profit">
    {sechead("profit", "Profit", quiet=f"{len(vals)} days", aside=delta)}
    <div class="chartbox" data-readzone>{profit_chart(vals, first_day, trend)}<div class="sp-read sp-readout">{"Hover a week" if trend else "&nbsp;"}</div></div>
  </section>
  <section class="rv" data-block="week" id="sp-week">
    {sechead("week", "Week", quiet=peak)}
    <div class="chartbox" style="padding-bottom:16px">{week_bars(week)}</div>
  </section>
</div>"""


def series(n: int, level: float, drop_from: int, drop: float, seed: int) -> list[float]:
    random.seed(seed)
    wk = [-.08, -.12, -.06, .04, .18, .31, .09]
    return [level * (1 + wk[k % 7] * .6) * (drop if k >= drop_from else 1) * (1 + random.uniform(-.05, .05)) for k in range(n)]


def up(now: str, to: str, bad: bool = True) -> str:
    return f'<span class="sp-up {"bad" if bad else ""}">{now} {svg("right")} <b>{to}</b></span>'


# --------------------------------------------------------------------------
# the roster: docs/staffing-assistant-scope.md's `staffing` row, drawn
# --------------------------------------------------------------------------
STATIONS = [("C1", "Checkout counter 1 · serves 30 an hour", "serve"), ("C2", "Checkout counter 2 · serves 30 an hour", "serve"),
            ("C3", "Checkout counter 3 · serves 30 an hour", "serve"), ("CL", "Cleaning station · covered every open hour", "clean"),
            ("SG", "Security guard locker · covered every open hour", "security")]
PLACED = {"Mia Cho": "no afternoon shifts, so she takes the evenings", "Li Wei": "weekends free, so his 48 hours fall Monday to Thursday"}
BENCH = {"Dana Reyes"}


def plan_day(d: int) -> dict:
    busy = d >= 4
    c2, c3 = ((9, 21), (11, 21)) if busy else ((10, 22), (13, 19))
    return {
        "C1": [(8, 16, {4: "Dana Reyes", 6: "Noa Berg"}.get(d, "Tom Bell")), (16, 23, None if d in (4, 6) else "Mia Cho")],
        "C2": [(*c2, "Sol Park" if busy else "Li Wei")],
        "C3": [(*c3, None if d == 4 else "Dana Reyes" if busy else "Noa Berg")],
        "CL": [(8, 16, "Ola Nowak" if d < 5 else "Cy Hart"), (16, 23, "Bea Flynn" if d < 5 else "Ida Moss")],
        "SG": [(8, 16, "Ray King" if d < 5 else None), (16, 23, None)],
    }


def need_of(d: int, h: int) -> int:
    if h < 8 or h >= 23:
        return 0
    if d >= 4:
        return 3 if 11 <= h < 21 else 2 if 9 <= h < 11 else 1
    return 3 if 13 <= h < 19 else 2 if 10 <= h < 22 else 1


def slug(name: str) -> str:
    return name.lower().replace(" ", "-")


def gantt_day(d: int, on: bool) -> str:
    rows = f'<div class="sp-grow need"><span class="lab" data-read="{esc("Counters the measured hours ask for")}">{svg("person")}</span>'
    for h in range(24):
        n = need_of(d, h)
        if not n:
            continue
        censored = d >= 4 and 14 <= h < 18
        basis = "c" if censored else "s" if d == 2 else ""
        read = f"<b>{DF[d]} {h:02d}:00</b> {n} counter{'s' if n > 1 else ''}"
        read += (" · <b>measured at the ceiling</b>: the door binds here, so this is a floor, not a target" if censored
                 else " · <b>scaled from Thursday</b> through the game's day curve; Wednesday rests on under two weeks" if d == 2 else " · measured")
        rows += f'<i class="sp-need {basis}" style="grid-column:{h + 2};--n:{n}" data-read="{esc(read)}"></i>'
    rows += "</div>"
    k = 0
    for code, label, kind in STATIONS:
        rows += f'<div class="sp-grow"><span class="lab" data-read="{esc(label)}">{code}</span>'
        if kind != "security":
            for h in range(8, 22, 2):
                rows += f'<i class="sp-frag" style="grid-column:{h + 2}/{h + 4};--k:{k}"></i>'
                k += 1
        else:
            rows += f'<i class="sp-frag" style="grid-column:10/18;--k:{k}"></i>'
        for a, b, name in plan_day(d)[code]:
            span, hrs, station = f"grid-column:{a + 2}/{b + 2}", f"{a:02d}–{b:02d}", label.split(" · ")[0]
            if name is None:
                read = f"<b>{DF[d]} {hrs}</b> · {station} · <b>nobody to give it to</b>: counted in the hire below"
                rows += f'<span class="sp-shift hire" style="{span}" data-read="{esc(read)}">hire<small>{hrs}</small></span>'
                continue
            why = PLACED.get(name)
            read = f"<b>{name}</b> · {DF[d]} {hrs} · {station}"
            read += f" · {why}" if why else " · <b>from the bench</b>: assign her in MyEmployees first" if name in BENCH else ""
            marks = (f'<span class="sp-i pin">{svg("pinned")}</span>' if why else "") + (i("bench") if name in BENCH else "")
            rows += (f'<button type="button" class="sp-shift {kind}" style="{span}" data-p="{slug(name)}" data-read="{esc(read)}">'
                     f'<span class="sp-i tick">{svg("tick")}</span>{marks}{name}<small>{hrs}</small></button>')
        rows += "</div>"
    return f'<div class="sp-day {"on" if on else ""}" data-d="{d}">{rows}</div>'


def roster_block() -> str:
    tabs = ""
    for d in range(7):
        same = d in (1, 2, 3)
        read = f"<b>{DF[d]}</b> · the same as Monday, people and all: copy schedule, paste schedule" if same else f"<b>{DF[d]}</b> · 8 shifts"
        tabs += f'<a href="#" class="{"on" if d == 0 else ""}" data-day="{d}" data-read="{esc(read)}">{"<u></u>" if same else ""}{DN[d]}</a>'
    hours = ('<div class="sp-grow need" style="min-height:0;margin:0"><span></span>'
             + "".join(f'<div class="hh" style="grid-column:{h + 2}">{h if h % 3 == 0 else ""}</div>' for h in range(24)) + "</div>")
    dots = lambda n, cls="": "".join(f'<i class="sp-dot {cls}"></i>' for _ in range(n))
    why = ("A week to type into BizMan › Schedule: clear the schedule, then enter these. Shifts run as long as the game allows, 12 hours, "
           "and nobody is put inside a window they asked to keep free. Click a shift once it is typed.")
    aside = '<span class="seg sp-nowplan"><a href="#" data-view="now">now</a><a href="#" class="on" data-view="plan">plan</a></span>'
    return f"""
<section class="sec rv" data-block="roster" id="sp-roster" data-readzone>
  {sechead("roster", "Roster", why, aside=aside)}
  <div class="sp-ba">
    <div data-read="{esc("Shifts to enter for the week: <b>182</b> today, 147 of them two hours long, against <b>56</b>")}"><span class="lab">Shifts / week</span><div class="v">{i("list")}<s>182</s>56</div></div>
    <div data-read="{esc("<b>−$2,170</b> idle hours · <b>+$1,680</b> one hire · <b>+$3,640</b> two guards for a locker nobody staffs: new spending")}"><span class="lab">Wages / week</span><div class="v">{i("coin")}<s>$27.9k</s>$31.0k</div></div>
    <div data-read="{esc("<b>9 h</b> bought to keep shifts whole, of the <b>24 h</b> allowed: 10% of the 243 the counters need · $190 a week")}"><span class="lab">Slack</span><div class="v" style="font-size:14px">9<small style="color:var(--ink-3)">/ 24 h</small><span class="sp-meter" style="display:inline-block"><i style="--w:37%"></i></span></div></div>
    <div class="sp-typed"><span class="sp-ring" style="--p:0"></span><span><b class="sp-count">0</b> of 56 typed</span></div>
  </div>
  <div class="sp-steps">
    <button type="button" class="sp-step"><span class="box">{svg("tick")}</span>Clear entire schedule<small>BizMan › Schedule</small></button>
    <button type="button" class="sp-step" data-p="dana-reyes"><span class="box">{svg("tick")}</span>Assign Dana Reyes here<small>MyEmployees · from the bench</small></button>
    <span class="seg sp-daytabs" style="margin-left:auto">{tabs}</span>
  </div>
  <div class="chartbox sp-gantt">{hours}{"".join(gantt_day(d, d == 0) for d in range(7))}</div>
  <div class="sp-hc">
    <span data-read="{esc("Customer service · 243 counter-hours want 5 to 8 people · <b>5 here, 1 from the bench, 1 to hire</b>")}"><span class="code">CS</span><span class="sp-dots">{dots(5)}{dots(1, "bench")}{dots(1, "hire")}</span>5 · 1 bench · hire 1</span>
    <span data-read="{esc("Cleaning · every open hour already covered; 57 fragments become 14 shifts")}"><span class="code">CL</span><span class="sp-dots">{dots(4)}</span>4</span>
    <span class="new" data-read="{esc("Security · one guard for a locker open 105 hours a week · <b>2 hires, $3,640 a week of new spending</b>")}"><span class="code">SG</span><span class="sp-dots">{dots(1)}{dots(2, "hire")}</span>1 · hire 2 · <b>+$3,640/wk</b></span>
    <span class="new" data-p="dana-reyes" data-read="{esc("<b>Dana Reyes</b> gets 28 hours; full-time asks for 30. A demand warning this plan would earn: another site may suit her better")}">{i("clock")}<span>Dana Reyes <b>28</b>/30 h</span></span>
  </div>
  <div class="sp-read sp-readout">Hover a shift</div>
</section>"""


def roster_none() -> str:
    rows = "".join(f'<div class="sp-grow"><span class="lab">{c}</span></div>' for c in ("C1", "C2", "CL"))
    why = ("A roster is cut from measured hours. This shop has none yet, and the game's own arrival ceiling over-predicts "
           "a shop like it fourfold, so nothing is suggested.")
    return f"""
<section class="sec rv" data-block="roster" id="sp-roster">
  {sechead("roster", "Roster", why)}
  <div class="chartbox sp-gantt none">{rows}</div>
  <div class="sp-read">No measured weekday yet</div>
</section>"""


# --------------------------------------------------------------------------
# a shop
# --------------------------------------------------------------------------
def retail() -> str:
    grid = hour_grid(75, 7, (8, 22), 16,
                     lambda d, h: (d in (4, 5) and 14 <= h <= 17) or (d == 6 and 15 <= h <= 17),
                     lambda d, h: d == 1 and 8 <= h <= 10, "door cap", thin=2)
    chips = (f'<span class="sp-hchip cap" data-show="cap"><i class="sp-sw"></i>{i("door")}<b>11 h/wk</b> Fri–Sun 14–18 · <b>$41k</b>/day'
             f'<span class="fix">{i("right")}a larger building</span></span>'
             f'<span class="sp-hchip idle" data-show="idle"><i class="sp-sw"></i>{i("counter")}<b>Tue 08–11</b> 3 on · 2/h · 9 staff-h · <b>$310</b>/day<span class="fix">{i("down")}the roster drops it</span></span>')
    crew = "".join([person("MG", "Ana Ruiz", "Manager")]
                   + [person("CS", n, "Customer service", off=n == "Mia Cho", noshirt=True) for n in ("Tom Bell", "Mia Cho", "Li Wei", "Noa Berg", "Sol Park")]
                   + [person("CL", n, "Cleaning") for n in ("Ola Nowak", "Bea Flynn", "Cy Hart", "Ida Moss")] + [person("SG", "Ray King", "Security")])
    dems = (demand("clock", "No afternoon shifts", 1, 2, tip="Mia Cho. The roster above keeps her out of 14–16.")
            + demand("clock", "Weekends off", 1, 2, tip="Li Wei. The roster above gives him Monday to Thursday.")
            + demand("heart", "Health insurance", 4, 1, company=True, tip="Settled company-wide, not here. Low priority."))
    shelves = [
        ("Clothing (Modern Cheap Male)", "$39.00", "604", '<span class="sp-red">Fri 720</span>', up("600", "800"), 96, "warn", "41"),
        ("Clothing (Modern Cheap Female)", "$39.00", "598", "Fri 712", "800", 89, "", "2,010"),
        ("Clothing (Modern Expensive Male)", "$289.00", "312", "Sat 401", "450", 89, "", "1,240"),
        ("Clothing (Classic Expensive Female)", "$305.00", "298", "Sat 388", f'<span class="sp-noplan" data-el="noplan">{svg("route")}no plan</span>', 0, "none", "1,180"),
    ]
    srows = ""
    for p, price, sells, busy, top, pr, lvl, hand in shelves:
        gauge = "—" if lvl == "none" else f'<i><b style="--w:{pr}%{";background:var(--warn)" if lvl == "warn" else ""}"></b></i>{pr}%'
        srows += (f'<tr{" data-el=\"outruns\"" if lvl == "warn" else ""}><td class="l">{p}<span class="sub">{price}</span></td><td>{sells}</td><td>{busy}</td>'
                  f'<td>{top}</td><td class="gauge">{gauge}</td><td>{hand}</td></tr>')
    vals = series(30, 215000, 23, .82, 3)
    body = f"""
{head("LM", "Costco Cloth", "Clothing Store · 12 Broome Street · Lower Manhattan · opened day 61 · from Depot West", ("Costco Home", "Home.dc.html"), ("Costco Law", "Office.dc.html"),
      LAMP_ON + rank(3, 31, "3rd of the 31 sites that trade, by profit over the last 7 days: $1.07M"))}
{finds([
    find("watch", "profit", "profit", "Revenue down 18%", "Days 183–189 against 176–182. A demand wave is draining out of Lower Manhattan at the same time.", "−$74k", "A DAY", arrived=True),
    find("crit", "shelves", "shelves", "Cheap menswear outsells its top-up", "Friday sells 720 and the truck tops up to 600, so the shelf is bare before the next drop.", "720 / 600", "FRI", hit="outruns"),
    find("watch", "standards", "standards", "No music · bathroom without a door", "Two of the seven things customers here look for.", "2 / 7", "UNMET", hit="music toiletprivacy"),
    find("watch", "standards", "standards", "Customer service has no uniform", "Five people on the floor, no uniform set for their role.", "×5", hit="uniform"),
    find("opp", "magnet", "pull", "Promotion at 72% of the cap", "Foot traffic brings 41 points, campaigns 31. There is room for 28 more.", "+28", "POINTS", extra=True),
    find("watch", "magnet", "pull", "Demand wave ends in 4 days", "31% of what this shop takes is riding on it.", "31%", "OF TAKINGS", hit="wave", extra=True),
    find("watch", "hours", "hours", "At the door cap 11 hours a week", "The door is the limit, so the answer is a larger building.", "$41k", "A DAY THROUGH IT", extra=True),
    find("opp", "roster", "roster", "Counters on through empty hours", "Three counters staffed Tuesday 08–11 for two customers an hour. The roster below drops them.", "$310", "A DAY", extra=True),
], hidden=4)}
<div class="sstats rv" data-block="tiles" id="sp-tiles">
  {tile("Revenue yesterday", f'$338,200{chip("bad", "trend_dn", "18%", "Days 183–189 against 176–182")}', spark([v * 2.21 for v in vals[-14:]], 176, "$", "dn"))}
  {tile("Customers", '1,206<small>$280/visit</small>', spark([v / 127 for v in vals[-14:]], 176, ""))}
  {tile("Profit", '<span class="pos">$163,520</span><small>48.3%</small>', costbar([("Goods", 158400), ("Wages", 3980), ("Rent", 4200), ("Marketing", 6900), ("Theft", 1200), ("Profit", 163520)], 338200))}
  {tile("Door cap", '75<small>/h · 11 h/wk at it</small>', ceiling(["door", "counter", "person"], "door"))}
</div>
<div class="duo sec" style="grid-template-columns:3fr 2fr">
  <section class="rv" data-block="standards" id="sp-standards" data-readzone>
    {sechead("standards", "Standards", "What customers find when they walk in. A lit lamp was found in place; a struck one was looked for and missed.")}
    <div class="sp-std">
      <div class="sp-big warn">74<small>%</small></div>
      {eq([(a, b, v) for (a, b), v in zip(SAT_PARTS, (88, 71, 62, 79))])}
      {lamps([("toilet", "ok", "Bathroom", "bathroom"), ("door", "miss", "Bathroom has <b>no stall or door</b>", "toiletprivacy"), ("sink", "ok", "Sink", "sink"),
              ("music", "miss", "<b>No music</b> playing", "music"), ("interior", "ok", "Interior design", "interior"),
              ("|", "", "", ""), ("locker", "ok", "Uniform locker", "locker"), ("shirt", "miss", "<b>No uniform</b> for these roles", "uniform"),
              ("role", "CS", "Customer service <b>×5</b>", "uniform")])}
    </div>
    <div class="sp-read sp-readout">5 found · <b>2 missed</b></div>
  </section>
  <section class="rv" data-block="pull" id="sp-pull" data-readzone>
    {sechead("magnet", "Pull", "Promotion against the game's 100% cap: what the street brings, and what campaigns add.", cls="magnet")}
    <div class="sp-promorow"><div class="sp-promo"><i class="tr" style="width:41%" data-read="{esc("Foot traffic <b>41</b>")}"></i><i class="mk" style="width:31%" data-read="{esc("Marketing <b>31</b>")}"></i><u></u><u></u><u></u></div>
      <div class="sp-big" style="font-size:26px">72<small>/100</small></div></div>
    <div class="sp-minis"><span data-read="{esc("Security <b>85%</b>")}">{i("shield")}85%</span><span data-read="{esc("<b>40</b> shoppers fit inside at once")}">{i("person")}40</span></div>
    <div class="sp-wave" data-el="wave" data-read="{esc("Clothing wave over Lower Manhattan · <b>$233k</b> a day before it, <b>$338k</b> under it")}">{i("wave")}
      <div class="sp-wavebar"><i class="base" style="width:69%"></i><i class="lift" style="width:31%"></i></div>
      <span><span class="sp-pips"><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i></i><i></i><i></i></span>&nbsp; 4d</span></div>
    <div class="sp-read sp-readout">&nbsp;</div>
  </section>
</div>
{hours_block(grid, "Two weeks of hour reports. Shade is customers against the busiest hour. An outlined hour ran at the ceiling; a hatched one had counters on and nobody to serve. A starred day rests on under two weeks.", chips)}
{roster_block()}
<div class="duo sec" style="grid-template-columns:1fr 2fr">
  <section class="rv" data-block="crew" id="sp-crew">
    {sechead("crew", "Crew", quiet="11 · $3,980/day")}
    <div class="crew">{crew}</div>
    <div class="sp-dems">{dems}</div>
  </section>
  <section class="rv" data-block="shelves" id="sp-shelves">
    {sechead("shelves", "Shelves", quiet="before tomorrow's top-up")}
    <table><thead><tr><th>Product</th><th>Sells / day</th><th>Busiest</th><th>Top-up</th><th>Pressure</th><th>On hand</th></tr></thead><tbody>{srows}</tbody></table>
  </section>
</div>
{money_blocks(vals, 160, [-8, -12, -6, 4, 18, 31, 9], chip("bad", "trend_dn", "18%"), "peaks Saturday")}"""
    return body


# --------------------------------------------------------------------------
# a shop too new to judge
# --------------------------------------------------------------------------
def newshop() -> str:
    pre = ('<span class="sp-pre">'
           f'<span data-tip="Staffed">{svg("person")}</span>'
           f'<span data-tip="Prices set">{svg("tag")}</span>'
           f'<span class="no" data-tip="Nothing priced is in stock">{svg("crate")}</span>'
           f'<span class="unk" data-tip="Shelves: not checked until there is stock">{svg("shelves")}</span>'
           f'<span class="no" data-tip="No delivery plan">{svg("route")}</span></span>')
    shelves = [
        ("Cheap Gift", "$14.00", "—", f'<span class="sp-noplan">{svg("route")}no plan</span>', '<span class="sp-red">0</span>'),
        ("Expensive Gift", "$38.00", "—", f'<span class="sp-noplan">{svg("route")}no plan</span>', '<span class="sp-red">0</span>'),
        ("Flowers", '<span class="sp-red">no price</span>', "—", f'<span class="sp-noplan">{svg("route")}no plan</span>', "180"),
    ]
    srows = "".join(f'<tr><td class="l">{p}<span class="sub">{price}</span></td><td>{s}</td><td>{t}</td><td>{h}</td></tr>' for p, price, s, t, h in shelves)
    body = f"""
{head("MT", "Costco Gifts", "Gift Shop · 3 Madison Avenue · Midtown · opened day 187", ("Costco Cloth", "Main.dc.html"), ("Costco Law", "Office.dc.html"),
      '<span class="sp-lamp off" data-tip="Not trading"></span>' + pre + rank(None, 31, "No place yet: a rank needs seven days of trading"))}
{finds([find("crit", "alert", "tiles", "Not trading yet", "Nothing priced is in stock, and no delivery plan. Rent has run for two days.", "$2,900", "A DAY IN RENT", arrived=True),
        find("watch", "shelves", "shelves", "No plan tops these shelves up", "Nothing is routed here from a depot.", "×3")])}
<div class="sstats rv" data-block="tiles" id="sp-tiles">
  {tile("Revenue yesterday", f'—{chip("none", "ramp", "day 2 of 14", "A trend needs two full weeks. The first days are a ramp, not a trend.")}')}
  {tile("Customers", "—")}
  {tile("Profit", '<span class="neg">−$3,640</span>', costbar([("Wages", 740), ("Rent", 2900)], 3640), flag=True)}
  {tile("Door cap", '40<small>/h</small>', ceiling(["door", "counter", "person"], ""))}
</div>
<div class="duo sec" style="grid-template-columns:3fr 2fr">
  <section class="rv" data-block="standards" id="sp-standards" data-readzone>
    {sechead("standards", "Standards", "The game scores a shop once customers have walked it. Until then nothing here is known, and nothing is ticked.")}
    <div class="sp-std">
      <div class="sp-big" style="color:var(--ink-3)">—</div>
      {eq([(a, b, 0) for a, b in SAT_PARTS], unknown=True)}
      {lamps([(n, "unk", f"{t} <b>not scored yet</b>", n) for n, t in (("toilet", "Bathroom"), ("door", "Stall or door"), ("sink", "Sink"), ("music", "Music"), ("interior", "Interior design"))]
             + [("|", "", "", ""), ("locker", "miss", "<b>No uniform locker</b> installed", "locker"), ("shirt", "unk", "Uniforms <b>need the locker first</b>", "uniform")])}
    </div>
    <div class="sp-read sp-readout">Not scored yet</div>
  </section>
  <section class="rv" data-block="pull" id="sp-pull" data-readzone>
    {sechead("magnet", "Pull", "Promotion against the game's 100% cap.", cls="magnet")}
    <div class="sp-promorow"><div class="sp-promo"><i class="tr" style="width:38%" data-read="{esc("Foot traffic <b>38</b>")}"></i><u></u><u></u><u></u></div>
      <div class="sp-big" style="font-size:26px">38<small>/100</small></div></div>
    <div class="sp-minis"><span data-read="{esc("Security <b>60%</b>")}">{i("shield")}60%</span><span data-read="{esc("<b>40</b> shoppers fit inside at once")}">{i("person")}40</span></div>
    <div class="sp-wave" data-read="{esc("Gift wave over Midtown · <b>no baseline</b>: this shop has no days before the wave, and no shop like it trades outside one")}">{i("wave")}
      <div class="sp-wavebar unk"></div>
      <span><span class="sp-pips"><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i></i></span>&nbsp; 6d</span></div>
    <div class="sp-read sp-readout">&nbsp;</div>
  </section>
</div>
{roster_none()}
<div class="duo sec" style="grid-template-columns:1fr 2fr">
  <section class="rv" data-block="crew" id="sp-crew">
    {sechead("crew", "Crew", quiet="2 · $740/day")}
    <div class="crew">{person("CS", "Jo Park", "Customer service")}{person("CS", "Sam Ode", "Customer service")}</div>
  </section>
  <section class="rv" data-block="shelves" id="sp-shelves">
    {sechead("shelves", "Shelves")}
    <table><thead><tr><th>Product</th><th>Sells / day</th><th>Top-up</th><th>On hand</th></tr></thead><tbody>{srows}</tbody></table>
  </section>
</div>"""
    return body


# --------------------------------------------------------------------------
# an office
# --------------------------------------------------------------------------
def office() -> str:
    grid = hour_grid(24, 11, (8, 18), 11, lambda d, h: d <= 3 and 10 <= h <= 11 or d == 4 and h == 10,
                     lambda d, h: d == 4 and 16 <= h <= 18, "workstations", office=True)
    chips = (f'<span class="sp-hchip cap" data-show="cap"><i class="sp-sw"></i>{i("monitor")}<b>9 h/wk</b> Mon–Fri 10–12 · <b>$38k</b>/day'
             f'<span class="fix">{i("right")}another desk, and a lawyer at it</span></span>'
             f'<span class="sp-hchip idle" data-show="idle"><i class="sp-sw"></i>{i("monitor")}<b>Fri 16–19</b> 6 staffed · 1/h · 15 staff-h · <b>$1,120</b>/day</span>')
    crew = "".join([person("LW", "Eva Lind", "Lawyer"), person("LW", "Noor Aziz", "Lawyer"), person("LW", "Ben Katz", "Lawyer"),
                    person("LW", "Kai Moss", "Lawyer", off=True), person("LW", "Ida Berg", "Lawyer"), person("LW", "Raj Puri", "Lawyer"),
                    person("CL", "Pia Wolf", "Cleaning")])
    dems = (f'<span class="sp-dem quit" data-el="quit" data-tip="One person has warned they will quit">{i("exit")}<b>1</b></span>'
            + demand("desk", "A better desk", 2, 3, tip="Two lawyers want a better desk. High priority in the game's own ranking.")
            + demand("heart", "Health insurance", 5, 1, company=True, tip="Settled company-wide, not here. Low priority."))
    desks = "".join(f'<span class="sp-m" style="--h:100%" data-read="{esc(f"Workstation {k + 1} · <b>staffed</b> at the busiest hour")}">{svg("monitor")}</span>' for k in range(6))
    desks += "".join(f'<span class="sp-m z" data-read="{esc(f"Workstation {k + 7} · <b>nobody posted</b>")}">{svg("monitor")}</span>' for k in range(2))
    vals = series(30, 50500, 99, 1, 5)
    body = f"""
{head("MT", "Costco Law", "Law Firm · 40 Park Avenue · Midtown · opened day 112", ("Costco Cloth", "Main.dc.html"), ("Depot West", "Warehouse.dc.html"),
      LAMP_ON + rank(14, 31, "14th of the 31 sites that trade, by profit over the last 7 days: $358k"))}
{finds([find("crit", "crew", "crew", "One lawyer has warned they will quit", "Two want a better desk, which the game ranks high.", "×1", hit="quit demand", arrived=True),
        find("watch", "hours", "hours", "Every workstation full 9 hours a week", "Workstations are the limit, so the answer is another desk and a lawyer at it.", "$38k", "A DAY THROUGH IT"),
        find("watch", "standards", "standards", "Satisfaction at 76%", "Pricing is what clients mark down.", "58%", "PRICING")])}
<div class="sstats rv" data-block="tiles" id="sp-tiles">
  {tile("Revenue yesterday", f'$96,400{chip("dim", "trend_up", "4%", "Days 183–189 against 176–182")}', spark([v * 1.9 for v in vals[-14:]], 176, "$"))}
  {tile("Clients", '212<small>$455/hour billed</small>', spark([v / 238 for v in vals[-14:]], 176, ""))}
  {tile("Profit", '<span class="pos">$51,900</span><small>53.8%</small>', costbar([("Wages", 36200), ("Rent", 5100), ("Marketing", 3200), ("Profit", 51900)], 96400))}
  {tile("Workstations", '8<small>· 9 h/wk full</small>', ceiling(["door", "monitor", "person"], "monitor"))}
</div>
<div class="duo sec" style="grid-template-columns:1fr 1fr">
  <section class="rv" data-block="standards" id="sp-standards" data-readzone>
    {sechead("standards", "Standards", "What clients make of the firm. Offices are not asked about bathrooms, music or uniforms.")}
    <div class="sp-std"><div class="sp-big warn">76<small>%</small></div>{eq([(a, b, v) for (a, b), v in zip(SAT_PARTS, (91, 58, 84, 82))])}</div>
    <div class="sp-read sp-readout">Hover a bar</div>
  </section>
  <section class="rv" data-block="desks" id="sp-desks" data-readzone>
    {sechead("monitor", "Desks", "A workstation bills 3 clients an hour while someone sits at it.", quiet="3 clients/h each")}
    <div class="sp-mach" style="gap:10px;flex-wrap:wrap">{desks}</div>
    <div class="sp-read sp-readout">6 of 8 staffed at the busiest hour</div>
  </section>
</div>
{hours_block(grid, "Two weeks of hour reports. An outlined hour had every staffed workstation billing; a hatched one had lawyers at desks and nobody to bill.", chips)}
<div class="duo sec" style="grid-template-columns:1fr 1fr">
  <section class="rv" data-block="crew" id="sp-crew">
    {sechead("crew", "Crew", quiet="7 · $36,200/day")}
    <div class="crew">{crew}</div>
    <div class="sp-dems">{dems}</div>
  </section>
  <section class="rv" data-block="shelves" id="sp-shelves">
    {sechead("fees", "Fees")}
    <table><thead><tr><th>Fee</th><th>Hours billed / day</th><th>Revenue / day</th></tr></thead><tbody>
      <tr><td class="l">Legal Advice<span class="sub">$455.00</span></td><td>212</td><td>$96,400</td></tr></tbody></table>
  </section>
</div>
{money_blocks(vals, 160, [6, 9, 8, 7, 4, -17, -17], chip("dim", "trend_up", "4%"), "peaks Tuesday")}"""
    return body


# --------------------------------------------------------------------------
# a warehouse: a pipe, read as a week of trucks
# --------------------------------------------------------------------------
def rail(cover: int, truck: int | None, held: bool = False, dead: bool = False) -> str:
    if dead:
        return '<span class="sp-rail">' + "<i></i>" * 7 + '</span> <span class="sp-zz">zzz</span>'
    end = cover if truck is None else 7 if held else truck
    cells = "".join(f'<i class="{"c" if k < cover or (not held and truck is not None and k >= truck) else "d" if k < end else ""}"></i>' for k in range(7))
    trk = "" if truck is None else f'<span class="trk {"held" if held else ""}" style="--d:{truck}">{svg("truck")}</span>'
    return f'<span class="sp-rail">{cells}{trk}</span>'


def warehouse() -> str:
    days = '<span class="sp-days">' + "".join(f'<b class="{"now" if k == 0 else ""}">{d}</b>' for k, d in enumerate("SMTWTFS")) + "</span>"
    rows = [
        ("Soda", "2,100", "1,150", rail(2, 4), up("+2,400", "by Tue"), "8,000", 4, "short", "Runs dry <b>Tuesday</b>, the truck lands <b>Thursday</b>"),
        ("Cheap Gift", "640", "310", rail(2, 5, held=True), f'<span class="sp-up bad">{svg("pause")}paused</span>', "2,200", 2, "paused", "Import <b>paused</b>; dry from <b>Tuesday</b>"),
        ("Fries", "9,300", "1,900", rail(5, 3), "", up("12,000", "13,300", bad=False), 3, "order", "A week draws <b>13,300</b>; the order brings <b>12,000</b>"),
        ("Clothing (Modern Cheap Male)", "9,800", "1,200", rail(7, 6), "", "8,400", 5, "", "Covered through the week"),
        ("Burger", "14,200", "4,100", rail(3, None), "", f'<span class="quiet">{"made at Costco Works"}</span>', 4, "", "Made in-house; <b>3.5 days</b> on hand"),
        ("Napkins", "5,000", "0", rail(0, None, dead=True), "", "—", 0, "dead", "<b>Nothing draws</b> on these"),
    ]
    trs = ""
    for item, hand, draw, r, act, weekly, feeds, el, read in rows:
        trs += (f'<tr data-el="{el}" data-read="{esc(read)}"><td class="l">{item}</td><td>{hand}</td><td>{draw}</td><td class="l">{r}</td>'
                f'<td>{act}</td><td>{weekly}</td><td>{feeds or "—"}</td></tr>')
    feeds = [("LM", "Costco Burger", 4100), ("MT", "Costco Burger", 3600), ("LM", "Costco Cloth", 1200), ("HK", "Costco Liquor", 1150),
             ("MT", "Costco Gifts", 310), ("GA", "Costco Works", 960)]
    frows = "".join(f'<div class="sp-feed"><span class="hood">{h}</span><span>{n}</span><span class="tr"><i style="--w:{u / 41:.0f}%"></i></span><span class="c">{u:,}/day</span></div>' for h, n, u in feeds)
    body = f"""
{head("HK", "Depot West", "Warehouse · 1 Airport Avenue · Hell's Kitchen · opened day 44", ("Costco Law", "Office.dc.html"), ("Costco Works", "Factory.dc.html"))}
{finds([find("crit", "truck", "stock", "Cheap Gift import is paused", "The depot still ships 310 a day and has two days left.", "2 d", "LEFT", hit="paused", arrived=True),
        find("crit", "truck", "stock", "Soda runs dry before its truck", "Dry Tuesday, delivery Thursday. A weekly order cannot bridge that; bring in 2,400 by hand.", "+2,400", "BY TUE", hit="short"),
        find("watch", "truck", "stock", "Fries order is too small for its week", "A week draws 13,300 and the order brings 12,000.", "13,300", "SET TO", hit="order"),
        find("opp", "crate", "stock", "Napkins are not moving", "5,000 on the floor and nothing draws on them.", "5,000", hit="dead")])}
<div class="sstats rv" data-block="tiles" id="sp-tiles">
  {tile("Cost / day", '$6,900', costbar([("Rent", 5200), ("Wages", 1700)], 6900))}
  {tile("On the floor", '41,040<small>6 lines</small>')}
  {tile("Thinnest", '<span class="neg">1.8 d</span><small>Soda</small>', meter(26, "Soda: <b>1.8</b> of the 4 days until its truck", bad=True), flag=True)}
  {tile("Feeds", '6<small>sites · 11,320/day</small>')}
</div>
<section class="sec rv" data-block="stock" id="sp-stock" data-readzone>
  {sechead("crate", "Stock", "The next seven days, left to right from today. Green is covered, red hatching is dry, the truck sits on the day it lands.")}
  <table><thead><tr><th>Line</th><th>On hand</th><th>Draw / day</th><th class="l">{days}</th><th></th><th>Weekly order</th><th>Feeds</th></tr></thead><tbody>{trs}</tbody></table>
  <div class="sp-read sp-readout">Hover a line</div>
</section>
<div class="duo sec" style="grid-template-columns:1fr 1fr">
  <section class="rv" data-block="feeds" id="sp-feeds">
    {sechead("pipe", "Feeds")}
    <div class="sp-feeds">{frows}</div>
  </section>
  <section class="rv" data-block="crew" id="sp-crew">
    {sechead("crew", "Crew", quiet="2 · $1,700/day")}
    <div class="crew">{person("LG", "Max Ito", "Logistics")}{person("LG", "Ann Dahl", "Logistics")}</div>
  </section>
</div>"""
    return body


# --------------------------------------------------------------------------
# a factory
# --------------------------------------------------------------------------
def factory() -> str:
    gear = svg("gear")
    m = lambda h, read: f'<span class="sp-m" style="--h:{h}%" data-read="{esc(read)}">{gear}</span>'
    lines = [
        ("burger", "Burger", "Food Workstation · #1 #2", m(100, "Machine 1 · <b>168 of 168 h</b> rostered") + m(100, "Machine 2 · <b>168 of 168 h</b> rostered"),
         "", "9,600", "9,600", "9,480", "2,100", ""),
        ("wine", "Bottle of Wine", "Bottled Goods Workstation · #3", m(86, "Machine 3 · <b>144 of 168 h</b> rostered: nobody Sunday"),
         "", "1,029", "1,200", "470", f'<span class="sp-pile" data-el="piling">{i("crate")}9,400</span>', ""),
    ]
    lrows = ('<div class="sp-line head"><span>Line</span><span>Machines</span><span></span><span class="n">Makes / day</span>'
             '<span class="n">Ships / day</span><span class="n">On hand</span></div>')
    for key, item, ws, mach, belt, makes, rated, ships, stock, _ in lines:
        lrows += (f'<div class="sp-line" data-line="{key}"><div>{item}<span class="sub">{ws}</span></div><div class="sp-mach">{mach}</div>'
                  f'<div class="sp-belt {belt}"></div><div class="n">{makes}<small>of {rated}</small></div><div class="n">{ships}</div><div class="n">{stock}</div></div>')
    lrows += (f'<div class="sp-line" data-line="unnamed" data-el="unnamed"><div><select class="sp-pick" aria-label="Name this line"><option>Which recipe is this?</option><option>Pizza</option><option>Hot Dog</option><option>Donut</option></select>'
              f'<span class="sub">Food Workstation · #4</span></div><div class="sp-mach"><span class="sp-m q" data-read="{esc("Machine 4 · running a recipe <b>the board cannot name</b>")}">?</span></div>'
              '<div class="sp-belt"></div><div class="n">—</div><div class="n">—</div><div class="n">—</div></div>')
    lrows += (f'<div class="sp-line" data-line="idle" data-el="unset"><div class="quiet">No recipe<span class="sub">Bottled Goods Workstation · #5</span></div>'
              f'<div class="sp-mach"><span class="sp-m z" data-read="{esc("Machine 5 · staffed and rented, <b>making nothing</b>")}">zz</span></div>'
              '<div class="sp-belt stop"></div><div class="n">0</div><div class="n">0</div><div class="n">0</div></div>')
    inputs = [
        ("Ground Beef", "burger", "9,600", up("8,000", "9,600"), "8,000", "1,900", "Depot West", "target", "Tops up to <b>8,000</b>, the machines eat <b>9,600</b>"),
        ("Dough", "burger", "9,600", "9,600", "9,600", "4,100", "Depot West", "", "In step"),
        ("Cheese", "burger", "1,920", "2,000", "1,950", "2,300", "Depot West", "", "In step"),
        ("Grapes", "wine", "2,400", "2,400", "2,380", "3,000", "Depot West", "", "In step"),
        ("Sugar", "wine", "1,200", "1,200", '<span class="sp-red">0</span>', "310", "Depot West", "stalled", "Planned, stocked at the depot, and <b>nothing arrived all week</b>"),
        ("Yeast", "wine", "1,200", f'<span class="sp-noplan">{svg("route")}no plan</span>', "—", "5,200", "—", "noplan", "<b>No plan</b> tops this up; it lives off what is on the floor"),
    ]
    irows = "".join(f'<tr data-lines="{ln}" data-el="{el}" data-read="{esc(read)}"><td class="l">{item}</td><td>{need}</td><td>{top}</td><td>{arr}</td><td>{hand}</td><td class="l" style="color:var(--ink-2)">{frm}</td></tr>'
                    for item, ln, need, top, arr, hand, frm, el, read in inputs)
    crew = "".join([person("FW", "Ivo Marsh", "Factory worker"), person("FW", "Lena Roth", "Factory worker"), person("FW", "Abe Stone", "Factory worker"),
                    person("FW", "Yui Tan", "Factory worker", off=True), person("FW", "Omar Haq", "Factory worker"), person("CL", "Bea Flynn", "Cleaning")])
    body = f"""
{head("GA", "Costco Works", "Factory · 9 Pier Road · Garment District · opened day 96 · from Depot West", ("Depot West", "Warehouse.dc.html"), ("14 Bleecker Street", "Home.dc.html"))}
{finds([find("crit", "pipe", "inputs", "Ground Beef arrives short", "The route tops up to 8,000 and two burger machines eat 9,600 a day.", "9,600", "SET TO", hit="target", arrived=True),
        find("crit", "pipe", "inputs", "Sugar stalled on its route", "Planned and stocked at Depot West, and nothing arrived all week.", "0", "ARRIVED", hit="stalled"),
        find("watch", "gear", "lines", "A machine runs a recipe with no name", "Pick it once and the inputs and orders follow.", "#4", hit="unnamed"),
        find("watch", "gear", "lines", "A machine has no recipe", "Staffed and rented, making nothing.", "#5", hit="unset"),
        find("opp", "gear", "lines", "Wine is piling up", "9,400 bottles on the floor; 470 a day leave and 1,029 are made.", "9,400", hit="piling", extra=True),
        find("watch", "pipe", "inputs", "No plan tops up Yeast", "It lives off what is on the floor: 4 days.", "4 d", hit="noplan", extra=True)], hidden=2)}
<div class="sstats rv" data-block="tiles" id="sp-tiles">
  {tile("Machines", '5<small>· 3 running</small>')}
  {tile("Made / day", '10,629<small>of 10,800 rated</small>', meter(98, "<b>98%</b> of the rated output: one machine is unposted on Sundays"))}
  {tile("Shipped / day", '9,950', meter(94, "<b>94%</b> of what is made leaves; the rest piles up"))}
  {tile("Cost / day", '$9,400', costbar([("Wages", 5300), ("Rent", 4100)], 9400))}
</div>
<section class="sec rv" data-block="lines" id="sp-lines" data-readzone>
  {sechead("gear", "Lines", "A machine runs only while someone is posted to it. The fill of each square is the share of the week it is rostered.")}
  <div class="sp-lines">{lrows}</div>
  <div class="sp-read sp-readout">Hover a machine</div>
</section>
<section class="sec rv" data-block="inputs" id="sp-inputs" data-readzone>
  {sechead("pipe", "Inputs", "What the machines eat at full rate, against the daily top-up set to feed them.")}
  <table><thead><tr><th>Input</th><th>Eats / day</th><th>Top-up</th><th>Arrived / day</th><th>On hand</th><th class="l">From</th></tr></thead><tbody>{irows}</tbody></table>
  <div class="sp-read sp-readout">Hover an input</div>
</section>
<section class="sec rv" data-block="crew" id="sp-crew">
  {sechead("crew", "Crew", quiet="6 · $5,300/day")}
  <div class="crew">{crew}</div>
  <div class="sp-dems">{demand("clock", "Shorter shifts", 3, 2, tip="Three people want shorter shifts. Medium priority.")}</div>
</section>"""
    return body


# --------------------------------------------------------------------------
# a home
# --------------------------------------------------------------------------
def home() -> str:
    wins = ""
    lit = {(0, 1), (2, 0), (3, 2)}
    for r in range(4):
        for c in range(3):
            cls = "win on" if (r, c) in lit else "win late" if (r, c) in {(1, 1), (2, 2)} else "win"
            wins += f'<rect class="{cls}" x="{130 + c * 40}" y="{48 + r * 34}" width="22" height="22" rx="2" style="transition-delay:{(r * 3 + c) * 45}ms"></rect>'
    house = f"""<svg viewBox="0 0 360 230" role="img" aria-label="An apartment block at night">
  <circle class="moon" cx="292" cy="46" r="15"></circle>
  <circle class="star" cx="60" cy="40" r="1.6"></circle><circle class="star" cx="96" cy="76" r="1.2"></circle><circle class="star" cx="250" cy="92" r="1.4"></circle><circle class="star" cx="326" cy="112" r="1.2"></circle>
  <rect class="wall" x="116" y="32" width="128" height="178" rx="3"></rect>
  <path class="wall" d="M110 32h140l-8-12H118z"></path>
  {wins}
  <rect class="win" x="168" y="182" width="24" height="28" rx="2"></rect><rect class="doorleaf" x="168" y="182" width="24" height="28" rx="2"></rect>
  <path class="tree" d="M70 210v-26M70 150c-16 0-22 12-22 22s10 16 22 16 22-6 22-16-6-22-22-22z"></path>
  <path class="ground" d="M20 210h320" fill="none"></path>
</svg>"""
    body = f"""
{head("GV", "14 Bleecker Street", "Home · Greenwich Village", ("Costco Works", "Factory.dc.html"), ("Costco Cloth", "Main.dc.html"))}
<div class="sp-home rv" data-block="home">
  <div class="sp-house">{house}</div>
  <div class="sp-hometiles">
    {tile("Rent / day", "$1,150")}
    {tile("Rent / week", "$8,050")}
    {tile("Size", '204<small>m²</small>')}
    {tile("Per m²", '$5.64<small>/day</small>')}
  </div>
</div>"""
    return body


# --------------------------------------------------------------------------
# a roster too big for pills
# --------------------------------------------------------------------------
FIRST = ["Ana", "Ben", "Cleo", "Dev", "Eva", "Finn", "Gia", "Hugo", "Ida", "Jo", "Kai", "Lena", "Max", "Noor", "Omar", "Pia", "Raj", "Sam", "Tess", "Uma", "Vic", "Wren", "Yui", "Zoe"]
LAST = ["Aziz", "Bell", "Cho", "Dahl", "Ek", "Flynn", "Gray", "Haq", "Ito", "Katz", "Lind", "Moss", "Nowak", "Ode", "Park", "Roth", "Stone", "Tan", "Wolf"]


def roster(roles: list[tuple], open_role: str = "") -> str:
    """Over a dozen people, the pills fold into one row a role and one dot a person."""
    random.seed(21)
    out = ""
    for code, role, count, pay, off in roles:
        names = [f"{random.choice(FIRST)} {random.choice(LAST)}" for _ in range(count)]
        away = set(random.sample(range(count), off))
        dots = "".join(f'<span class="sp-dot {"off" if k in away else ""}" style="--k:{k}" '
                       f'data-read="{esc(f"<b>{n}</b> · {role} · ${pay:,}/day" + (" · off today" if k in away else ""))}"></span>' for k, n in enumerate(names))
        pills = "".join(person(code, n, role, off=k in away) for k, n in enumerate(names))
        out += (f'<div class="sp-rrow {"open" if role == open_role else ""}"><button type="button" class="sp-rbtn" aria-expanded="{"true" if role == open_role else "false"}"><i>{code}</i>{role}{i("chev")}</button>'
                f'<div class="sp-dots">{dots}</div><div class="c"><b>{count}</b>{f" · {off} off" if off else ""} · ${count * pay:,}/day</div>'
                f'<div class="sp-rpeople"><div class="crew">{pills}</div></div></div>')
    return f'<div class="sp-roster">{out}</div>'


def bigcrew() -> str:
    roles = [("HD", "Hairdresser", 34, 310, 4), ("CS", "Customer service", 6, 240, 1), ("CL", "Cleaning", 4, 190, 0),
             ("MG", "Manager", 1, 520, 0), ("SG", "Security", 1, 260, 0)]
    dems = (f'<span class="sp-dem quit" data-tip="Two people have warned they will quit">{i("exit")}<b>2</b></span>'
            + demand("clock", "Weekends off", 11, 3, tip="Eleven people want their weekends free. High priority in the game's own ranking.")
            + demand("desk", "A better station", 5, 2, tip="Five hairdressers want a better station. Medium priority.")
            + demand("heart", "Health insurance", 19, 1, company=True, tip="Settled company-wide, not here. Low priority."))
    return f"""
{head("SH", "Costco Cuts", "Hairdresser · 8 Spring Street · SoHo · opened day 74", ("14 Bleecker Street", "Home.dc.html"), ("Costco Cloth", "Main.dc.html"),
      LAMP_ON + rank(9, 31, "9th of the 31 sites that trade, by profit over the last 7 days: $512k"))}
<section class="sec rv" data-block="crew" id="sp-crew" data-readzone>
  {sechead("crew", "Crew", "One dot a person; a hollow dot is off today. Open a role for its people.", quiet="46 · 5 off · $13,280/day")}
  {roster(roles, open_role="Customer service")}
  <div class="sp-dems">{dems}</div>
  <div class="sp-read sp-readout">Hover a dot</div>
</section>"""


# --------------------------------------------------------------------------
# the behaviour every artboard carries; each part does nothing where its
# elements are absent
# --------------------------------------------------------------------------
WIRE = r"""
    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    const board = $('.board');
    // dead links stay put; links to another artboard are left to the canvas
    document.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a && (a.getAttribute('href') || '#').charAt(0) === '#') e.preventDefault(); });

    // everything arrives
    const rv = $$('.rv'), vh = window.innerHeight || 1000;
    rv.forEach((el, k) => { el.style.transitionDelay = (k % 8) * 70 + 'ms'; if (el.getBoundingClientRect().top < vh) el.classList.add('in'); });
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: .05 });
      rv.forEach(el => { if (!el.classList.contains('in')) io.observe(el); });
    }
    setTimeout(() => rv.forEach(el => el.classList.add('in')), 2500);

    // the nav underline
    const nav = $('#nav');
    if (nav) { const ink = (a) => { if (!a) return; const r = a.getBoundingClientRect(), n = nav.getBoundingClientRect();
        nav.style.setProperty('--nx', (r.left - n.left) + 'px'); nav.style.setProperty('--nw', r.width + 'px'); };
      const homeInk = () => ink($('a.on', nav));
      $$('a', nav).forEach(a => a.addEventListener('mouseenter', () => ink(a))); nav.addEventListener('mouseleave', homeInk);
      setTimeout(homeInk, 50); setTimeout(homeInk, 600); }

    // whatever is under the pointer reads out on the line reserved for it
    $$('[data-readzone]').forEach(zone => {
      const out = $('.sp-readout', zone); if (!out) return; const rest = out.innerHTML;
      $$('[data-read]', zone).forEach(el => el.addEventListener('mouseenter', () => { out.innerHTML = el.dataset.read; }));
      zone.addEventListener('mouseleave', () => { out.innerHTML = rest; });
    });

    // a finding lights the block that holds its evidence, and the thing inside it
    $$('.sp-find').forEach(f => {
      const blk = $('[data-block="' + f.dataset.ev + '"]');
      const hits = (f.dataset.hit || '').split(' ').filter(Boolean).reduce((all, h) => all.concat($$('[data-el~="' + h + '"]')), []);
      f.addEventListener('mouseenter', () => { board.classList.add('sp-focus'); if (blk) blk.classList.add('sp-lit'); hits.forEach(h => h.classList.add('sp-hit')); });
      f.addEventListener('mouseleave', () => { board.classList.remove('sp-focus'); if (blk) blk.classList.remove('sp-lit'); hits.forEach(h => h.classList.remove('sp-hit')); });
      f.addEventListener('click', () => { if (blk) blk.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    });
    $$('[data-allfinds]').forEach(a => a.addEventListener('click', () => { const list = a.closest('.sp-findmore').previousElementSibling; list.classList.add('all'); a.closest('.sp-findmore').remove(); }));

    // a ceiling or idle chip picks its hours out of the grid
    $$('.sp-hchip[data-show]').forEach(c => { const grid = $('.hours', c.closest('section')); if (!grid) return;
      c.addEventListener('mouseenter', () => grid.classList.add('sp-show' + c.dataset.show));
      c.addEventListener('mouseleave', () => grid.classList.remove('sp-show' + c.dataset.show)); });

    // the roster: a day at a time, now against plan, and a tick for every shift typed
    $$('.sp-daytabs a').forEach(a => a.addEventListener('click', () => { const sec = a.closest('section');
      $$('.sp-daytabs a', sec).forEach(x => x.classList.toggle('on', x === a));
      $$('.sp-day', sec).forEach(dy => dy.classList.toggle('on', dy.dataset.d === a.dataset.day)); }));
    $$('.sp-nowplan a').forEach(a => a.addEventListener('click', () => { const sec = a.closest('section');
      $$('.sp-nowplan a', sec).forEach(x => x.classList.toggle('on', x === a));
      $('.sp-gantt', sec).classList.toggle('now', a.dataset.view === 'now'); }));
    const typed = () => { const sec = $('#sp-roster'); if (!sec || !$('.sp-count', sec)) return; const n = $$('.sp-shift.done', sec).length, ring = $('.sp-ring', sec);
      $('.sp-count', sec).textContent = n; ring.style.setProperty('--p', n / 56 * 100); ring.classList.add('bump'); setTimeout(() => ring.classList.remove('bump'), 260); };
    $$('button.sp-shift').forEach(b => b.addEventListener('click', () => { b.classList.toggle('done'); typed(); }));
    $$('.sp-step').forEach(b => b.addEventListener('click', () => b.classList.toggle('done')));
    // a person and their shifts find each other
    $$('[data-p]').forEach(el => { const all = () => $$('[data-p="' + el.dataset.p + '"]');
      el.addEventListener('mouseenter', () => all().forEach(x => x.classList.add('sp-me')));
      el.addEventListener('mouseleave', () => all().forEach(x => x.classList.remove('sp-me'))); });

    // a role opens into its people
    $$('.sp-rbtn').forEach(b => b.addEventListener('click', () => { const row = b.closest('.sp-rrow'); const on = row.classList.toggle('open'); b.setAttribute('aria-expanded', on ? 'true' : 'false'); }));

    // an input lights the lines that eat it
    const lines = $('.sp-lines');
    if (lines) $$('tr[data-lines]').forEach(tr => {
      tr.addEventListener('mouseenter', () => { lines.classList.add('dim'); tr.dataset.lines.split(' ').forEach(k => { const l = $('[data-line="' + k + '"]', lines); if (l) l.classList.add('lit'); }); });
      tr.addEventListener('mouseleave', () => { lines.classList.remove('dim'); $$('.lit', lines).forEach(l => l.classList.remove('lit')); });
    });
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
<div class="board {{theme}}" style="width: __W__px; height: __H__px;">
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
<body><div class="board __THEME__"><div class="wrap">__MAST__
__BODY__
</div></div>
<script>window.addEventListener('load', function () {__WIRE__});</script></body></html>
"""

W = 1440
# file, title, builder, height
BOARDS = [
    ("Main.dc.html", "Shop", retail, 2630),
    ("NewShop.dc.html", "Shop · too new to judge", newshop, 1360),
    ("Office.dc.html", "Office", office, 1750),
    ("Warehouse.dc.html", "Warehouse", warehouse, 1390),
    ("Factory.dc.html", "Factory", factory, 1690),
    ("Home.dc.html", "Home", home, 580),
    ("BigCrew.dc.html", "Crew · a big roster", bigcrew, 790),
]
TIPS = {
    "Main.dc.html": "Hover a finding: the block holding its evidence lights, and the thing inside it pulses. Click and the page goes there. Every block reads out what is under the pointer on its own line, so the labels stay off the page. Try the lamps, the cost bar, the chips under the hour grid and the magnet. The chip by the name is its place by the last 7 days of profit. Roster: flip now and plan, step through the days, click a shift once it is typed, hover a person in Crew.",
    "NewShop.dc.html": "The honest states. Five pre-flight lamps in the head say why it is not trading; a grey one was never checked, because the alert stops at the first of prices, stock and shelves that fails. Nothing is ticked that the game never scored: dashed means unknown, never fine. No trend before two weeks; a wave with no baseline is hatched, not guessed.",
    "Office.dc.html": "Same skeleton, office words: clients, workstations, fees. No amenity lamps, because offices are never asked.",
    "Warehouse.dc.html": "A warehouse is a pipe, so it reads as a week of trucks. Green is covered, red hatching is dry, the truck drives in to the day it lands. A struck truck is a paused import.",
    "Factory.dc.html": "Each square is a machine, filled by the share of the week someone is posted to it. Hover an input and the lines that eat it spin up.",
    "BigCrew.dc.html": "Past a dozen people the pills fold into one row a role and one dot a person, so 46 staff take the room 6 did. Hover a dot and it names itself on the line below; run the pointer along a row and the dots hop. Click a role to open its people as the usual pills. A hollow dot is off today.",
    "Home.dc.html": "The save knows a home's address and rent; the building table adds its size. That is all there is, so that is all it shows. Hover the block.",
}


def css(theme: str) -> str:
    base = BOARD_CSS.replace("@import url('" + FONTS + "');", "")
    if theme == "light":
        base = base.replace("body{margin:0;background:#0d100f}", "body{margin:0;background:#eef0ea}")
    return base + SP_CSS


def build(preview: bool = False) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    boards, order, notes = {}, [], {}
    x = y = 0
    row_h = 0
    for k, (name, title, builder, h) in enumerate(BOARDS):
        body = builder()
        props = {"dark": {"editor": "boolean", "default": True, "section": "Theme"}, "$preview": {"width": W, "height": h}}
        page = (PAGE.replace("__TITLE__", "Site panel: " + title).replace("__FONTS__", FONTS.replace("&", "&amp;"))
                .replace("__CSS__", css("dark")).replace("__W__", str(W)).replace("__H__", str(h))
                .replace("__MAST__", masthead()).replace("__BODY__", body)
                .replace("__PROPS__", json.dumps(props, separators=(",", ":"))).replace("__LOGIC__", LOGIC))
        (ROOT / name).write_text(page, encoding="utf-8", newline="\n")
        if preview:
            out = HERE / "_preview"
            out.mkdir(exist_ok=True)
            for theme in ("", "light"):
                (out / f"{name.split('.')[0]}{'-light' if theme else ''}.html").write_text(
                    PREVIEW.replace("__TITLE__", title).replace("__FONTS__", FONTS.replace("&", "&amp;")).replace("__CSS__", css(theme or "dark"))
                    .replace("__THEME__", theme).replace("__MAST__", masthead()).replace("__BODY__", body).replace("__WIRE__", WIRE),
                    encoding="utf-8", newline="\n")
        x = (k % 2) * (W + 120)
        if k % 2 == 0 and k:
            y += row_h + 360
            row_h = 0
        row_h = max(row_h, h)
        boards[name] = {"x": x, "y": y, "w": W, "h": h, "title": title, "is_interactive": True}
        order.append(name)
        notes["try-" + name.split(".")[0].lower()] = {"x": x, "y": y - 250, "w": 560, "maxH": 190, "text": TIPS[name]}
    # the roster is a state of Crew, not a seventh kind of site: it sits under Home, beside the factory
    hx, hy, hh = boards["Home.dc.html"]["x"], boards["Home.dc.html"]["y"], boards["Home.dc.html"]["h"]
    boards["BigCrew.dc.html"].update(x=hx, y=hy + hh + 360)
    notes["try-bigcrew"].update(x=hx, y=hy + hh + 110)
    index = {"v": 3, "createdOnFiles": {"v": 1, "at": CREATED_AT}, "title": "Big Copilot Site Panel", "launch": {"view": "canvas"},
             "pages": [], "boards": boards, "order": order, "notes": notes, "designSystems": []}
    (ROOT / "canvas.json").write_text(json.dumps(index, indent=1), encoding="utf-8", newline="\n")
    print("wrote", len(order), "artboards")


if __name__ == "__main__":
    build("--preview" in sys.argv)
