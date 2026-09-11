"""Writes the revamp artboards (*.dc.html) and canvas.json next to this file.

One shared stylesheet, masthead and interaction script go into every artboard,
because artboards on the design canvas share nothing at runtime. Numbers are
the Costco save of day 189 as the board rendered it on 9 Sep 2026.
"""
from __future__ import annotations

import json
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))

# --------------------------------------------------------------------------
# tokens + stylesheet (the board's own palette and type, recomposed)
# --------------------------------------------------------------------------
CSS = r"""
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
body{margin:0;background:#0d100f}
a{color:#43c07a}a:hover{color:#6fd39a}
.board{
  --ground:#0d100f;--surface:#151917;--raised:#1c211e;
  --ink:#e9ece6;--ink-2:#9aa39d;--ink-3:#6b756f;
  --rule:#262c28;--rule-soft:#1e2320;
  --accent:#43c07a;--accent-soft:#43c07a26;
  --pos:#43c07a;--neg:#ff6257;--warn:#f0913a;--info:#6ea8ff;
  --tip-bg:#e9ece6;--tip-ink:#0d100f;
  width:100%;min-width:1240px;min-height:100vh;box-sizing:border-box;padding:0 0 72px;position:relative;overflow:clip;
  background:var(--ground);color:var(--ink);
  font-family:Archivo,"Helvetica Neue",Arial,sans-serif;font-size:14px;line-height:1.45;
  -webkit-font-smoothing:antialiased;
}
.board.light{
  --ground:#eef0ea;--surface:#fdfdfb;--raised:#f3f4ef;
  --ink:#15181a;--ink-2:#5b6469;--ink-3:#8b9499;
  --rule:#d2d6cd;--rule-soft:#e0e3da;
  --accent:#00703a;--accent-soft:#00703a1f;
  --pos:#00703a;--neg:#cc2a20;--warn:#c25400;--info:#2a5ea8;
  --tip-bg:#15181a;--tip-ink:#f3f4ef;
}
.board *{box-sizing:border-box}
.mono{font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace;font-variant-numeric:tabular-nums}
.pos{color:var(--pos)}.neg{color:var(--neg)}.warn{color:var(--warn)}
.wrap{width:min(1180px,calc(100% - 80px));margin:0 auto;position:relative;z-index:1}
svg{display:block}

/* everything arrives: sections slide in when they come into view -------- */
.rv{opacity:0;transform:translateY(12px);transition:opacity .55s ease,transform .55s cubic-bezier(.2,.7,.2,1)}
.rv.in{opacity:1;transform:none}

/* masthead: wordmark, five places, the clock ------------------------------ */
.mast{display:flex;align-items:center;gap:40px;height:100px;border-bottom:1px solid var(--rule);position:sticky;top:0;z-index:5;background:var(--ground)}
.brand{display:flex;align-items:baseline;gap:2px;user-select:none}
.wordmark{font-size:30px;font-weight:800;letter-spacing:-.045em;line-height:1;cursor:pointer}
.dot{
  display:inline-block;width:11px;height:11px;border-radius:50%;background:var(--accent);
  transform-origin:50% 100%;transition:transform .25s cubic-bezier(.34,1.56,.64,1);cursor:pointer;
}
.brand:hover .dot{transform:translateY(-6px) scale(1.15)}
.dot.spin{animation:coinspin .6s linear}
.dot.kick{animation:kick .7s cubic-bezier(.34,1.56,.64,1)}
@keyframes kick{30%{transform:translateY(-6px) scale(1.8)}60%{transform:scale(.6)}100%{transform:none}}
@keyframes coinspin{from{transform:rotateY(0)}to{transform:rotateY(720deg)}}
.coin{
  position:absolute;width:9px;height:9px;border-radius:50%;background:var(--accent);
  pointer-events:none;animation:fall 1.1s cubic-bezier(.2,.7,.4,1) forwards;z-index:9;
}
@keyframes fall{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(.6);opacity:0}}
.nav{position:relative;display:flex;gap:4px;margin-left:8px}
.nav a{
  display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:6px;
  color:var(--ink-2);text-decoration:none;font-weight:500;font-size:13.5px;transition:color .15s;
}
.nav a svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.nav a:hover svg{transform:translateY(-2px) rotate(-6deg)}
.nav a:hover,.nav a.on{color:var(--ink)}
.nav .ink{
  position:absolute;bottom:-1px;height:2px;background:var(--accent);border-radius:2px;
  left:var(--nx,0);width:var(--nw,0);transition:left .28s cubic-bezier(.4,0,.2,1),width .28s cubic-bezier(.4,0,.2,1);
}
.clock{margin-left:auto;text-align:right;cursor:default}
.clock b{font-family:"IBM Plex Mono",monospace;font-weight:500;font-size:16px;letter-spacing:.01em}
.clock b i{font-style:normal;color:var(--ink-3);margin:0 6px}
@keyframes blink{50%{opacity:.25}}
.clock small{display:block;font-family:"IBM Plex Mono",monospace;font-size:10.5px;letter-spacing:.06em;color:var(--ink-3);margin-top:3px}

/* tooltips: the sentence lives here now, not on the page --------------------- */
[data-tip]{position:relative}
[data-tip]::after{
  content:attr(data-tip);position:absolute;left:0;top:calc(100% + 8px);z-index:8;
  background:var(--tip-bg);color:var(--tip-ink);padding:7px 10px;border-radius:5px;
  font:400 12px/1.4 Archivo,sans-serif;white-space:normal;width:max-content;max-width:300px;
  opacity:0;transform:translateY(-3px);pointer-events:none;transition:opacity .15s,transform .15s;
}
[data-tip]:hover::after{opacity:1;transform:translateY(0)}
[data-tip].tr::after{left:auto;right:0}

/* sections ----------------------------------------------------------------- */
.sec{margin-top:44px}
.sechead{display:flex;align-items:center;gap:14px;margin-bottom:14px}
.sechead h2{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em}
.sechead .aside{margin-left:auto;display:flex;align-items:center;gap:8px}
.why{
  width:18px;height:18px;border-radius:50%;border:1px solid var(--rule);color:var(--ink-3);
  display:grid;place-items:center;font:500 11px/1 "IBM Plex Mono",monospace;cursor:help;overflow:visible;z-index:30;
}
.why i{font-style:normal;display:block}
.why:hover{color:var(--ink);border-color:var(--ink-3)}
.why:hover i{animation:qdrop .5s cubic-bezier(.34,1.56,.64,1)}
@keyframes qdrop{0%{transform:translateY(-16px);opacity:0}100%{transform:none;opacity:1}}
.why::after{left:calc(100% + 12px);top:50%;transform:translate(-6px,-50%)}
.why:hover::after{transform:translate(0,-50%)}
.seg{display:inline-flex;border:1px solid var(--rule);border-radius:7px;padding:2px;gap:2px;background:var(--surface)}
.seg a{padding:6px 12px;border-radius:5px;font-size:12.5px;font-weight:500;color:var(--ink-2);text-decoration:none;transition:background .15s,color .15s}
.seg a:hover{color:var(--ink)}
.seg a.on{background:var(--ink);color:var(--ground)}
.ibtn{
  width:32px;height:32px;border-radius:7px;border:1px solid var(--rule);background:var(--surface);
  display:grid;place-items:center;color:var(--ink-2);cursor:pointer;transition:color .15s,border-color .15s;
}
.ibtn:hover{color:var(--ink);border-color:var(--ink-3)}
.ibtn svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.quiet{color:var(--ink-3);font-size:12.5px}
.link{color:var(--ink-2);text-decoration:none;border-bottom:1px solid var(--rule);font-size:12.5px}
.link:hover{color:var(--ink);border-color:var(--ink-3)}

/* kpis: a number, a chip, a line ----------------------------------------- */
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;margin-top:36px}
.kpi{
  position:relative;padding:18px 20px 16px;border-radius:10px;background:var(--surface);
  border:1px solid var(--rule-soft);display:flex;flex-direction:column;gap:8px;
}
.kpi::before{
  content:"";position:absolute;inset:0;border-radius:10px;pointer-events:none;opacity:0;transition:opacity .25s;
  background:radial-gradient(220px circle at var(--mx,50%) var(--my,50%),var(--accent-soft),transparent 70%);
}
.kpi:hover::before{opacity:1}
.kpi .lab{font-family:"IBM Plex Mono",monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
.kpi .v{font-family:"IBM Plex Mono",monospace;font-size:30px;font-weight:500;letter-spacing:-.02em;line-height:1.05}
.kpi .row{display:flex;align-items:center;gap:10px;min-height:20px}
.chip{
  display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:4px;
  font:500 11px/1.5 "IBM Plex Mono",monospace;letter-spacing:.02em;
}
.chip.ok{background:var(--accent-soft);color:var(--accent)}
.chip.bad{background:#ff625722;color:var(--neg)}
.chip.warn{background:#f0913a22;color:var(--warn)}
.chip.dim{background:#ffffff10;color:var(--ink-2)}
.light .chip.dim{background:#00000010}
.kpi .sub{font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--ink-2)}
.spark{position:relative;height:34px;margin-top:2px}
.spark svg{width:100%;height:34px;overflow:visible}
.spark polyline{fill:none;stroke:var(--accent);stroke-width:1.6;stroke-linejoin:round}
.spark .area{fill:var(--accent);opacity:.08}
.spark .pt{fill:var(--accent);opacity:0;transition:opacity .15s}
.spark .scrub{
  position:absolute;top:-22px;left:0;transform:translateX(-50%);opacity:0;
  font:500 10.5px/1 "IBM Plex Mono",monospace;color:var(--ink);white-space:nowrap;transition:opacity .15s;
}
.kpi:hover .spark .pt,.kpi:hover .spark .scrub{opacity:1}

/* findings: a dot, a verb, a number ------------------------------------- */
.sev{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:6px;cursor:pointer;color:var(--ink-2);font:500 12.5px/1 "IBM Plex Mono",monospace;border:1px solid transparent;transition:all .15s}
.sev i{width:8px;height:8px;border-radius:50%;display:inline-block}
.sev.crit i{background:var(--neg)}.sev.watch i{background:var(--warn)}.sev.opp i{background:var(--accent)}
.sev:hover{color:var(--ink);border-color:var(--rule)}
.sev.off{opacity:.35}
.finds{display:flex;flex-direction:column;border-top:1px solid var(--rule)}
.find{
  display:grid;grid-template-columns:22px 150px 1fr auto 28px;gap:0 14px;align-items:center;
  padding:12px 6px 12px 0;border-bottom:1px solid var(--rule-soft);text-decoration:none;color:inherit;
  transition:background .15s,opacity .35s,transform .35s;border-radius:0 6px 6px 0;
}
.find:hover{background:var(--surface);color:inherit}
.find.gone{opacity:0;transform:translateX(40px);pointer-events:none;max-height:0;padding:0;overflow:hidden;border:none}
.find .mark{width:8px;height:8px;border-radius:50%;justify-self:center;transition:transform .2s cubic-bezier(.34,1.56,.64,1);cursor:pointer;position:relative}
.find .mark::after{content:"";position:absolute;inset:-8px;border-radius:50%}
.find:hover .mark{transform:scale(1.6)}
.find .mark:hover{transform:scale(2.2)}
.find.crit .mark{background:var(--neg)}.find.watch .mark{background:var(--warn)}.find.opp .mark{background:var(--accent)}
.find .site{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--ink-2);white-space:nowrap;overflow:hidden}
.hood{
  display:inline-grid;place-items:center;min-width:24px;height:20px;padding:0 4px;border-radius:4px;
  background:var(--raised);border:1px solid var(--rule);font:600 10px/1 "IBM Plex Mono",monospace;
  letter-spacing:.06em;color:var(--ink-2);flex:none;
}
.find .what{font-weight:600;font-size:14px;color:var(--ink)}
.find .more{
  grid-column:3/5;max-height:0;overflow:hidden;opacity:0;font-size:12.5px;color:var(--ink-2);
  transition:max-height .28s ease,opacity .2s,margin .28s;margin:0;
}
.find:hover .more{max-height:60px;opacity:1;margin-top:4px}
.find .amt{font-family:"IBM Plex Mono",monospace;font-size:13.5px;text-align:right;white-space:nowrap}
.find .amt small{display:block;font-size:10.5px;color:var(--ink-3);letter-spacing:.04em}
.find .go{color:var(--ink-3);display:grid;place-items:center;transition:transform .2s,color .15s}
.find .go svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.find:hover .go{color:var(--accent);transform:translateX(3px)}
.find.hide{display:none}
.silenced{margin:12px 0 0;font-size:12.5px;color:var(--ink-3);display:none}
.silenced.on{display:block}

/* next moves: things the board cannot do yet ------------------------------ */
.moves{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;perspective:900px}
.move{
  position:relative;padding:20px 20px 18px;border-radius:12px;background:var(--surface);border:1px solid var(--rule-soft);
  text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:10px;
  transform:rotateX(var(--rx,0)) rotateY(var(--ry,0));transition:transform .12s ease-out,border-color .2s;transform-style:preserve-3d;
}
.move:hover{border-color:var(--rule);color:inherit}
.move .ic{
  width:40px;height:40px;border-radius:10px;background:var(--raised);display:grid;place-items:center;color:var(--accent);
  transform:translateZ(24px);transition:transform .2s;
}
.move .ic svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.move b{font-size:15px;font-weight:600;transform:translateZ(16px)}
.move span{font-size:12.5px;color:var(--ink-2);transform:translateZ(10px)}
.move .soon{position:absolute;top:16px;right:16px;font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;color:var(--ink-3);border:1px dashed var(--rule);padding:4px 6px;border-radius:4px}
.move:hover .soon{color:var(--accent);border-color:var(--accent)}
.move.add{border-style:dashed;background:none;justify-content:center;align-items:center;color:var(--ink-3);min-height:120px}
.move.add:hover{color:var(--ink)}

/* tables ----------------------------------------------------------------- */
table{width:100%;border-collapse:collapse;font-size:13.5px}
th,td{padding:10px 12px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--rule-soft)}
th:first-child,td:first-child,.l{text-align:left}
thead th{font:500 10.5px/1.4 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);border-bottom:1px solid var(--rule)}
tbody tr{transition:background .12s}
tbody tr:hover{background:var(--surface)}
tbody td{font-family:"IBM Plex Mono",monospace}
tbody td.l{font-family:Archivo,sans-serif}
tfoot td{font-family:"IBM Plex Mono",monospace;font-weight:600;border-top:1px solid var(--ink);border-bottom:none}
.sub{display:block;font-size:11.5px;color:var(--ink-3);font-weight:400;font-family:Archivo,sans-serif}
.chev{display:inline-block;width:16px;vertical-align:-1px;color:var(--ink-3);transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
tr.chain{cursor:pointer}
tr.chain:hover .chev{transform:translateX(2px)}
tr.chain.open .chev{transform:rotate(90deg)}
tr.kid{display:none}
tr.kid.show{display:table-row;animation:rowin .3s ease}
@keyframes rowin{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
tr.kid td:first-child{padding-left:42px}
tr.bump td{animation:bump .6s ease}
@keyframes bump{0%{background:var(--accent-soft)}100%{background:transparent}}
.grp td{background:var(--raised);font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.06em;color:var(--ink-2);padding:7px 12px}
.bar{display:inline-block;vertical-align:middle;width:64px;height:4px;border-radius:3px;background:var(--rule);overflow:hidden;margin-right:8px}
.bar i{display:block;height:100%;background:var(--accent);transform-origin:left;transition:transform .35s cubic-bezier(.2,.7,.2,1)}
tr:hover .bar i{transform:scaleX(1.04)}
.set{color:var(--accent);font-weight:600}
.up{display:inline-flex;align-items:center;gap:3px;color:var(--warn);font-size:11px;margin-left:6px;cursor:pointer;padding:2px 6px;border-radius:4px;border:1px solid transparent;transition:all .15s}
.up:hover{border-color:var(--warn)}
.up svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round}
.up.done{color:var(--accent);border-color:transparent}
.check{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--accent-soft);color:var(--accent)}
.check svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
td.gauge{position:relative}
td.gauge i{position:absolute;left:12px;right:12px;bottom:6px;height:2px;background:var(--rule);border-radius:2px;overflow:hidden}
td.gauge i b{display:block;height:100%;background:var(--accent);width:var(--w,0);transition:width .5s cubic-bezier(.2,.7,.2,1)}
td.gauge.low i b{background:var(--neg)}

/* charts ----------------------------------------------------------------- */
.chartbox{position:relative;border-radius:10px;background:var(--surface);border:1px solid var(--rule-soft);padding:14px 20px 12px}
.readout{display:flex;justify-content:flex-end;align-items:center;gap:14px;min-height:22px;margin-bottom:6px;font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.readout b{color:var(--ink);font-weight:500}
.readout i{width:5px;height:5px;border-radius:50%;background:var(--accent);display:inline-block;margin-right:6px;vertical-align:1px}
.legend{display:flex;gap:8px;margin-top:10px}
.legend a{display:inline-flex;align-items:center;gap:7px;padding:4px 9px;border-radius:5px;font-size:12px;color:var(--ink-2);text-decoration:none;border:1px solid transparent;transition:all .15s;cursor:pointer}
.legend a i{width:12px;height:3px;border-radius:2px;background:var(--ink-3);transition:transform .2s}
.legend a.on{color:var(--ink);border-color:var(--rule)}
.legend a:hover{color:var(--ink)}
.legend a:hover i{transform:scaleX(1.4)}
.xh{opacity:0;transition:opacity .12s}
.chartbox:hover .xh{opacity:1}
g[data-series]{transition:opacity .25s}
g[data-series].off{opacity:0}
.chart rect{transition:opacity .15s}
.chart rect:hover{opacity:1}
.week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px;align-items:end;height:170px;padding-top:30px}
.wd{display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end}
.wd .track{position:relative;width:100%;flex:1;display:flex;align-items:center}
.wd .track::before{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:var(--rule)}
.wd .bar2{
  position:absolute;left:18%;right:18%;border-radius:4px;background:var(--accent);
  transform-origin:center;transition:transform .3s cubic-bezier(.34,1.56,.64,1),filter .2s;
}
.wd .bar2.down{background:var(--warn)}
.wd:hover .bar2{transform:scaleX(1.18);filter:brightness(1.15)}
.wd .n{
  position:absolute;left:50%;transform:translate(-50%,4px);padding:3px 7px;border-radius:4px;
  background:var(--ink);color:var(--ground);font:600 11px/1 "IBM Plex Mono",monospace;
  opacity:0;transition:opacity .15s,transform .2s cubic-bezier(.34,1.56,.64,1);pointer-events:none;white-space:nowrap;
}
.wd:hover .n{opacity:1;transform:translate(-50%,0)}
.wd .d{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;color:var(--ink-3)}
.wd .d b{display:none;font-weight:500}
.wd:hover .d span{display:none}.wd:hover .d b{display:inline}
.wd.now .d{color:var(--ink)}
.wd.now .track{outline:1px dashed var(--rule);outline-offset:4px;border-radius:6px}

/* heat grid --------------------------------------------------------------- */
.heat{display:grid;grid-template-columns:200px repeat(7,minmax(0,1fr));gap:4px;align-items:center}
.heat .h{font:500 10px/1.3 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);text-align:center;padding-bottom:6px;transition:color .15s}
.heat .h.hl{color:var(--ink)}
.heat .r{font-size:13px;font-weight:500;padding-right:12px;transition:color .15s}
.heat .r.hl{color:var(--accent)}
.heat .r small{display:block;font-size:11px;color:var(--ink-3);font-weight:400}
.cell{
  position:relative;height:44px;border-radius:6px;display:grid;place-items:center;cursor:pointer;
  font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink);
  transition:transform .18s cubic-bezier(.34,1.56,.64,1),box-shadow .18s,outline-color .15s,filter .15s;
}
.cell.hl{filter:brightness(1.18)}
.cell:hover{transform:scale(1.12);box-shadow:0 8px 24px #0006;z-index:3}
.cell.picked{outline:2px solid var(--ink);outline-offset:-2px}
.cell .rv2{position:absolute;right:6px;bottom:5px;display:flex;gap:2px}
.cell .rv2 i{width:3px;height:3px;border-radius:50%;background:var(--ink);opacity:.5}
.cell.mine{outline:1.5px solid var(--accent);outline-offset:-1.5px}
.cell::after{top:auto;bottom:calc(100% + 8px);left:50%;transform:translate(-50%,3px)}
.cell:hover::after{transform:translate(-50%,0)}
.celldetail{margin-top:14px;min-height:22px;font-size:13px;color:var(--ink-2)}
.celldetail b{color:var(--ink);font-weight:600}
.celldetail .link{margin-left:10px}

/* waves ------------------------------------------------------------------ */
.waves{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:22px}
.wave{
  display:inline-flex;align-items:center;gap:8px;padding:7px 11px;border-radius:7px;border:1px solid var(--rule);
  font-size:12.5px;color:var(--ink-2);text-decoration:none;background:var(--surface);transition:border-color .15s,color .15s,transform .2s;
}
.wave:hover{color:var(--ink);border-color:var(--ink-3);transform:translateY(-2px)}
.wave b{color:var(--ink);font-weight:600}
.wave .t{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;color:var(--ink-3)}
.wave svg{width:12px;height:12px;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;fill:none;transition:transform .3s}
.wave.up svg{stroke:var(--accent)}.wave.dn svg{stroke:var(--neg)}
.wave:hover svg{transform:translateY(-2px) scale(1.2)}
.wave.dn:hover svg{transform:translateY(2px) scale(1.2)}

/* plan a chain ------------------------------------------------------------ */
.plan{display:grid;grid-template-columns:300px 1fr;gap:32px;align-items:start}
.field{display:flex;flex-direction:column;gap:8px;margin-bottom:22px}
.field label{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.field select{font:inherit;font-size:13.5px;color:var(--ink);background:var(--surface);border:1px solid var(--rule);border-radius:7px;padding:8px 10px}
.field input[type=range]{width:100%;accent-color:var(--accent)}
.field output{font-family:"IBM Plex Mono",monospace;font-size:13px;color:var(--ink)}
.machines{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 14px}
.machines i{width:22px;height:22px;border-radius:5px;background:var(--rule);transition:background .25s,transform .25s cubic-bezier(.34,1.56,.64,1)}
.machines i.on{background:var(--accent);transform:scale(1)}
.machines i.new{animation:pop .35s cubic-bezier(.34,1.56,.64,1)}
@keyframes pop{from{transform:scale(.3)}to{transform:scale(1)}}
.shops{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0 14px}
.shops i{width:12px;height:12px;border-radius:3px;background:var(--rule);transition:background .2s}
.shops i.on{background:var(--ink-2)}
.planstats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:18px}
.planstat{padding:14px 16px;border-radius:10px;background:var(--surface);border:1px solid var(--rule-soft)}
.planstat .lab{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.planstat .v{font-family:"IBM Plex Mono",monospace;font-size:24px;font-weight:500;margin-top:8px;letter-spacing:-.02em}
.planstat .v small{font-size:12px;color:var(--ink-3);margin-left:4px;letter-spacing:0}

.step{display:inline-flex;align-items:center;gap:6px}
.step a{width:24px;height:24px;border-radius:6px;border:1px solid var(--rule);display:grid;place-items:center;color:var(--ink-2);text-decoration:none;font:500 14px/1 "IBM Plex Mono",monospace;transition:all .15s}
.step a:hover{color:var(--ink);border-color:var(--ink-3);transform:scale(1.1)}
.step b{font:600 14px/1 "IBM Plex Mono",monospace;min-width:14px;text-align:center}
.step .machines{margin:0 0 0 8px;gap:4px}
.step .machines i{width:14px;height:14px;border-radius:3px}
td .ing{font-size:12px;color:var(--ink-2);white-space:normal;font-family:Archivo,sans-serif}
td .ing b{font-family:"IBM Plex Mono",monospace;font-weight:500;color:var(--ink)}
.planline{margin:14px 0 0;font-size:13.5px;color:var(--ink-2)}
.planline b{color:var(--ink);font-family:"IBM Plex Mono",monospace;font-weight:500}

/* flow map ---------------------------------------------------------------- */
.flow .node rect{fill:var(--surface);stroke:var(--rule);transition:stroke .15s,transform .2s}
.flow .node{cursor:pointer}
.flow .node:hover rect{stroke:var(--ink-3)}
.flow .node.on rect{stroke:var(--accent);stroke-width:1.5}
.flow .node.faded{opacity:.35}
.flow .node text{font:500 11.5px Archivo,sans-serif;fill:var(--ink)}
.flow .node text.s{font:400 10px "IBM Plex Mono",monospace;fill:var(--ink-3)}
.flow .pipe{fill:none;stroke:var(--ink-3);stroke-opacity:.45;stroke-linecap:round;transition:stroke-opacity .2s,stroke .2s}
.flow .pipe.weekly{stroke-dasharray:6 7}
.flow .pipe:hover,.flow .pipe.lit{stroke:var(--accent);stroke-opacity:1;animation:flowdash .9s linear infinite}
.flow .pipe.daily:hover,.flow .pipe.daily.lit{stroke-dasharray:1 9;stroke-width:3}
.flow .pipe.dim{stroke-opacity:.12}
@keyframes flowdash{to{stroke-dashoffset:-26}}
.flow .cargo{fill:var(--accent);display:none}
.flow .cargo.go{display:block}
.flow .col{font:500 10px "IBM Plex Mono",monospace;letter-spacing:.14em;fill:var(--ink-3)}
.flow .warnd{fill:var(--warn)}.flow .badd{fill:var(--neg)}

/* site detail -------------------------------------------------------------- */
.sitehead{display:flex;align-items:center;gap:16px;margin-top:32px}
.bullet{width:40px;height:40px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font:600 12px/1 "IBM Plex Mono",monospace;transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
.sitehead:hover .bullet{transform:rotate(-12deg) scale(1.08)}
.sitehead h2{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em}
.sitehead .sub{font-size:13px}
.sstats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:22px}
.sstat{padding:14px 16px;border-radius:10px;background:var(--surface);border:1px solid var(--rule-soft)}
.sstat .lab{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.sstat .v{font-family:"IBM Plex Mono",monospace;font-size:22px;font-weight:500;margin-top:8px;letter-spacing:-.02em}
.hours{display:grid;grid-template-columns:40px repeat(24,minmax(0,1fr));gap:3px;align-items:center}
.hours .hh{font:500 9px/1 "IBM Plex Mono",monospace;color:var(--ink-3);text-align:center;padding-bottom:4px}
.hours .dd{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;color:var(--ink-3)}
.hours .dd.now{color:var(--ink)}
.hc{height:20px;border-radius:3px;background:var(--raised);cursor:pointer;transition:transform .15s cubic-bezier(.34,1.56,.64,1),box-shadow .15s}
.hc:hover{transform:scale(1.3);box-shadow:0 4px 14px #0007;z-index:2;position:relative}
.hc.cap{box-shadow:inset 0 0 0 1.5px var(--neg)}
.hc.cap:hover{box-shadow:inset 0 0 0 1.5px var(--neg),0 4px 14px #0007}
.hourread{min-height:22px;margin-top:12px;font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.hourread b{color:var(--ink);font-weight:500}
.crew{display:flex;flex-wrap:wrap;gap:8px}
.person{display:inline-flex;align-items:center;gap:8px;padding:6px 10px 6px 6px;border-radius:20px;background:var(--surface);border:1px solid var(--rule-soft);font-size:12.5px;transition:transform .2s}
.person:hover{transform:translateY(-2px)}
.person i{width:22px;height:22px;border-radius:50%;background:var(--raised);display:grid;place-items:center;font:600 9px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.person small{color:var(--ink-3)}
.person.off{opacity:.5}
.person.off i{background:#ff625733}
.duo{display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:start}

/* kinds popover ------------------------------------------------------------ */
.pop{width:520px;margin:40px auto;padding:20px 22px;border-radius:12px;background:var(--surface);border:1px solid var(--rule);box-shadow:0 20px 60px #0008}
.pop h3{margin:0 0 4px;font-size:15px;font-weight:600}
.pop p{margin:0 0 14px;color:var(--ink-3);font-size:12.5px}
.kind{display:grid;grid-template-columns:1fr auto auto;gap:14px;align-items:center;padding:10px 0;border-bottom:1px solid var(--rule-soft)}
.kind:last-of-type{border-bottom:none}
.kind b{font-weight:500;font-size:13.5px}
.kind small{display:block;color:var(--ink-3);font-size:11.5px}
.kind .c{font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.sw{width:34px;height:20px;border-radius:10px;background:var(--rule);position:relative;cursor:pointer;transition:background .2s}
.sw::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--ink);transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.sw.on{background:var(--accent)}
.sw.on::after{transform:translateX(14px);background:#fff}
.pop .foot2{display:flex;justify-content:space-between;align-items:center;margin-top:14px}

/* source strip states -------------------------------------------------------- */
.strip{display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:10px;background:var(--surface);border:1px solid var(--rule-soft);margin-top:14px}
.strip .st{display:flex;align-items:center;gap:10px;font-size:13px}
.strip .st .led{width:8px;height:8px;border-radius:50%;background:var(--accent)}
.strip .st .led.busy{background:var(--info);animation:blink 1s steps(1) infinite}
.strip .st .led.err{background:var(--neg)}
.strip .file{font:400 12px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.strip .right{margin-left:auto;display:flex;gap:8px;align-items:center}
.strip .prog{position:relative;width:160px;height:3px;border-radius:2px;background:var(--rule);overflow:hidden}
.strip .prog i{position:absolute;top:0;bottom:0;width:40%;background:var(--info);border-radius:2px;animation:slide 1.2s ease-in-out infinite}
@keyframes slide{0%{left:-40%}100%{left:100%}}
.strip .err{color:var(--neg);font-size:12.5px}
.btn2{display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border-radius:7px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);font-size:12.5px;font-weight:500;text-decoration:none;cursor:pointer;transition:border-color .15s,transform .15s}
.btn2:hover{border-color:var(--ink-3);transform:translateY(-1px);color:var(--ink)}
.btn2 svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.btn2.primary{background:var(--ink);color:var(--ground);border-color:var(--ink)}
.btn2.primary:hover{color:var(--ground)}
.btn2[aria-disabled="true"]{opacity:.4;pointer-events:none}
.statelabel{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);margin-top:32px}

/* company ------------------------------------------------------------------ */
.roles{display:flex;flex-direction:column;gap:8px}
.role{display:grid;grid-template-columns:130px 1fr 44px;gap:12px;align-items:center;font-size:13px}
.role .tr{height:8px;border-radius:4px;background:var(--rule-soft);overflow:hidden}
.role .tr i{display:block;height:100%;background:var(--ink-2);border-radius:4px;transform-origin:left;transition:background .2s,transform .3s cubic-bezier(.2,.7,.2,1)}
.role:hover .tr i{background:var(--accent);transform:scaleX(1.03)}
.role .c{font:500 12px "IBM Plex Mono",monospace;color:var(--ink-2);text-align:right}
.role .c b{display:none;font-weight:500;color:var(--ink)}
.role:hover .c span{display:none}.role:hover .c b{display:inline}
.miles{display:flex;flex-direction:column;gap:2px}
.mile{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--rule-soft);font-size:13.5px;cursor:pointer}
.mile .box{width:18px;height:18px;border-radius:5px;border:1.5px solid var(--rule);display:grid;place-items:center;color:var(--ground);transition:all .25s cubic-bezier(.34,1.56,.64,1)}
.mile .box svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
.mile.done .box{background:var(--accent);border-color:var(--accent)}
.mile:not(.done):hover .box{border-color:var(--accent);transform:rotate(-8deg)}
.mile.just .box{animation:pop .4s cubic-bezier(.34,1.56,.64,1)}
.mile .c{margin-left:auto;font:500 12px "IBM Plex Mono",monospace;color:var(--ink-3)}
.rules{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}
.rules span{padding:3px 8px;border-radius:4px;background:var(--raised);font:500 11px "IBM Plex Mono",monospace;color:var(--ink-2);cursor:help}
.rules span b{color:var(--ink);font-weight:600;margin-left:4px}

/* landing ------------------------------------------------------------------ */
.landing{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;padding:80px 0;perspective:1000px}
.landing .wordmark{font-size:44px}
.landing p{margin:0;color:var(--ink-2);font-size:15px;max-width:460px;text-align:center;text-wrap:pretty}
.drop{
  width:560px;height:280px;border-radius:16px;border:1.5px dashed var(--rule);display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:16px;cursor:pointer;transition:border-color .2s,background .2s,transform .12s ease-out;position:relative;
  transform:rotateX(var(--rx,0)) rotateY(var(--ry,0));transform-style:preserve-3d;
}
.drop:hover{border-color:var(--accent);background:var(--surface)}
.drop .folder{width:64px;height:52px;position:relative;transform:translateZ(30px)}
.drop .folder i{position:absolute;inset:0;border-radius:6px;background:var(--raised);border:1.5px solid var(--rule)}
.drop .folder i.tab{width:26px;height:10px;top:-8px;left:0;border-bottom:none;border-radius:6px 6px 0 0}
.drop .folder i.flap{top:10px;transform-origin:50% 100%;transition:transform .35s cubic-bezier(.34,1.56,.64,1);background:var(--surface)}
.drop:hover .folder i.flap{transform:perspective(200px) rotateX(-38deg)}
.drop .folder .file{position:absolute;left:18px;right:18px;top:4px;height:30px;border-radius:3px;background:var(--accent);opacity:0;transform:translateY(8px);transition:all .3s .05s}
.drop:hover .folder .file{opacity:1;transform:translateY(-10px)}
.drop b{font-size:15px;font-weight:600;transform:translateZ(16px)}
.drop span{font-size:12.5px;color:var(--ink-3);transform:translateZ(10px)}
.btn{
  display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:8px;background:var(--ink);color:var(--ground);
  font-weight:600;font-size:13.5px;text-decoration:none;transition:transform .15s,opacity .15s;
}
.btn:hover{transform:translateY(-1px);opacity:.92;color:var(--ground)}
.btn svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.landing .row{display:flex;align-items:center;gap:18px}
.landing footer{margin-top:40px;display:flex;gap:18px;align-items:center;font:400 11px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;color:var(--ink-3)}

/* the sphere: the dot grown up. It rolls out of the wordmark onto the masthead
   rule and sits there; it watches the pointer, squishes when clicked and rolls
   along its shelf as the page scrolls ---------------------------------------- */
.orb{position:absolute;left:0;top:0;width:100px;height:100px;z-index:6;cursor:pointer;will-change:transform;opacity:0}
.orb.live{opacity:1}
.orb i{
  display:block;width:100%;height:100%;border-radius:50%;
  background:radial-gradient(circle at var(--hx,32%) var(--hy,30%),#d9ffe8 0%,#7fe3a8 14%,var(--accent) 38%,#146b3c 78%,#0b3d23 100%);
  box-shadow:0 18px 40px #43c07a3d,inset -14px -20px 34px #00000066,inset 6px 8px 18px #ffffff22;
}
.orb u{
  position:absolute;inset:0;border-radius:50%;pointer-events:none;
  background:radial-gradient(circle at 72% 28%,#0003 0 4.5%,transparent 5.5%),radial-gradient(circle at 26% 62%,#0003 0 3.5%,transparent 4.5%),radial-gradient(circle at 62% 80%,#0002 0 3%,transparent 4%),radial-gradient(circle at 40% 22%,#0002 0 2%,transparent 3%);
}
.orb .squish{animation:squish .7s cubic-bezier(.34,1.56,.64,1)}
@keyframes squish{0%{scale:1 1}25%{scale:1.28 .74}50%{scale:.86 1.18}75%{scale:1.06 .95}100%{scale:1 1}}
.orb::after{content:"";position:absolute;left:14%;right:14%;bottom:-9px;height:14px;border-radius:50%;background:#000;opacity:.45;filter:blur(6px);z-index:-1}
.light .orb::after{opacity:.2}
.landing{position:relative}
.landing .orb{width:360px;height:360px;z-index:0}
.landing .orb i{box-shadow:0 40px 90px #43c07a44,inset -24px -34px 60px #00000066,inset 10px 14px 30px #ffffff22}
.landing .orb::after{bottom:-30px;height:26px;filter:blur(10px)}
.ring{position:absolute;border-radius:50%;border:2px solid var(--accent);pointer-events:none;animation:ring .8s ease-out forwards;z-index:0}
@keyframes ring{from{transform:scale(.6);opacity:.8}to{transform:scale(1.6);opacity:0}}

/* footer ------------------------------------------------------------------- */
.foot{margin-top:64px;padding-top:16px;border-top:1px solid var(--rule);display:flex;gap:22px;font:400 11px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;color:var(--ink-3)}
.foot span:last-child{margin-left:auto}
"""

# --------------------------------------------------------------------------
# icons (stroke, 24 grid)
# --------------------------------------------------------------------------
ICON = {
    "today": '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"></path></svg>',
    "results": '<svg viewBox="0 0 24 24"><path d="M4 19h16"></path><path d="M5 15l4-5 4 3 6-7"></path></svg>',
    "supply": '<svg viewBox="0 0 24 24"><path d="M3.5 8.5 12 4l8.5 4.5v8L12 21l-8.5-4.5z"></path><path d="M3.5 8.5 12 13l8.5-4.5M12 13v8"></path></svg>',
    "growth": '<svg viewBox="0 0 24 24"><path d="M4 18 10 12l4 4 6-7"></path><path d="M15 9h5v5"></path></svg>',
    "company": '<svg viewBox="0 0 24 24"><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"></path><path d="M14 10h5a1 1 0 0 1 1 1v10M4 21h17M8 8h2M8 12h2M8 16h2M17 14h1M17 18h1"></path></svg>',
    "go": '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>',
    "tune": '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"></path><circle cx="16" cy="7" r="2"></circle><circle cx="10" cy="17" r="2"></circle></svg>',
    "tick": '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"></path></svg>',
    "arrow_up": '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"></path></svg>',
    "folder": '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>',
    "trend_up": '<svg viewBox="0 0 24 24"><path d="M4 17l6-6 4 4 6-7"></path></svg>',
    "trend_dn": '<svg viewBox="0 0 24 24"><path d="M4 7l6 6 4-4 6 7"></path></svg>',
    "chev": '<svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M9 6l6 6-6 6"></path></svg>',
    "calendar": '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4M8 14h3M13 14h3M8 18h3"></path></svg>',
    "people": '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path><circle cx="17" cy="9" r="2.5"></circle><path d="M15.5 14.5a5 5 0 0 1 6 5"></path></svg>',
    "pin": '<svg viewBox="0 0 24 24"><path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"></path><circle cx="12" cy="10" r="2.2"></circle></svg>',
    "plus": '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg>',
    "refresh": '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7"></path><path d="M20 4v5h-5"></path></svg>',
    "more": '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="18" cy="12" r="1.4"></circle></svg>',
}

PAGES = [("today", "Today"), ("results", "Results"), ("supply", "Supply"), ("growth", "Growth"), ("company", "Company")]


def masthead(active: str) -> str:
    items = "".join(
        f'<a class="{"on" if key == active else ""}" href="#{key}">{ICON[key]}<span>{label}</span></a>'
        for key, label in PAGES
    )
    return f"""
<header class="mast">
  <div class="brand"><span class="wordmark">Costco</span><span class="dot" id="dot"></span></div>
  <nav class="nav" id="nav">{items}<i class="ink"></i></nav>
  <div class="clock tr" data-tip="Game time when the save was written. Day 1 was a Monday."><b>Day 189<i>·</i>Sun 02:00</b><small>YEAR 4 · 35 SITES · 581 STAFF</small></div>
  <div class="orb"><i></i><u></u></div>
</header>"""


FOOT = """
<footer class="foot"><span>BIG COPILOT</span><span>RECOVER #2.HSG · SAVED 21:09</span><span>GAME BUILD 3674</span></footer>"""

# --------------------------------------------------------------------------
# shared interaction script; every artboard carries all of it and each part
# quietly does nothing where its elements are absent
# --------------------------------------------------------------------------
SCRIPT = r"""
class Component extends DCLogic {
  renderVals() { return { theme: (this.props.dark ?? true) ? 'dark' : 'light' }; }
  componentDidMount() {
    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    // every link on the board is a mockup: nothing may navigate the artboard away
    document.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a) e.preventDefault(); });

    // sections arrive as they come into view (and after a beat regardless)
    const rv = $$('.rv');
    const vh = window.innerHeight || 1000;
    rv.forEach((el, i) => { el.style.transitionDelay = (i % 8) * 70 + 'ms'; if (el.getBoundingClientRect().top < vh) el.classList.add('in'); });
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: .05 });
      rv.forEach(el => { if (!el.classList.contains('in')) io.observe(el); });
    }
    setTimeout(() => rv.forEach(el => el.classList.add('in')), 2500);

    // the sphere is the dot grown up: it leaves the wordmark, rolls along the masthead
    // rule and rests just past the nav. It watches the pointer, squishes when clicked and
    // rolls along its shelf as the page scrolls. On the landing it arcs over beside the drop zone.
    // Clicking the wordmark rolls out another one, up to three; on the fourth the first ball on
    // the shelf gulps its neighbour to make room.
    const first = $('.orb');
    if (first && $('#dot')) {
      const dotEl = $('#dot'), landing = first.closest('.landing'), parent = first.offsetParent || first.parentElement;
      const p0 = parent.getBoundingClientRect(), GAP = 12, MAX = 3, SIZES = landing ? [360] : [100, 72, 54];
      let base;
      if (landing) { const d = $('.drop').getBoundingClientRect(); base = { x: d.right - p0.left + 48, mid: d.top - p0.top + d.height / 2 }; }
      else { const n = $('#nav').getBoundingClientRect(); base = { x: n.right - p0.left + 40, mid: null }; }
      const clockLeft = landing ? Infinity : $('.clock').getBoundingClientRect().left - p0.left;
      const d0 = dotEl.getBoundingClientRect();
      const balls = [];
      const restX = k => base.x + balls.slice(0, k).reduce((a, b) => a + b.size + GAP, 0);
      const topOf = size => landing ? base.mid - size / 2 : p0.height - size;
      const maxRun = () => { const l = balls[balls.length - 1]; return landing || !l ? 0 : Math.max(0, clockLeft - (l.rest + l.size) - 28); };
      const paint = (b) => {
        const roll = Math.min(maxRun(), window.scrollY * .6);
        b.el.style.transform = 'translate(' + (b.px + roll).toFixed(1) + 'px,' + b.py.toFixed(1) + 'px) scale(' + b.sc.toFixed(3) + ')';
        b.seam.style.transform = 'rotate(' + (((b.px - b.sx) + roll) / (Math.PI * b.size) * 360).toFixed(1) + 'deg)';
      };
      const squish = (b) => { [b.core, b.seam].forEach(el => { el.classList.remove('squish'); void el.offsetWidth; el.classList.add('squish'); }); };
      const ring = (b) => { const r = b.el.getBoundingClientRect(), i = document.createElement('i'); i.className = 'ring';
        i.style.left = (r.left + window.scrollX) + 'px'; i.style.top = (r.top + window.scrollY) + 'px'; i.style.width = r.width + 'px'; i.style.height = r.height + 'px';
        document.body.appendChild(i); setTimeout(() => i.remove(), 900); };
      const makeBall = (el, k) => {
        const size = SIZES[Math.min(k, SIZES.length - 1)], rest = restX(k), top = topOf(size);
        el.style.width = el.style.height = size + 'px'; el.style.left = rest + 'px'; el.style.top = top + 'px';
        const sx = d0.left - p0.left + d0.width / 2 - (rest + size / 2), sy = d0.top - p0.top + d0.height / 2 - (top + size / 2), s0 = d0.width / size;
        const b = { el, core: $('i', el), seam: $('u', el), size, rest, sx, sy, s0, px: sx, py: sy, sc: s0, tx: 0, ty: 0, busy: true };
        el.addEventListener('click', () => { squish(b); ring(b); });
        paint(b); el.classList.add('live'); return b;
      };
      const enter = (b, delay) => setTimeout(() => {
        dotEl.classList.remove('kick'); void dotEl.offsetWidth; dotEl.classList.add('kick');
        const t0 = performance.now() + 180, dur = landing ? 1500 : 1300, lift = landing ? 140 : 26;
        const step = (t) => { const p = Math.max(0, Math.min(1, (t - t0) / dur)), e = 1 - Math.pow(1 - p, 3);
          b.px = b.sx * (1 - e); b.py = b.sy * (1 - e) - Math.sin(p * Math.PI) * lift; b.sc = b.s0 + (1 - b.s0) * e; paint(b);
          if (p < 1) requestAnimationFrame(step); else b.busy = false; };
        requestAnimationFrame(step);
      }, delay);
      const spawn = () => {
        if (balls.some(b => b.busy)) return;
        const el = first.cloneNode(true); parent.appendChild(el);
        const b = makeBall(el, balls.length); balls.push(b); enter(b, 60);
      };
      const eat = () => {
        const eater = balls[0], meal = balls[1]; if (!eater || !meal || balls.some(b => b.busy)) return;
        eater.busy = meal.busy = true;
        const t0 = performance.now(), dur = 520;
        const dx = (eater.rest + eater.size / 2) - (meal.rest + meal.size / 2), dy = (topOf(eater.size) + eater.size / 2) - (topOf(meal.size) + meal.size / 2);
        let gulped = false;
        const step = (t) => { const p = Math.min(1, (t - t0) / dur), e = p * p;
          meal.px = dx * e; meal.py = dy * e - 12 * Math.sin(p * Math.PI); meal.sc = 1 - .9 * e; paint(meal);
          if (p > .55 && !gulped) { gulped = true; squish(eater); }
          if (p < 1) requestAnimationFrame(step); else {
            meal.el.remove(); balls.splice(1, 1);
            balls.forEach((b, k) => { const old = b.rest; b.rest = restX(k); b.el.style.left = b.rest + 'px'; b.px += old - b.rest; b.busy = false; });
            setTimeout(spawn, 220);
          } };
        requestAnimationFrame(step);
      };
      balls.push(makeBall(first, 0)); enter(balls[0], 400);
      if (!landing) $('.wordmark').addEventListener('click', () => (balls.length < MAX ? spawn() : eat()));
      document.addEventListener('mousemove', (e) => balls.forEach(b => {
        if (b.busy) return;
        const r = b.el.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const d = Math.hypot(dx, dy) || 1, k = Math.min(landing ? 36 : 10, d * .1);
        b.tx = dx / d * k; b.ty = landing ? dy / d * k : Math.min(0, dy / d * k);
        b.el.style.setProperty('--hx', (34 + dx / d * 20) + '%'); b.el.style.setProperty('--hy', (32 + dy / d * 20) + '%');
      }));
      const loop = () => { balls.forEach(b => { if (!b.busy) { b.px += (b.tx - b.px) * .06; b.py += (b.ty - b.py) * .06; paint(b); } }); requestAnimationFrame(loop); };
      loop();
    }

    // nav underline follows the pointer, then goes home
    const nav = $('#nav');
    if (nav) {
      const ink = (a) => { if (!a) return; const r = a.getBoundingClientRect(), n = nav.getBoundingClientRect();
        nav.style.setProperty('--nx', (r.left - n.left) + 'px'); nav.style.setProperty('--nw', r.width + 'px'); };
      const home = () => ink($('a.on', nav));
      $$('a', nav).forEach(a => a.addEventListener('mouseenter', () => ink(a)));
      nav.addEventListener('mouseleave', home);
      setTimeout(home, 50); setTimeout(home, 600);
    }

    // the green dot is a coin: click it and it pays out
    const dot = $('#dot');
    if (dot) dot.addEventListener('click', () => {
      dot.classList.remove('spin'); void dot.offsetWidth; dot.classList.add('spin');
      const r = dot.getBoundingClientRect();
      for (let i = 0; i < 14; i++) {
        const c = document.createElement('i'); c.className = 'coin';
        const a = (Math.random() * Math.PI) - Math.PI, d = 60 + Math.random() * 120;
        c.style.left = (r.left + window.scrollX + 1) + 'px'; c.style.top = (r.top + window.scrollY + 1) + 'px';
        c.style.setProperty('--dx', Math.cos(a) * d + 'px'); c.style.setProperty('--dy', (Math.abs(Math.sin(a)) * d + 140) + 'px');
        c.style.animationDelay = (Math.random() * .12) + 's';
        document.body.appendChild(c); setTimeout(() => c.remove(), 1400);
      }
    });

    // tiles: a spotlight under the pointer, and the sparkline reads out where you are
    $$('.kpi').forEach(t => t.addEventListener('mousemove', (e) => {
      const r = t.getBoundingClientRect();
      t.style.setProperty('--mx', (e.clientX - r.left) + 'px'); t.style.setProperty('--my', (e.clientY - r.top) + 'px');
      const sp = $('.spark', t); if (!sp) return;
      const pl = $('polyline', sp), pt = $('.pt', sp), lab = $('.scrub', sp);
      const pts = pl.getAttribute('points').trim().split(' ').map(p => p.split(',').map(Number));
      const vals = (sp.dataset.vals || '').split(',');
      const sr = sp.getBoundingClientRect(), x = (e.clientX - sr.left) / sr.width * 100;
      let k = 0; for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - x) < Math.abs(pts[k][0] - x)) k = i;
      pt.setAttribute('cx', pts[k][0]); pt.setAttribute('cy', pts[k][1]);
      lab.style.left = (pts[k][0]) + '%'; lab.textContent = vals[k] || '';
    }));

    // cards tilt toward the pointer
    $$('.move, .drop').forEach(c => {
      c.addEventListener('mousemove', (e) => { const r = c.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        c.style.setProperty('--ry', (x * 10) + 'deg'); c.style.setProperty('--rx', (-y * 8) + 'deg'); });
      c.addEventListener('mouseleave', () => { c.style.setProperty('--ry', '0deg'); c.style.setProperty('--rx', '0deg'); });
    });

    // severity dots filter the list; the dot on a row silences it
    $$('.sev').forEach(s => s.addEventListener('click', () => {
      s.classList.toggle('off');
      const off = $$('.sev.off').map(x => x.dataset.kind);
      $$('.find').forEach(f => f.classList.toggle('hide', off.some(k => f.classList.contains(k))));
    }));
    const silenced = $('#silenced');
    $$('.find .mark').forEach(m => m.addEventListener('click', (e) => {
      e.stopPropagation(); m.closest('.find').classList.add('gone');
      const n = $$('.find.gone').length; silenced.classList.add('on');
      $('b', silenced).textContent = n + (n === 1 ? ' finding silenced' : ' findings silenced');
    }));
    if (silenced) $('a', silenced).addEventListener('click', () => { $$('.find.gone').forEach(f => f.classList.remove('gone')); silenced.classList.remove('on'); });

    // daily chart: a crosshair reads the day into the reserved line above the plot
    const cb = $('.chartbox[data-chart]');
    if (cb) {
      const svg = $('svg', cb), line = $('.xh line', svg), dotc = $('.xh circle', svg), out = $('.readout', cb);
      const xs = JSON.parse(cb.dataset.xs), ys = JSON.parse(cb.dataset.ys), labels = JSON.parse(cb.dataset.labels);
      svg.addEventListener('mousemove', (e) => {
        const r = svg.getBoundingClientRect(); const vb = svg.viewBox.baseVal;
        const x = (e.clientX - r.left) / r.width * vb.width;
        let k = 0; for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[k] - x)) k = i;
        line.setAttribute('x1', xs[k]); line.setAttribute('x2', xs[k]);
        dotc.setAttribute('cx', xs[k]); dotc.setAttribute('cy', ys[k]);
        out.innerHTML = labels[k];
      });
      $$('.legend a', cb).forEach(a => a.addEventListener('click', () => {
        a.classList.toggle('on'); const g = $('g[data-series="' + a.dataset.series + '"]', svg); if (g) g.classList.toggle('off', !a.classList.contains('on'));
      }));
    }

    // portfolio: a chain opens its sites
    $$('tr.chain').forEach(tr => tr.addEventListener('click', () => {
      tr.classList.toggle('open');
      $$('tr.kid[data-parent="' + tr.dataset.chain + '"]').forEach(k => k.classList.toggle('show', tr.classList.contains('open')));
    }));

    // orders: "raise" rolls the order up to its target
    $$('.up').forEach(u => u.addEventListener('click', () => {
      if (u.classList.contains('done')) return;
      const td = u.closest('tr').querySelector('td[data-now]'); const from = +td.dataset.now, to = +td.dataset.to; const t0 = performance.now();
      const step = (t) => { const p = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - p, 3);
        td.textContent = Math.round(from + (to - from) * e).toLocaleString('en-US'); if (p < 1) requestAnimationFrame(step); else { u.classList.add('done'); u.innerHTML = 'set'; } };
      requestAnimationFrame(step);
    }));

    // supply map: a pipe carries cargo while hovered; a node lights its own pipes
    $$('.flow .pipe').forEach(p => {
      const cargo = $('.cargo[data-pipe="' + p.id + '"]');
      p.addEventListener('mouseenter', () => cargo && cargo.classList.add('go'));
      p.addEventListener('mouseleave', () => cargo && cargo.classList.remove('go'));
    });
    let picked = null;
    $$('.flow .node').forEach(n => n.addEventListener('click', () => {
      picked = picked === n.dataset.id ? null : n.dataset.id;
      $$('.flow .node').forEach(m => { m.classList.toggle('on', m.dataset.id === picked); m.classList.remove('faded'); });
      const touched = new Set();
      $$('.flow .pipe').forEach(p => { const on = picked && (p.dataset.a === picked || p.dataset.b === picked);
        p.classList.toggle('lit', !!on); p.classList.toggle('dim', !!picked && !on); if (on) { touched.add(p.dataset.a); touched.add(p.dataset.b); } });
      if (picked) $$('.flow .node').forEach(m => m.classList.toggle('faded', !touched.has(m.dataset.id) && m.dataset.id !== picked));
    }));

    // demand grid: rows and columns light up together; a click pins a cell's story
    const detail = $('#cellDetail');
    $$('.cell').forEach(c => {
      c.addEventListener('mouseenter', () => { $$('.cell[data-r="' + c.dataset.r + '"], .cell[data-c="' + c.dataset.c + '"]').forEach(x => x.classList.add('hl'));
        $$('.heat .h[data-c="' + c.dataset.c + '"], .heat .r[data-r="' + c.dataset.r + '"]').forEach(x => x.classList.add('hl')); });
      c.addEventListener('mouseleave', () => $$('.hl').forEach(x => x.classList.remove('hl')));
      c.addEventListener('click', () => { $$('.cell.picked').forEach(x => x.classList.remove('picked')); c.classList.add('picked');
        if (detail) detail.innerHTML = '<b>' + c.dataset.tip.split(':')[0] + '</b>' + c.dataset.tip.slice(c.dataset.tip.indexOf(':') + 1) + ' <a class="link" href="#">open in Plan a chain</a>'; });
    });

    // plan a chain: every line runs 24/7; step a line's machines and everything follows
    const lines = $$('tr.line');
    if (lines.length) {
      const fmt = (n) => Math.round(n).toLocaleString('en-US');
      const perShopWeek = 243 * 7, shopsOwned = 7;
      const draw = () => {
        let machines = 0, made = 0, raw = 0, take = 0;
        lines.forEach(tr => {
          const m = +tr.dataset.m, rate = +tr.dataset.rate, wk = m * rate * 24 * 7;
          machines += m; made += wk; take += Math.min(wk, shopsOwned * perShopWeek);
          $('.step b', tr).textContent = m; $('.made', tr).textContent = fmt(wk);
          $('.covers', tr).textContent = Math.floor(wk / perShopWeek) + ' shops';
          $('.ing', tr).innerHTML = tr.dataset.ing.split(',').map(x => { const [name, f] = x.split(':'); raw += wk * +f; return '<b>' + fmt(wk * +f) + '</b> ' + name; }).join(', ');
          const box = $('.machines', tr); const cur = box.children.length;
          while (box.children.length < m) { const i = document.createElement('i'); i.className = 'on new'; box.appendChild(i); }
          while (box.children.length > m) box.lastChild.remove();
          Array.from(box.children).forEach((i, k) => { if (k < cur) i.classList.remove('new'); });
        });
        $('#vMachines').textContent = machines; $('#vMade').textContent = fmt(made); $('#vRaw').textContent = fmt(raw);
        $('#vSurplus').textContent = fmt(made - take);
        // the ingredient table: one row per material, summed over the lines that share it
        const ing = {};
        lines.forEach(tr => { const wk = +tr.dataset.m * +tr.dataset.rate * 24 * 7, product = tr.querySelector('td.l').firstChild.textContent;
          tr.dataset.ing.split(',').forEach(x => { const [name, f] = x.split(':'); const r = ing[name] || (ing[name] = { week: 0, by: [] }); r.week += wk * +f; r.by.push(product); }); });
        const body = $('#ingBody'); const prev = {}; Array.from(body.children).forEach(tr => prev[tr.dataset.name] = tr.querySelector('.wk').textContent);
        body.innerHTML = Object.entries(ing).sort((a, b) => b[1].week - a[1].week).map(([name, r]) =>
          '<tr data-name="' + name + '" class="' + (prev[name] && prev[name] !== fmt(r.week) ? 'bump' : '') + '"><td class="l">' + name + '</td><td class="l" style="color:var(--ink-2);font-family:Archivo,sans-serif">' + r.by.join(', ') + '</td>' +
          '<td>' + fmt(r.week / 7) + '</td><td class="wk">' + fmt(r.week) + '</td><td><span class="set">' + fmt(Math.ceil(r.week / 100) * 100) + '</span></td></tr>').join('');
      };
      $$('.step a').forEach(a => a.addEventListener('click', () => { const tr = a.closest('tr'); tr.dataset.m = Math.max(1, Math.min(6, +tr.dataset.m + +a.dataset.d)); draw(); }));
      draw();
    }

    // site detail: the hour grid reads out under the pointer
    const hr = $('#hourRead');
    $$('.hc').forEach(c => c.addEventListener('mouseenter', () => { hr.innerHTML = c.dataset.read; }));

    // kinds popover: switches flip
    $$('.sw').forEach(s => s.addEventListener('click', () => s.classList.toggle('on')));

    // source strip: Update reads, then comes back
    $$('.strip [data-update]').forEach(b => b.addEventListener('click', () => {
      const strip = b.closest('.strip'); const idle = $('.idle', strip), busy = $('.busy2', strip);
      if (!idle || !busy) return; idle.style.display = 'none'; busy.style.display = 'flex'; b.setAttribute('aria-disabled', 'true');
      setTimeout(() => { idle.style.display = 'flex'; busy.style.display = 'none'; b.removeAttribute('aria-disabled'); $('.file', idle).textContent = 'RECOVER #2.HSG · SAVED JUST NOW · NOTHING NEWER'; }, 1600);
    }));

    // milestones: an unticked box ticks with a bounce (a mock, but a satisfying one)
    $$('.mile').forEach(m => m.addEventListener('click', () => { if (!m.classList.contains('done')) { m.classList.add('done', 'just'); setTimeout(() => m.classList.remove('just'), 500); } }));
  }
}
"""

PROPS = '{"dark":{"editor":"boolean","default":true,"section":"Theme"}}'


def shell(active: str, body: str, *, mast: bool = True, foot: bool = True) -> str:
    body = body.replace('">?</span>', '"><i>?</i></span>')
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>{CSS}</style>
</helmet>
<div class="board {{{{theme}}}}">
<div class="wrap">{masthead(active) if mast else ""}
{body}
{FOOT if foot else ""}
</div>
</div>
</x-dc>
<script data-dc-script data-props='{PROPS}'>{SCRIPT}</script>
</body>
</html>
"""


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def money(v: float) -> str:
    if abs(v) >= 1e6:
        return f"${v/1e6:.2f}M"
    if abs(v) >= 1e3:
        return f"${v/1e3:.0f}k"
    return f"${v:.0f}"


def spark(vals: list[float], labels: list[str]) -> str:
    lo, hi = min(vals), max(vals)
    span = (hi - lo) or 1
    pts = []
    for i, v in enumerate(vals):
        x = i / (len(vals) - 1) * 100
        y = 30 - (v - lo) / span * 26
        pts.append(f"{x:.1f},{y:.1f}")
    poly = " ".join(pts)
    area = f"0,34 {poly} 100,34"
    return (f'<div class="spark" data-vals="{",".join(labels)}">'
            f'<svg viewBox="0 0 100 34" preserveAspectRatio="none">'
            f'<polygon class="area" points="{area}"></polygon>'
            f'<polyline points="{poly}" vector-effect="non-scaling-stroke"></polyline>'
            f'<circle class="pt" r="3" cx="100" cy="{pts[-1].split(",")[1]}" vector-effect="non-scaling-stroke"></circle>'
            f'</svg><span class="scrub"></span></div>')


def kpi(label: str, value: str, chip_html: str, sub: str, vals: list[float]) -> str:
    labels = [money(v) for v in vals]
    return (f'<div class="kpi rv"><span class="lab">{label}</span><span class="v">{value}</span>'
            f'<div class="row">{chip_html}<span class="sub">{sub}</span></div>{spark(vals, labels)}</div>')


def chip(kind: str, text: str, tip: str = "") -> str:
    t = f' data-tip="{tip}"' if tip else ""
    return f'<span class="chip {kind}"{t}>{text}</span>'


random.seed(189)


def series(n: int, start: float, end: float, wobble: float) -> list[float]:
    out = []
    for i in range(n):
        base = start + (end - start) * (i / (n - 1)) ** 1.3
        weekly = -0.35 * base if (i % 7 == 2) else 0.12 * base * math.sin(i / 7 * math.pi * 2)
        out.append(base + weekly + random.uniform(-wobble, wobble))
    return out


def subnav(page: str, active: str) -> str:
    views = {"supply": [("Orders", "orders"), ("Checks", "checks"), ("Map", "map")],
             "growth": [("Demand", "demand"), ("Plan a chain", "plan")]}
    return "".join(f'<a class="{"on" if k == active else ""}" href="#{k}">{lab}</a>' for lab, k in views[page])


# --------------------------------------------------------------------------
# Today (Main)
# --------------------------------------------------------------------------
def today() -> str:
    profit = series(14, 2_300_000, 3_566_315, 180_000); profit[-1] = 3_566_315
    revenue = series(14, 3_900_000, 5_110_510, 220_000); revenue[-1] = 5_110_510
    cash = [49_300_000, 47_800_000, 44_100_000, 41_900_000, 45_300_000, 43_900_000, 39_100_000,
            42_600_000, 41_200_000, 36_800_000, 40_200_000, 39_600_000, 35_100_000, 38_921_860]
    fixed = [171_400, 171_400, 174_900, 174_900, 176_200, 176_200, 176_200, 178_800, 178_800, 178_800, 181_100, 181_100, 181_525, 181_525]
    tiles = "".join([
        kpi("Profit yesterday", "$3,566,315",
            chip("ok", "▲ 12%", "Against the 7-day average of $3,174,940, which is itself $284,151 up on the week before"),
            "vs 7-day", profit),
        kpi("Revenue yesterday", "$5,110,510", chip("dim", "10,894", "Customers served yesterday"), "customers", revenue),
        kpi("Cash on hand", "$38,921,860",
            chip("bad", "▼ $10.4M", "7 days: $22.2M profit, but $32.6M went into set-up and stock"),
            "this week", cash),
        kpi("Fixed cost / day", "$181,525", chip("dim", "rent $20.6k"), "payroll $160.9k", fixed),
    ])
    finds = [
        ("crit", "LM", "Costco Liquor", "Not trading: no staff", "Opened day 184. Hire a manager and a clerk, then it starts trading.", "$98", "/day rent"),
        ("crit", "LM", "Liquor Distr.", "Not trading: no trading day booked", "Opened day 185, staffed and stocked. Set the first trading day.", "$300", "/day rent"),
        ("crit", "MT", "Costco Liquor", "Not trading: no staff", "Opened day 184. Hire a manager and a clerk, then it starts trading.", "$1,837", "/day rent"),
        ("crit", "LM", "CostcoWH 12th", "Donut order 223 short of its week", "2,500 ordered against 2,723 used. Runs dry on Sunday, 0.7 days before Monday's import. Two more orders are short.", "3", "orders"),
        ("watch", "HA", "Costco Liquor", "Hype wave ends in 11 days", "Two lines ride it and there is no trading history from before the wave, so the size of the drop is unknown.", "$44,301", "/day under hype"),
        ("watch", "IC", "Factory- Liquor", "Blue Agave arrives short of the machines", "1,729/day arrives against 2,400 needed while Costco Import holds 2,500. The line is not drawing it. Three more inputs are short.", "2,400", "/day needed"),
        ("opp", "HA", "Costco Cloth", "Revenue up 897% week on week", "$1,082,347 over days 182 to 188 against $108,597 the week before.", "$1.08M", "/week"),
    ]
    rows = "".join(
        f'<a class="find {sev}" href="#"><span class="mark" data-tip="Silence this finding"></span>'
        f'<span class="site"><span class="hood">{hood}</span>{site}</span>'
        f'<span class="what">{what}</span>'
        f'<span class="amt">{amt}<small>{unit}</small></span>'
        f'<span class="go">{ICON["go"]}</span>'
        f'<span class="more">{more}</span></a>'
        for sev, hood, site, what, more, amt, unit in finds
    )
    moves = [
        ("calendar", "Plan imports", "Size next week's orders from the peak day, then set every manager in one pass."),
        ("people", "Optimize staffing", "Shifts from the hour grid: registers, door caps and who is off today."),
        ("pin", "Find a location", "Free buildings ranked by demand, rivals and the door cap you would get."),
    ]
    mrows = "".join(
        f'<a class="move rv" href="#"><span class="soon">SOON</span><span class="ic">{ICON[ic]}</span><b>{t}</b><span>{d}</span></a>'
        for ic, t, d in moves)
    body = f"""
<div class="kpis">{tiles}</div>
<section class="sec rv">
  <div class="sechead">
    <h2>Needs attention</h2>
    <span class="why" data-tip="A site that is not trading always makes the list. Everything else needs to be worth $15,875/day; smaller findings are counted below.">?</span>
    <div class="aside">
      <span class="sev crit" data-kind="crit"><i></i>4</span>
      <span class="sev watch" data-kind="watch"><i></i>2</span>
      <span class="sev opp" data-kind="opp"><i></i>1</span>
      <span class="ibtn tr" data-tip="Which kinds of finding make the list">{ICON["tune"]}</span>
    </div>
  </div>
  <div class="finds">{rows}</div>
  <p class="silenced" id="silenced"><b></b> · <a class="link" href="#">undo</a></p>
  <p class="quiet" style="margin:12px 0 0">5 smaller · $7,403/day &nbsp;<a class="link" href="#">show</a></p>
</section>
<section class="sec rv">
  <div class="sechead"><h2>Next moves</h2>
    <span class="why" data-tip="Things the board could do for you that it cannot do yet. Each one is a decision you make every week by hand today.">?</span></div>
  <div class="moves">{mrows}</div>
</section>"""
    return shell("today", body)


# --------------------------------------------------------------------------
# Results
# --------------------------------------------------------------------------
def results() -> str:
    days = list(range(159, 189))
    net = series(30, 1_150_000, 3_600_000, 260_000)
    net[3] = -286_000; net[-1] = 3_566_315
    avg = [sum(net[max(0, i - 6):i + 1]) / len(net[max(0, i - 6):i + 1]) for i in range(30)]
    rev = [n + 1_350_000 + random.uniform(-90_000, 90_000) for n in net]
    goods = [r * 0.26 + random.uniform(-40_000, 40_000) for r in rev]
    wages = [128_000 + i * 480 for i in range(30)]
    W, H, L, R, T, B = 1140, 260, 56, 12, 16, 28
    lo, hi = -400_000, 5_200_000
    def X(i): return L + i / 29 * (W - L - R)
    def Y(v): return T + (hi - v) / (hi - lo) * (H - T - B)
    bars = "".join(
        f'<rect x="{X(i)-6:.1f}" y="{min(Y(v),Y(0)):.1f}" width="12" height="{abs(Y(v)-Y(0)):.1f}" rx="2" '
        f'fill="{"var(--neg)" if v < 0 else "var(--ink-3)"}" opacity=".45"><title>Day {days[i]}: net {money(v)}</title></rect>'
        for i, v in enumerate(net))
    def line(vals, color, w=1.5, dash=""):
        pts = " ".join(f"{X(i):.1f},{Y(v):.1f}" for i, v in enumerate(vals))
        return f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linejoin="round"{dash}></polyline>'
    grid = "".join(
        f'<line x1="{L}" x2="{W-R}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="var(--rule-soft)"></line>'
        f'<text x="{L-10}" y="{Y(v)+4:.1f}" text-anchor="end" font-size="10" font-family="IBM Plex Mono" fill="var(--ink-3)">{money(v)}</text>'
        for v in (0, 1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000))
    xt = "".join(
        f'<text x="{X(i):.1f}" y="{H-8}" text-anchor="middle" font-size="10" font-family="IBM Plex Mono" fill="var(--ink-3)">{d}</text>'
        for i, d in enumerate(days) if i % 3 == 0 or i == 29)
    xs = json.dumps([round(X(i), 1) for i in range(30)])
    ys = json.dumps([round(Y(v), 1) for v in avg])
    labels = json.dumps([f"<i></i>Day {d} <b>{money(net[i])}</b> net <b>{money(avg[i])}</b> 7-day <b>{money(rev[i])}</b> revenue" for i, d in enumerate(days)])
    chart = f"""
<div class="chartbox chart" data-chart="1" data-xs='{xs}' data-ys='{ys}' data-labels='{labels}'>
  <div class="readout"><i></i>Day 188 <b>{money(net[-1])}</b> net <b>{money(avg[-1])}</b> 7-day <b>{money(rev[-1])}</b> revenue</div>
  <svg viewBox="0 0 {W} {H}" style="width:100%;height:{H}px;overflow:visible">
    {grid}
    <g data-series="net">{bars}</g>
    <g data-series="revenue" class="off">{line(rev, "var(--info)")}</g>
    <g data-series="goods" class="off">{line(goods, "var(--warn)")}</g>
    <g data-series="wages" class="off">{line(wages, "var(--ink-2)", 1.2, ' stroke-dasharray="3 3"')}</g>
    <g data-series="avg">{line(avg, "var(--accent)", 2)}</g>
    {xt}
    <g class="xh"><line x1="{X(22):.1f}" x2="{X(22):.1f}" y1="{T}" y2="{H-B}" stroke="var(--ink-3)" stroke-dasharray="3 4"></line>
    <circle cx="{X(22):.1f}" cy="{Y(avg[22]):.1f}" r="4" fill="var(--accent)" stroke="var(--ground)" stroke-width="2"></circle></g>
  </svg>
  <div class="legend">
    <a class="on" data-series="avg" href="#"><i style="background:var(--accent)"></i>7-day profit</a>
    <a class="on" data-series="net" href="#"><i></i>Net profit</a>
    <a data-series="revenue" href="#"><i style="background:var(--info)"></i>Revenue</a>
    <a data-series="goods" href="#"><i style="background:var(--warn)"></i>Goods</a>
    <a data-series="wages" href="#"><i style="background:var(--ink-2)"></i>Wages</a>
  </div>
</div>"""
    week = [("MON", "Monday", -8), ("TUE", "Tuesday", -12), ("WED", "Wednesday", -6), ("THU", "Thursday", 4),
            ("FRI", "Friday", 18), ("SAT", "Saturday", 31), ("SUN", "Sunday", 9)]
    wbars = ""
    for s, full, v in week:
        h = abs(v) * 1.6
        pos = f"bottom:50%" if v > 0 else f"top:50%"
        lab = f"bottom:calc(50% + {h + 8}px)" if v > 0 else f"top:calc(50% + {h + 8}px)"
        wbars += (f'<div class="wd {"now" if s == "SUN" else ""}"><div class="track">'
                  f'<i class="bar2 {"down" if v < 0 else ""}" style="height:{h}px;{pos}"></i>'
                  f'<span class="n" style="{lab}">{v:+d} pts</span></div><span class="d"><span>{s}</span><b>{full}</b></span></div>')
    port = [
        ("electronics", "Electronics Stores", "4 sites", "$1,421,714", "+1%", "-$252", "-$22,791", "-$2,562", "$1,379,409", "97.0%"),
        ("clothing", "Clothing Stores", "11 sites", "$2,712,895", "+11%", "-$1,263,362", "-$57,362", "-$6,839", "$1,361,382", "50.2%"),
        ("jewelry", "Jewelry Stores", "4 sites", "$539,314", "-3%", "-$140", "-$19,652", "-$857", "$510,812", "94.7%"),
        ("super", "Supermarkets", "9 sites", "$249,530", "+5%", "-$33,339", "-$23,739", "-$3,625", "$174,901", "70.1%"),
        ("cinema", "Cinemas", "1 site", "$110,163", "-2%", "-$78", "-$5,863", "-$3,051", "$96,071", "87.2%"),
        ("liquor", "Liquor Stores", "5 sites", "$76,895", "—", "-$9,675", "-$12,118", "-$3,264", "$51,237", "66.6%"),
    ]
    kids = {"electronics": [("LM", "Costco Electric", "$412,880", "+2%", "-$70", "-$6,120", "-$640", "$401,900", "97.3%"),
                            ("MT", "Costco Electric", "$389,410", "+1%", "-$66", "-$5,980", "-$700", "$379,240", "97.4%"),
                            ("IC", "Costco Electric", "$356,224", "-1%", "-$60", "-$5,600", "-$611", "$346,300", "97.2%"),
                            ("HA", "Costco Ele2", "$263,200", "+3%", "-$56", "-$5,091", "-$611", "$251,969", "95.7%")]}
    prow = ""
    for key, n, s, rev_, ww, g, w, r, p, m in port:
        prow += (f'<tr class="chain" data-chain="{key}"><td class="l"><span class="chev">{ICON["chev"]}</span>{n}<span class="sub" style="padding-left:16px">{s}</span></td>'
                 f'<td>{rev_}</td><td class="{"pos" if ww.startswith("+") else "neg" if ww.startswith("-") else ""}">{ww}</td>'
                 f'<td>{g}</td><td>{w}</td><td>{r}</td><td><b>{p}</b></td><td>{m}</td></tr>')
        for hood, kn, krev, kww, kg, kw, kr, kp, km in kids.get(key, []):
            prow += (f'<tr class="kid" data-parent="{key}"><td class="l"><span class="hood">{hood}</span>&nbsp; {kn} <span class="chev">{ICON["chev"]}</span></td>'
                     f'<td>{krev}</td><td class="{"pos" if kww.startswith("+") else "neg"}">{kww}</td><td>{kg}</td><td>{kw}</td><td>{kr}</td><td>{kp}</td><td>{km}</td></tr>')
    body = f"""
<section class="sec rv" style="margin-top:32px">
  <div class="sechead"><h2>Daily result</h2>
    <span class="why" data-tip="Daily profit follows the purchase calendar, so the 7-day line is the trend. Day 159 to 188. Click a legend chip to add or drop a line.">?</span>
    <div class="aside"><span class="seg"><a class="on" href="#">30 days</a><a href="#">All</a></span></div></div>
  {chart}
</section>
<section class="sec rv">
  <div class="sechead"><h2>Weekly rhythm</h2>
    <span class="why" data-tip="Footfall across every shop against a normal day, from 2 weeks of history. 10 sites peak Saturday.">?</span>
    <div class="aside"><span class="seg"><a class="on" href="#">Customers</a><a href="#">Revenue</a><a href="#">Profit</a></span><a class="link" href="#">site by site</a></div></div>
  <div class="chartbox" style="padding-bottom:16px"><div class="week">{wbars}</div></div>
</section>
<section class="sec rv">
  <div class="sechead"><h2>Portfolio</h2>
    <span class="why" data-tip="Yesterday's income statement by chain. Click a chain to open its sites, a site to open its detail.">?</span>
    <div class="aside"><span class="seg"><a class="on" href="#">Profit &amp; loss</a><a href="#">Operations</a></span></div></div>
  <table>
    <thead><tr><th>Business</th><th>Revenue</th><th>Wk / wk</th><th>Goods</th><th>Wages</th><th>Rent</th><th>Profit</th><th>Margin</th></tr></thead>
    <tbody>{prow}</tbody>
    <tfoot><tr><td class="l">37 sites</td><td>$5,110,510</td><td></td><td>-$1,306,846</td><td>-$141,524</td><td>-$20,614</td><td>$3,573,397</td><td>69.9%</td></tr></tfoot>
  </table>
</section>"""
    return shell("results", body)


# --------------------------------------------------------------------------
# Results: one business
# --------------------------------------------------------------------------
def site_detail() -> str:
    dnames = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
    full = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    cap = 75
    random.seed(7)
    grid = '<div></div>' + "".join(f'<div class="hh">{h if h % 3 == 0 else ""}</div>' for h in range(24))
    for d in range(7):
        grid += f'<div class="dd {"now" if d == 6 else ""}">{dnames[d]}</div>'
        for h in range(24):
            if h < 8 or h > 22:
                v = 0
            else:
                base = 22 + 30 * math.exp(-((h - 16) ** 2) / 12) + (18 if d >= 4 else 0)
                v = min(cap, int(base + random.uniform(-6, 6)))
                if d in (4, 5) and 14 <= h <= 18 or d == 6 and 15 <= h <= 18:
                    v = cap
            a = 0.06 + v / cap * 0.7
            bg = f"color-mix(in oklab, var(--accent) {a*100:.0f}%, var(--surface))" if v else "var(--raised)"
            read = f"<b>{full[d]} {h:02d}:00</b> {v} customers" + (" · <b>at the door cap</b>" if v == cap else f" · {cap - v} below the cap")
            grid += f'<div class="hc {"cap" if v == cap else ""}" style="background:{bg}" data-read="{read}"></div>'
    crew = [("MG", "Ana Ruiz", "Manager", ""), ("CS", "Tom Bell", "Customer service", ""), ("CS", "Mia Cho", "Customer service", "off"),
            ("CL", "Ola Nowak", "Cleaning", ""), ("SG", "Ray King", "Security", ""), ("CS", "Li Wei", "Customer service", "")]
    crew_html = "".join(f'<span class="person {off}"><i>{c}</i>{n}<small>{r}{" · off today" if off else ""}</small></span>' for c, n, r, off in crew)
    shelves = [("Clothing (Modern Expensive Male)", "312", "Sat 401", "450", "89%", "1,240"), ("Clothing (Classic Expensive Female)", "298", "Sat 388", "450", "86%", "1,180"),
               ("Clothing (Modern Cheap Male)", "604", "Fri 720", "800", "90%", "2,050"), ("Clothing (Modern Cheap Female)", "598", "Fri 712", "800", "89%", "2,010")]
    srows = "".join(f'<tr><td class="l">{p}</td><td>{s}</td><td>{b}</td><td>{t}</td><td class="gauge"><i><b style="--w:{pr}"></b></i>{pr}</td><td>{o}</td></tr>' for p, s, b, t, pr, o in shelves)
    body = f"""
<div class="sitehead rv">
  <span class="bullet">LM</span>
  <div><h2>Costco Cloth</h2><span class="sub">Clothing Store · Lower Manhattan · opened day 61</span></div>
  <div class="aside" style="margin-left:auto;display:flex;gap:8px"><span class="seg"><a href="#">Costco Rivals</a><a class="on" href="#">Costco Cloth</a><a href="#">Costco 19 BW</a></span><span class="ibtn tr" data-tip="Close the detail">{ICON["more"]}</span></div>
</div>
<div class="sstats rv">
  <div class="sstat"><span class="lab">Revenue yesterday</span><div class="v">$412,880</div></div>
  <div class="sstat"><span class="lab">Customers</span><div class="v">1,206</div></div>
  <div class="sstat"><span class="lab">Profit</span><div class="v pos">$198,140</div></div>
  <div class="sstat"><span class="lab">Door cap</span><div class="v">75<small style="font-size:12px;color:var(--ink-3);margin-left:6px">/h · 11 h/wk at it</small></div></div>
</div>
<section class="sec rv">
  <div class="sechead"><h2>Customers by hour</h2>
    <span class="why" data-tip="Two weeks of hour reports. An outlined cell is an hour at the door cap: customers who could not get in. The cap is 75/h for a large building.">?</span></div>
  <div class="chartbox"><div class="hours">{grid}</div><div class="hourread" id="hourRead">Hover an hour</div></div>
</section>
<div class="duo sec">
  <section class="rv">
    <div class="sechead"><h2>Crew</h2><span class="quiet">6 people · $2,410/day</span></div>
    <div class="crew">{crew_html}</div>
  </section>
  <section class="rv">
    <div class="sechead"><h2>Shelves</h2><span class="quiet">before tomorrow's top-up</span></div>
    <table><thead><tr><th>Product</th><th>Sells / day</th><th>Busiest</th><th>Top-up</th><th>Pressure</th><th>On hand</th></tr></thead><tbody>{srows}</tbody></table>
  </section>
</div>"""
    return shell("results", body)


# --------------------------------------------------------------------------
# Supply: orders to set
# --------------------------------------------------------------------------
def supply() -> str:
    orders = [
        ("Paper Bag", "21,291", 20000, 21300, "1,096", 5),
        ("Bag of Carrots", "13,479", 12000, 13500, "0", 0),
        ("Bag of Lettuce", "12,211", 10000, 12300, "0", 0),
        ("Bag of Tomatoes", "12,177", 10000, 12200, "0", 0),
        ("Bag of Pears", "12,072", 10000, 12100, "0", 0),
        ("Ice Cream", "7,477", 7000, 7500, "411", 5),
        ("Donut", "2,723", 2500, 2800, "100", 4),
    ]
    up = f'<span class="up">{ICON["arrow_up"]}raise</span>'
    rows = "".join(
        f'<tr><td class="l">{m}</td><td>{use}</td><td data-now="{now}" data-to="{to}">{now:,}</td><td><span class="set">{to:,}</span>{up}</td>'
        f'<td class="gauge {"low" if pct < 3 else ""}"><i><b style="--w:{pct*10}%"></b></i>{depot}</td></tr>'
        for m, use, now, to, depot, pct in orders)
    body = f"""
<div class="sechead rv" style="margin-top:28px">
  <span class="seg">{subnav("supply", "orders")}</span>
  <div class="aside"><span class="seg"><a class="on" href="#">Needs a change</a><a href="#">Everything</a></span></div>
</div>
<section class="sec rv" style="margin-top:28px">
  <div class="sechead"><h2>Weekly imports</h2><span class="chip bad">7 short</span>
    <span class="why" data-tip="What to set the logistics managers to. Sized on next week's peak day, pro-rated to the hour. Click raise to see the order roll up; the thin line under the depot figure is how much of a day's use it holds.">?</span></div>
  <table>
    <thead><tr><th>Material</th><th>Used / week</th><th>Order now</th><th>Set order to</th><th>At depot</th></tr></thead>
    <tbody>
      <tr class="grp"><td class="l" colspan="5"><span class="hood">LM</span>&nbsp; CostcoWH 12th · Warehouse · 7 Twelfth Street</td></tr>
      {rows}
    </tbody>
  </table>
</section>
<section class="sec rv">
  <div class="sechead"><h2>Daily top-ups</h2><span class="check">{ICON["tick"]}</span><span class="quiet">All 44 cover their day</span>
    <div class="aside"><a class="link" href="#">show all</a></div></div>
</section>"""
    return shell("supply", body)


# --------------------------------------------------------------------------
# Supply: stock checks
# --------------------------------------------------------------------------
def supply_checks() -> str:
    rows = [
        ("MT", "Costco 38 1stAV", "Supermarket", "Frozen Food", "1,930", "Sat 2,410", "2,600", 74, "3,120"),
        ("LM", "Costco 19 BW", "Supermarket", "Fresh Food", "1,780", "Sat 2,190", "2,600", 84, "2,870"),
        ("HK", "Costco 10 4AV", "Supermarket", "Energy Drink", "1,210", "Fri 1,480", "1,800", 82, "2,010"),
        ("LM", "Costco Cloth", "Clothing Store", "Clothing (Modern Cheap Male)", "604", "Fri 720", "800", 90, "2,050"),
        ("HA", "Costco 28 7AV", "Supermarket", "Ice Cream", "940", "Sun 1,190", "1,300", 92, "1,410"),
    ]
    trs = "".join(
        f'<tr><td class="l"><span class="hood">{h}</span>&nbsp; {s}<span class="sub" style="padding-left:34px">{t}</span></td><td class="l">{p}</td><td>{sd}</td><td>{bd}</td><td>{tu}</td>'
        f'<td class="gauge {"low" if pr > 88 else ""}"><i><b style="--w:{pr}%"></b></i>{pr}%</td><td>{oh}</td></tr>'
        for h, s, t, p, sd, bd, tu, pr, oh in rows)
    body = f"""
<div class="sechead rv" style="margin-top:28px">
  <span class="seg">{subnav("supply", "checks")}</span>
</div>
<section class="sec rv" style="margin-top:28px">
  <div class="sechead"><h2>Stock checks</h2>
    <span class="why" data-tip="Does the busiest day of the week outrun tomorrow morning's top-up? Pressure is the busiest day against the top-up; the line fills as it gets tight.">?</span>
    <div class="aside"><span class="seg"><a class="on" href="#">Before the drop</a><a href="#">Before the import</a><a href="#">Idle stock</a><a href="#">Factory lines</a><a href="#">Feed the factories</a></span></div></div>
  <p class="quiet" style="margin:0 0 14px"><span class="check" style="vertical-align:-4px;margin-right:6px">{ICON["tick"]}</span>250 shelves clear their top-up. The five tightest:</p>
  <table>
    <thead><tr><th>Shop</th><th class="l">Product</th><th>Sells / day</th><th>Busiest day</th><th>Daily top-up</th><th>Pressure</th><th>On hand</th></tr></thead>
    <tbody>{trs}</tbody>
  </table>
  <p class="quiet" style="margin:12px 0 0">245 more &nbsp;<a class="link" href="#">show all 250</a></p>
</section>"""
    return shell("supply", body)


# --------------------------------------------------------------------------
# Supply: the map
# --------------------------------------------------------------------------
def supply_map() -> str:
    cols = {"IMPORTERS": 40, "FACTORIES": 330, "DEPOTS": 620, "SHOPS": 910}
    nodes = {
        "p1": ("1 Pier", "weekly", 40, 60), "p2": ("2 Pier", "weekly", 40, 130), "p6": ("6 Pier", "weekly", 40, 200),
        "p8": ("8 Pier", "weekly", 40, 270),
        "fl": ("Factory- Liquor", "135,552 held", 330, 60), "ff": ("Factory - Food", "175,190 held", 330, 130),
        "fc": ("Factory - Cloth", "34,700 held", 330, 200), "fe": ("Electronics Fac", "113,478 held", 330, 270),
        "wh": ("CostcoWH 12th", "21,557 held", 620, 60), "ld": ("Liquor Distr.", "25,965 held", 620, 130),
        "cd": ("Costco Distrib", "20,424 held", 620, 200), "ci": ("Costco Import", "400,700 held", 620, 270),
        "s1": ("Costco 38 1stAV", "27,501 held", 910, 40), "s2": ("Costco 10 4AV", "17,736 held", 910, 100),
        "s3": ("Costco Liquor", "6,600 held", 910, 160), "s4": ("Costco Cloth", "14,250 held", 910, 220),
        "s5": ("Costco Jewels", "13,040 held", 910, 280), "s6": ("Costco Electric", "9,000 held", 910, 340),
    }
    hoods = {"fl": "IC", "ff": "IC", "fc": "IC", "fe": "IC", "wh": "LM", "ld": "LM", "cd": "IC", "ci": "LM",
             "s1": "MT", "s2": "HK", "s3": "LM", "s4": "LM", "s5": "LM", "s6": "LM"}
    links = [("p1", "ci", "weekly", 2.5, ""), ("p2", "wh", "weekly", 3, "warn"), ("p6", "wh", "weekly", 2, ""),
             ("p8", "ld", "weekly", 1.5, "bad"), ("ci", "fl", "daily", 2.5, ""), ("ci", "ff", "daily", 3, ""),
             ("ci", "fc", "daily", 2, ""), ("ci", "fe", "daily", 2, ""),
             ("fl", "ld", "daily", 1.5, ""), ("ff", "wh", "daily", 3, ""), ("fc", "cd", "daily", 2, ""), ("fe", "cd", "daily", 2.5, ""),
             ("wh", "s1", "daily", 3, ""), ("wh", "s2", "daily", 2.5, ""), ("ld", "s3", "daily", 1.5, ""),
             ("cd", "s4", "daily", 2, ""), ("cd", "s5", "daily", 2, ""), ("cd", "s6", "daily", 2, "")]
    NW, NH = 180, 44
    def anchor(k, side):
        _, _, x, y = nodes[k]
        return (x + (NW if side == "r" else 0), y + NH / 2)
    paths, cargo, dots = [], [], []
    for i, (a, b, kind, w, flag) in enumerate(links):
        fwd = nodes[b][2] > nodes[a][2]
        x1, y1 = anchor(a, "r" if fwd else "l"); x2, y2 = anchor(b, "l" if fwd else "r")
        mx = (x1 + x2) / 2
        d = f"M{x1},{y1} C{mx},{y1} {mx},{y2} {x2},{y2}"
        tip = f"{nodes[a][0]} to {nodes[b][0]}, {'weekly import' if kind == 'weekly' else 'daily distribution'}"
        paths.append(f'<path class="pipe {kind}" id="pipe{i}" data-a="{a}" data-b="{b}" d="{d}" stroke-width="{w}"><title>{tip}</title></path>')
        cargo.append(f'<circle class="cargo" data-pipe="pipe{i}" r="3.5"><animateMotion dur="{1.1 + i % 3 * .25}s" repeatCount="indefinite"><mpath href="#pipe{i}"></mpath></animateMotion></circle>')
        if flag:
            dots.append(f'<circle class="{flag}d" cx="{x2 - 10 if fwd else x2 + 10}" cy="{y2}" r="4"><title>{"order running tight" if flag=="warn" else "order too small"}</title></circle>')
    boxes = []
    for k, (name, sub, x, y) in nodes.items():
        hood = hoods.get(k)
        hood_svg = (f'<rect x="{x+10}" y="{y+13}" width="24" height="18" rx="3" fill="var(--raised)" stroke="var(--rule)"></rect>'
                    f'<text x="{x+22}" y="{y+26}" text-anchor="middle" class="s" style="font-weight:600;fill:var(--ink-2)">{hood}</text>') if hood else ""
        tx = x + (44 if hood else 12)
        boxes.append(f'<g class="node" data-id="{k}"><rect x="{x}" y="{y}" width="{NW}" height="{NH}" rx="7"></rect>{hood_svg}'
                     f'<text x="{tx}" y="{y+19}">{name}</text><text class="s" x="{tx}" y="{y+34}">{sub}</text></g>')
    heads = "".join(f'<text class="col" x="{x}" y="22">{c}</text>' for c, x in cols.items())
    body = f"""
<div class="sechead rv" style="margin-top:28px">
  <span class="seg">{subnav("supply", "map")}</span>
  <span class="why" data-tip="Solid pipes are daily distribution, dashed ones weekly imports; width is volume. Hover a pipe and its cargo moves. Click a site to keep only its pipes lit. An amber dot is an order running tight, a red one is too small.">?</span>
</div>
<div class="chartbox rv" style="margin-top:28px;padding:18px 24px 24px">
  <svg class="flow" viewBox="0 0 1130 400" style="width:100%;height:400px">
    {heads}{"".join(paths)}{"".join(dots)}{"".join(boxes)}{"".join(cargo)}
  </svg>
</div>"""
    return shell("supply", body)


# --------------------------------------------------------------------------
# Growth: demand
# --------------------------------------------------------------------------
def growth() -> str:
    waves = [
        ("up", "Garment District", "2 phones you stock", "13 d"),
        ("up", "The Hamptons", "Cigar, cigarettes", "11 d"),
        ("dn", "Lower Manhattan", "Ice Cream", "8 d"),
        ("dn", "3 Pier", "Cheap clothing, Whisky", "1 d"),
    ]
    wchips = "".join(
        f'<a class="wave {k}" href="#">{ICON["trend_up"] if k == "up" else ICON["trend_dn"]}<b>{where}</b>{what}<span class="t">{left}</span></a>'
        for k, where, what, left in waves)
    hoods = ["Garment", "Hell's K.", "Industry", "Lower Man.", "Midtown", "Murray H.", "Hamptons"]
    hoods_full = ["Garment District", "Hell's Kitchen", "Industry City", "Lower Manhattan", "Midtown", "Murray Hill", "The Hamptons"]
    types = [
        ("Bookstore", "6 products", [(0, 52, 3), (5, 67, 2), (6, 83, 1), (6, 83, 1), (6, 83, 1), (5, 67, 2), (6, 84, 1)], []),
        ("Clothing Store", "8 products", [(8, 78, 2), (8, 71, 3), (8, 88, 1), (8, 90, 1), (8, 74, 2), (6, 61, 3), (8, 86, 1)], [0, 2, 3, 4, 6]),
        ("Electronics Store", "6 products", [(6, 80, 1), (6, 62, 3), (6, 88, 1), (6, 91, 1), (6, 85, 1), (4, 55, 3), (6, 79, 2)], [2, 3, 4, 6]),
        ("Fast Food", "8 products", [(4, 57, 4), (4, 58, 5), (2, 41, 6), (3, 49, 5), (4, 60, 4), (3, 47, 5), (5, 66, 3)], []),
        ("Liquor Store", "5 products", [(5, 70, 2), (3, 52, 4), (5, 74, 2), (5, 69, 2), (4, 64, 3), (5, 72, 2), (5, 81, 1)], [3, 4, 6]),
        ("Supermarket", "5 products", [(5, 75, 2), (5, 79, 1), (5, 82, 1), (5, 86, 1), (5, 80, 1), (5, 71, 2), (5, 84, 1)], [0, 1, 2, 3, 4, 5, 6]),
        ("Coffee Shop", "5 products", [(5, 66, 3), (4, 58, 3), (5, 71, 2), (5, 63, 3), (5, 69, 2), (5, 60, 3), (5, 77, 1)], [0, 5]),
        ("Gym", "3 products", [(3, 61, 2), (3, 55, 3), (3, 70, 1), (3, 72, 1), (3, 66, 2), (2, 48, 3), (3, 74, 1)], []),
    ]
    def shade(avg):
        a = 0.08 + (avg - 40) / 55 * 0.55
        return f"color-mix(in oklab, var(--accent) {max(6, min(70, a*100)):.0f}%, var(--surface))"
    cells = '<div></div>' + "".join(f'<div class="h" data-c="{j}">{h}</div>' for j, h in enumerate(hoods))
    for i, (name, sub, row, mine) in enumerate(types):
        cells += f'<div class="r" data-r="{i}">{name}<small>{sub}</small></div>'
        for j, (n, avg, riv) in enumerate(row):
            tot = sub.split()[0]
            tip = f"{name} in {hoods_full[j]}: {n} of {tot} products wanted, average demand {avg}, {riv} rival{'s' if riv != 1 else ''}" + (", you sell here" if j in mine else "")
            cells += (f'<div class="cell {"mine" if j in mine else ""}" data-r="{i}" data-c="{j}" style="background:{shade(avg)}" data-tip="{tip}">{n}/{tot}'
                      f'<span class="rv2">{"<i></i>" * riv}</span></div>')
    body = f"""
<div class="sechead rv" style="margin-top:28px">
  <span class="seg">{subnav("growth", "demand")}</span>
</div>
<section class="sec rv" style="margin-top:28px">
  <div class="sechead"><h2>Market demand</h2>
    <span class="why" data-tip="Average demand per business type and neighbourhood. Dots count rivals. An outlined cell is one you already sell in. Hover to light a row and a column; click a cell to pin its story below.">?</span>
    <div class="aside"><span class="seg"><a class="on" href="#">By type</a><a href="#">What I sell</a><a href="#">Not yet</a></span></div></div>
  <div class="waves">{wchips}</div>
  <div class="heat">{cells}</div>
  <p class="celldetail" id="cellDetail">Click a cell</p>
</section>"""
    return shell("growth", body)


# --------------------------------------------------------------------------
# Growth: plan a chain
# --------------------------------------------------------------------------
def growth_plan() -> str:
    lines = [
        ("Energy Drink", 250, "Bottledgoods Workstation", "Caffeine Extract:1,Carbon Dioxide:1,Sugar:1,Water:1"),
        ("Fresh Food", 200, "Food Workstation", "Bag of Tomatoes:0.5,Ground Beef:1,Russet Potatoes:1"),
        ("Frozen Food", 200, "Food Workstation", "Chicken:1,Bag of Peas:1,Russet Potatoes:1"),
        ("Ice Cream", 180, "Dairy Workstation", "Milk:1,Sugar:1,Vanilla:0.5"),
        ("Paper Bag", 300, "Paper Workstation", "Paper Roll:0.5"),
    ]
    trs = "".join(
        f'<tr class="line" data-m="1" data-rate="{rate}" data-ing="{ing}"><td class="l">{p}<span class="sub">{rate}/h rated · {ws}</span></td>'
        f'<td class="l"><span class="step"><a href="#" data-d="-1">−</a><b>1</b><a href="#" data-d="1">+</a><span class="machines"></span></span></td>'
        f'<td class="made"></td><td class="covers"></td><td class="l"><span class="ing"></span></td></tr>'
        for p, rate, ws, ing in lines)
    body = f"""
<div class="sechead rv" style="margin-top:28px">
  <span class="seg">{subnav("growth", "plan")}</span>
</div>
<section class="sec rv" style="margin-top:28px">
  <div class="sechead"><h2>Plan a chain</h2>
    <span class="why" data-tip="Every machine runs 24 hours at its rated rate, so a line makes its full quantity whether or not the shelves need it. Build the factory first; the shops come after, and what they do not take is exported. Step a single line up when one product deserves more.">?</span>
    <div class="aside"><span class="seg"><a class="on" href="#">Supermarket</a><a href="#">Liquor Store</a><a href="#">Clothing Store</a><a href="#">Coffee Shop</a></span></div></div>
  <div class="planstats">
    <div class="planstat"><span class="lab">Machines</span><div class="v" id="vMachines">5</div></div>
    <div class="planstat"><span class="lab">Made / week</span><div class="v"><span id="vMade"></span><small>units</small></div></div>
    <div class="planstat"><span class="lab">Raw material / week</span><div class="v"><span id="vRaw"></span><small>units to import</small></div></div>
  </div>
  <table>
    <thead><tr><th>Product</th><th class="l">Machines</th><th>Made / week</th><th>Supplies</th><th class="l">Raw material / week</th></tr></thead>
    <tbody>{trs}</tbody>
  </table>
  <p class="planline">Your <b>7</b> supermarkets take what they sell today, <b>243</b> a day per product. Everything above that, <b id="vSurplus"></b> units a week, is surplus for export.</p>
</section>
<section class="sec rv">
  <div class="sechead"><h2>Ingredients</h2>
    <span class="why" data-tip="What the machines above eat, added up across every line that shares an ingredient. The order is the weekly figure rounded up to the hundred, the way the logistics manager takes it.">?</span></div>
  <table>
    <thead><tr><th>Ingredient</th><th class="l">Used by</th><th>Per day</th><th>Per week</th><th>Weekly order</th></tr></thead>
    <tbody id="ingBody"></tbody>
  </table>
</section>"""
    return shell("growth", body)


# --------------------------------------------------------------------------
# Company
# --------------------------------------------------------------------------
def company() -> str:
    products = [
        ("Jewelry (Expensive)", 741_008, "721", "$1,027.75", "11", ""),
        ("ZanaMan Phone", 626_135, "723", "$866.02", "5", ""),
        ("Arty Fish Phone", 584_445, "721", "$810.60", "5", ""),
        ("Rhythm By Tre Headphones", 319_192, "1,441", "$221.51", "5", "Fri +4"),
        ("Arty Fish Smartwatch", 254_555, "1,142", "$222.90", "9", ""),
        ("ZanaMan Smartwatch", 249_319, "714", "$349.19", "9", ""),
        ("Jewelry (Cheap)", 233_900, "1,442", "$162.21", "11", ""),
        ("Clothing (Modern Expensive Male)", 195_237, "1,463", "$133.45", "7", "Sat +26"),
    ]
    top = products[0][1]
    prow = "".join(
        f'<tr><td class="l">{n}</td><td><span class="bar"><i style="width:{rev/top*100:.0f}%"></i></span>${rev:,}</td>'
        f'<td>{u}</td><td>{p}</td><td>{s}</td><td class="{"pos" if pk else ""}">{pk or "—"}</td></tr>'
        for n, rev, u, p, s, pk in products)
    roles = [("Factory Worker", 165, 38), ("Customer Service", 149, 41), ("Cleaning", 102, 22), ("Security Guard", 101, 26),
             ("HR Manager", 13, 6), ("Delivery Driver", 12, 4), ("Projectionist", 10, 3), ("Logistics Manager", 9, 5),
             ("Headhunter", 7, 4), ("Pricing Manager", 7, 4), ("Purchasing Agent", 6, 3)]
    rrows = "".join(f'<div class="role rv"><span>{r}</span><span class="tr"><i style="width:{c/165*100:.0f}%"></i></span><span class="c"><span>{c}</span><b>${k}k</b></span></div>'
                    for r, c, k in roles)
    miles = [("done", "Every business type run", "14 / 14"), ("done", "5 diplomas", "5 / 5"),
             ("", "Every building owned", "37 / 61"), ("", "Rivals taken over", "3 / 9"),
             ("done", "58 personal goals", "58 / 58"), ("", "$25M paid in tax", "$21.2M")]
    mrows = "".join(f'<div class="mile {d}"><span class="box">{ICON["tick"]}</span>{t}<span class="c">{c}</span></div>' for d, t, c in miles)
    rules = [("Public prices", "×1.3", "Cost of wholesale and imported goods, hospital fees and the like"), ("Salaries", "×1.3", "What staff cost an hour"),
             ("Interest", "×1.3", "Interest on loans and investments"), ("Rival attacks", "×1.2", "Severity of rival attacks"),
             ("Base customers", "×0.5", "Customers you get before any traffic or marketing"), ("Export income", "×0.5", "What exporting pays"),
             ("Resale value", "×0.5", "What selling something back returns"), ("Urgent wholesale", "×0.3", "Surcharge for rushing a wholesale order")]
    rchips = "".join(f'<span data-tip="{t}">{k}<b>{v}</b></span>' for k, v, t in rules)
    body = f"""
<section class="sec rv" style="margin-top:32px">
  <div class="sechead"><h2>Products</h2><span class="quiet">by revenue yesterday</span>
    <div class="aside"><a class="link" href="#">all 41</a></div></div>
  <table>
    <thead><tr><th>Product</th><th>Revenue / day</th><th>Units</th><th>Avg price</th><th>Stores</th><th>Peaks</th></tr></thead>
    <tbody>{prow}</tbody>
  </table>
</section>
<div class="duo sec">
  <section class="rv">
    <div class="sechead"><h2>Payroll</h2><span class="quiet">581 people · $160,911 / day</span>
      <div class="aside"><span class="chip ok tr" data-tip="Average satisfaction">99.8%</span><span class="chip warn tr" data-tip="Absent today">13 out</span></div></div>
    <div class="roles">{rrows}</div>
  </section>
  <section class="rv">
    <div class="sechead"><h2>Milestones</h2><span class="quiet">playing on Custom · 7 harder, 1 easier, started on $0</span></div>
    <div class="miles">{mrows}</div>
    <div class="rules">{rchips}</div>
  </section>
</div>"""
    return shell("company", body)


# --------------------------------------------------------------------------
# Landing
# --------------------------------------------------------------------------
def landing() -> str:
    body = f"""
<div class="landing">
  <div class="brand rv"><span class="wordmark">Big Copilot</span><span class="dot" id="dot"></span></div>
  <p class="rv">Drop a Big Ambitions save. Everything is read in this tab and nothing leaves it.</p>
  <div class="drop rv">
    <div class="folder"><i class="tab"></i><i></i><span class="file"></span><i class="flap"></i></div>
    <b>Drop your save folder anywhere</b>
    <span>the newest .hsg in it opens</span>
  </div>
  <div class="row rv"><a class="btn" href="#">{ICON["folder"]}Choose the folder</a><a class="link" href="#">or one save file</a></div>
  <footer class="rv"><a class="link" href="#">Where saves live</a><span>·</span><span>GAME BUILD 3674</span></footer>
  <div class="orb"><i></i><u></u></div>
</div>"""
    return shell("today", body, mast=False, foot=False)


# --------------------------------------------------------------------------
# Today: which kinds make the list (popover)
# --------------------------------------------------------------------------
def filter_kinds() -> str:
    kinds = [("Not trading", "A site that is open but has no staff or no trading day", 3, True),
             ("Weekly order short", "An import that cannot cover its own week", 1, True),
             ("Hype ending", "A wave with days left and a site trading under it", 1, True),
             ("Factory not fed", "An input arriving short of what the machines need", 1, True),
             ("Revenue jump", "Week on week up or down by more than half", 1, True),
             ("At the door cap", "Hours a week the door turns customers away", 9, False),
             ("Idle stock", "Goods sitting in a depot no line draws from", 4, False),
             ("Theft", "Losses above the chain's usual", 0, False)]
    rows = "".join(f'<div class="kind"><div><b>{k}</b><small>{d}</small></div><span class="c">{n} today</span><span class="sw {"on" if on else ""}"></span></div>'
                   for k, d, n, on in kinds)
    body = f"""
<div class="pop rv">
  <h3>Which kinds make the list</h3>
  <p>Off is counted, never dropped: it shows up in the "smaller" line under the list.</p>
  {rows}
  <div class="foot2"><a class="link" href="#">reset to the board's defaults</a><a class="btn2 primary" href="#">Done</a></div>
</div>"""
    return shell("today", body, mast=False, foot=False)


# --------------------------------------------------------------------------
# The source strip in its states
# --------------------------------------------------------------------------
def source_states() -> str:
    def strip(state):
        if state == "idle":
            return f"""
<div class="strip rv">
  <div class="st idle"><span class="led"></span>Up to date<span class="file">RECOVER #2.HSG · SAVED 21:09</span></div>
  <div class="st busy2" style="display:none"><span class="led busy"></span>Reading<span class="prog"><i></i></span></div>
  <div class="right"><a class="btn2" data-update="1" href="#">Update</a><span class="ibtn tr" data-tip="Change folder · one file · clear history · about">{ICON["more"]}</span></div>
</div>"""
        if state == "busy":
            return f"""
<div class="strip rv">
  <div class="st"><span class="led busy"></span>Reading Recover #2.hsg<span class="prog"><i></i></span><span class="file">LAST GOOD BOARD STAYS ON SCREEN</span></div>
  <div class="right"><a class="btn2" aria-disabled="true" href="#">Update</a><span class="ibtn">{ICON["more"]}</span></div>
</div>"""
        return f"""
<div class="strip rv">
  <div class="st"><span class="led err"></span><span class="err">Could not read the folder: the browser lost access after a reload</span></div>
  <div class="right"><a class="btn2 primary" href="#">{ICON["folder"]} Choose the folder again</a><a class="btn2" href="#">Update</a><span class="ibtn">{ICON["more"]}</span></div>
</div>"""
    body = f"""
<p class="quiet rv" style="margin:28px 0 0">The slim strip under the masthead once a board is on screen. Click Update on the first one.</p>
<div class="statelabel rv">Up to date</div>{strip("idle")}
<div class="statelabel rv">Reading a newer save</div>{strip("busy")}
<div class="statelabel rv">Could not read</div>{strip("err")}
<div class="statelabel rv">Return visit, before a board is loaded</div>
<div class="strip rv">
  <div class="st"><span class="led" style="background:var(--ink-3)"></span>Folder remembered<span class="file">SAVES · 57 FILES · NEWEST 21:09</span></div>
  <div class="right"><a class="btn2 primary" href="#">Open newest save</a><a class="btn2" href="#">Change folder</a><a class="link" href="#">one file</a></div>
</div>"""
    return shell("today", body, foot=False)


# --------------------------------------------------------------------------
# low-fi alternates
# --------------------------------------------------------------------------
LOFI = """
body{margin:0;background:#f4f2ec}
a{color:#333}a:hover{color:#000}
.lo{width:720px;min-height:100vh;padding:36px 40px;box-sizing:border-box;background:#f4f2ec;color:#2a2a2a;
  font-family:"Patrick Hand","Comic Sans MS",cursive;font-size:15px;line-height:1.4}
.lo *{box-sizing:border-box}
.lo .t{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#888;margin-bottom:6px}
.lo h1{margin:0 0 4px;font-size:26px;font-weight:400}
.lo p.d{margin:0 0 22px;color:#666;max-width:560px}
.bx{border:1.5px solid #555;border-radius:4px;padding:10px 12px;position:relative;background:#faf9f5}
.bx.dash{border-style:dashed;color:#888}
.row{display:flex;gap:12px}
.col{display:flex;flex-direction:column;gap:12px}
.ln{height:8px;background:#ddd8cc;border-radius:4px}
.ln.s{width:40%}.ln.m{width:65%}
.big{font-size:24px}
.sm{font-size:12px;color:#777}
"""


def lofi(title: str, sub: str, body: str, extra: str = "") -> str:
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Patrick+Hand&amp;display=swap">
  <style>{LOFI}{extra}</style>
</helmet>
<div class="lo">
  <div class="t">Alternate direction</div>
  <h1>{title}</h1>
  <p class="d">{sub}</p>
  {body}
</div>
</x-dc>
</body>
</html>
"""


def alt_paper() -> str:
    body = """
<div class="col">
  <div class="row" style="align-items:baseline;justify-content:space-between">
    <span class="big">Costco &mdash; Day 189</span><span class="sm">Sunday, 02:00</span>
  </div>
  <div class="bx" style="font-size:17px;line-height:1.6">
    Yesterday made <b>$3.57M</b> on $5.11M of sales, 12% over the week's pace.<br>
    Cash is <b>$38.9M</b>, down $10.4M after set-up and stock.<br>
    <span class="sm">Three shops are open but not trading. One donut order runs dry on Sunday.</span>
  </div>
  <div class="row">
    <div class="bx" style="flex:1"><div class="sm">One column, one story per line. Findings read like a newspaper brief; numbers set in the text, not in tiles.</div></div>
    <div class="bx dash" style="flex:1">Charts appear inline only where a sentence cannot say it: a 30-day line under "Results".</div>
  </div>
  <div class="bx"><div class="ln m"></div><div class="ln s" style="margin-top:8px"></div><div class="ln" style="margin-top:8px;width:80%"></div></div>
  <div class="sm">Trade-off: warmer and calmer, but slower to scan across many sites; less room for playful mouse work.</div>
</div>"""
    return lofi("B · Paper ledger", "Light, editorial, serif. The board is written, not tiled. For a player who reads the day like a morning paper.", body,
                ".lo h1,.lo .bx,.lo p.d,.lo .big{font-family:Georgia,\"Times New Roman\",serif}")


def alt_panel() -> str:
    body = """
<div class="col">
  <div class="row">
    <div class="bx" style="flex:1;text-align:center"><div class="sm">PROFIT</div><div class="big">3.57M</div><div class="ln" style="margin-top:6px"></div></div>
    <div class="bx" style="flex:1;text-align:center"><div class="sm">CASH</div><div class="big">38.9M</div><div class="ln" style="margin-top:6px"></div></div>
    <div class="bx" style="flex:1;text-align:center"><div class="sm">DOOR CAP</div><div class="big">9 sites</div><div class="ln" style="margin-top:6px"></div></div>
    <div class="bx" style="flex:1;text-align:center"><div class="sm">ORDERS</div><div class="big">7 short</div><div class="ln" style="margin-top:6px"></div></div>
  </div>
  <div class="row">
    <div class="bx" style="flex:2;height:150px"><div class="sm">City map: every site a dot, coloured by state. Hover a dot for its one-line finding. Click to open it.</div></div>
    <div class="bx" style="flex:1"><div class="sm">Hour strip 0-24 for the hovered site</div><div class="ln" style="margin-top:8px"></div><div class="ln m" style="margin-top:6px"></div><div class="ln s" style="margin-top:6px"></div></div>
  </div>
  <div class="bx dash">Everything on one screen, no pages: the map is the index and the panels follow the pointer.</div>
  <div class="sm">Trade-off: dense and spatial, the most playful; but it needs the building table for the map and hides the weekly ordering flow.</div>
</div>"""
    return lofi("C · Instrument panel", "Dark, dense, one screen. A city map as the index, panels driven by where the pointer is.", body,
                "body{background:#15181a}.lo{background:#15181a;color:#d8dcd6;font-family:\"IBM Plex Mono\",Consolas,monospace;font-size:13px}.lo .t,.lo .sm,.lo p.d{color:#8b9499}.bx{background:#1c211e;border-color:#3a423d}.bx.dash{color:#8b9499}.ln{background:#2b322e}")


# --------------------------------------------------------------------------
# write everything
# --------------------------------------------------------------------------
def main() -> None:
    files = {
        "Main.dc.html": today(), "Landing.dc.html": landing(), "Results.dc.html": results(), "SiteDetail.dc.html": site_detail(),
        "Supply.dc.html": supply(), "SupplyChecks.dc.html": supply_checks(), "SupplyMap.dc.html": supply_map(),
        "Growth.dc.html": growth(), "GrowthPlan.dc.html": growth_plan(), "Company.dc.html": company(),
        "FilterKinds.dc.html": filter_kinds(), "SourceStates.dc.html": source_states(),
        "AltPaper.dc.html": alt_paper(), "AltPanel.dc.html": alt_panel(),
    }
    for name, src in files.items():
        with open(os.path.join(HERE, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(src)
    W, GAP, XR = 1440, 120, 1440 + 120
    rows = [  # (left artboard, right artboard) with (file, title, height)
        (("Main.dc.html", "Today", 1400), ("Landing.dc.html", "Landing", 820)),
        (("Results.dc.html", "Results", 1560), ("SiteDetail.dc.html", "Results · Business detail", 1180)),
        (("Supply.dc.html", "Supply · Orders", 900), ("SupplyChecks.dc.html", "Supply · Checks", 820)),
        (("SupplyMap.dc.html", "Supply · Map", 760), ("Growth.dc.html", "Growth · Demand", 1120)),
        (("GrowthPlan.dc.html", "Growth · Plan a chain", 1420), ("Company.dc.html", "Company", 1180)),
        (("FilterKinds.dc.html", "Today · Filter kinds", 760), ("SourceStates.dc.html", "Source strip states", 820)),
    ]
    artboards, notes = [], []
    y = 0
    tips = {
        "Main.dc.html": "Try it: reload and watch the dot after Costco kick out the sphere, which rolls along the masthead rule and rests past the nav. Click the word Costco for another ball, up to three; on the fourth click the first one gulps its neighbour. It watches the pointer, squishes when clicked, and rolls along its shelf as you scroll. Slide across a tile and the sparkline reads out. Hover a finding; click its dot to silence it. Click the counts to filter. Click the small green dot too.",
        "Results.dc.html": "Results: hover a ? mark and the question falls into place, the note opens to its right. The crosshair reads the day into the line above the plot. Click legend chips to add revenue, goods or wages. Weekday bars stretch and spell out their day. Click a chain to open its sites.",
        "SiteDetail.dc.html": "Business detail: hover the hour grid and it reads out the hour, the customers and the door cap. Outlined cells are hours at the cap.",
        "Supply.dc.html": "Orders: click raise and the order rolls up to its target. The thin line under the depot figure is how much of a day's use sits there.",
        "SupplyMap.dc.html": "Map: hover a pipe and its cargo moves along it. Click a site and only its pipes stay lit.",
        "Growth.dc.html": "Demand: hovering a cell lights its row and column; clicking pins its story under the grid.",
        "GrowthPlan.dc.html": "Plan a chain: every line runs 24/7. Step one line up to two machines and its squares pop in; made, raw material, export surplus and the ingredient table follow, and the rows that changed flash.",
        "Company.dc.html": "Company: hover a role for its daily cost; click an unticked milestone.",
        "SourceStates.dc.html": "Source strip: click Update on the first strip and it reads, then comes back.",
        "Landing.dc.html": "Landing: the sphere leaves the dot after Big Copilot and arcs over to sit beside the drop zone. Hover the drop zone and the folder opens.",
        "FilterKinds.dc.html": "Filter kinds: the switches flip. Off is counted, never dropped.",
    }
    for left, right in rows:
        for x, (f, t, h) in ((0, left), (XR, right)):
            artboards.append({"file": f, "title": t, "x": x, "y": y, "w": W, "h": h, "page": "board", "is_interactive": True, "expand": "fill"})
            if f in tips:
                notes.append({"id": "try-" + f.split(".")[0].lower(), "x": x, "y": y - 110, "w": 460, "page": "board", "text": tips[f]})
        y += max(left[2], right[2]) + GAP + 120
    artboards += [
        {"file": "AltPaper.dc.html", "title": "B · Paper ledger", "x": 0, "y": 0, "w": 720, "h": 640, "page": "alts"},
        {"file": "AltPanel.dc.html", "title": "C · Instrument panel", "x": 720 + GAP, "y": 0, "w": 720, "h": 640, "page": "alts"},
    ]
    notes.append({"id": "alts-note", "x": 0, "y": -140, "w": 520, "page": "alts",
                  "text": "Two low-fi directions kept beside the draft in case the minimal dark board is not the one. Same data, different stance."})
    canvas = {
        "pages": [{"id": "board", "name": "Board"}, {"id": "alts", "name": "Alternates"}],
        "artboards": artboards, "annotations": notes,
        "launch": {"view": "canvas", "page": "board"},
    }
    with open(os.path.join(HERE, "canvas.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(canvas, f, indent=2)
    print("wrote", len(files), "artboards and canvas.json")


if __name__ == "__main__":
    main()
