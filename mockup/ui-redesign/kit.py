"""Shared kit for the Big Copilot redesign canvas: tokens, stylesheet, icons, the shell
(sidebar and the masthead alternative), finding rows, evidence visuals and the one
interaction script every artboard carries.

The look is the shipped board's (TEMPLATE in ba_dashboard.py at origin/main 09c5c32):
Archivo + IBM Plex Mono, the green-tinted near-black and the pale warm light palette,
thin rules, the green wordmark dot and sphere. Two deliberate token changes, both for
legibility of small secondary text (see NOTES.md): --ink-3 is lifted in dark
(#6b756f -> #808a84) and darkened in light (#8b9499 -> #636c71), and light --warn
is #b34d00 instead of #c25400 for text under 14 px.

Every class this canvas adds carries the nx- prefix (the board's classes are global);
classes that already exist on the board (.hood, .chip, .seg, .sev, .why, .ibtn, gw-*) keep
their names so the port can see what is reused.

The company is fictional (Marlow Trading) and every number is synthetic.
"""
from __future__ import annotations

import html
import json

FONTS = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"

esc = html.escape

# --------------------------------------------------------------------------
# stylesheet
# --------------------------------------------------------------------------
CSS = r"""
body{margin:0;background:#0d100f}
a{color:inherit}
.board{
  --ground:#0d100f;--surface:#151917;--raised:#1c211e;
  --ink:#e9ece6;--ink-2:#9aa39d;--ink-3:#808a84;
  --rule:#262c28;--rule-soft:#1e2320;
  --accent:#43c07a;--accent-soft:#43c07a26;--on-accent:#08130d;
  --pos:#43c07a;--neg:#ff6257;--warn:#f0913a;--info:#6ea8ff;
  --neg-soft:#ff625722;--warn-soft:#f0913a22;--info-soft:#6ea8ff1f;
  --tip-bg:#e9ece6;--tip-ink:#0d100f;--shadow:0 24px 60px -28px #000c;
  position:relative;overflow:hidden;box-sizing:border-box;background:var(--ground);color:var(--ink);
  font-family:Archivo,"Helvetica Neue",Arial,sans-serif;font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased;
}
.board.light{
  --ground:#eef0ea;--surface:#fdfdfb;--raised:#f3f4ef;
  --ink:#15181a;--ink-2:#5b6469;--ink-3:#636c71;
  --rule:#d2d6cd;--rule-soft:#e0e3da;
  --accent:#00703a;--accent-soft:#00703a1f;--on-accent:#ffffff;
  --pos:#00703a;--neg:#cc2a20;--warn:#b34d00;--info:#2a5ea8;
  --neg-soft:#cc2a201a;--warn-soft:#b34d001a;--info-soft:#2a5ea81a;
  --tip-bg:#15181a;--tip-ink:#f3f4ef;--shadow:0 22px 50px -26px #1a1f1c55;
}
.board *{box-sizing:border-box}
.board svg{display:block}
.board .mono,.board .num{font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace;font-variant-numeric:tabular-nums}
:where(.board) :where(h1,h2,h3,h4,p){margin:0}
:where(.board) button{font:inherit;color:inherit}
:where(.board) a{text-decoration:none}
.board :focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
.board .pos{color:var(--pos)}.board .neg{color:var(--neg)}.board .warnc{color:var(--warn)}.board .dim{color:var(--ink-3)}
.i{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none}
.sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}

/* the board's own small parts, as shipped --------------------------------- */
.hood{display:inline-grid;place-items:center;min-width:24px;height:20px;padding:0 4px;border-radius:4px;background:var(--raised);border:1px solid var(--rule);font:600 10px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;color:var(--ink-2);flex:none}
.chip{display:inline-flex;align-items:center;gap:5px;padding:2px 7px;border-radius:4px;font:500 11px/1.5 "IBM Plex Mono",monospace;letter-spacing:.02em;white-space:nowrap}
.chip .i{width:12px;height:12px}
.chip.ok{background:var(--accent-soft);color:var(--accent)}
.chip.bad{background:var(--neg-soft);color:var(--neg)}
.chip.warn{background:var(--warn-soft);color:var(--warn)}
.chip.info{background:var(--info-soft);color:var(--info)}
.chip.dim{background:color-mix(in srgb,var(--ink) 7%,transparent);color:var(--ink-2)}
.chip.line{background:transparent;border:1px solid var(--rule);color:var(--ink-2)}
.seg{display:inline-flex;flex-wrap:wrap;border:1px solid var(--rule);border-radius:7px;padding:2px;gap:2px;background:var(--surface)}
.seg a,.seg button{border:0;background:none;padding:6px 12px;border-radius:5px;font-size:12.5px;font-weight:500;color:var(--ink-2);cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
.seg a:hover,.seg button:hover{color:var(--ink)}
.seg .on{background:var(--ink);color:var(--ground)}
.seg .on:hover{color:var(--ground)}
.seg small{font:500 10.5px/1 "IBM Plex Mono",monospace;opacity:.75}
.why{width:18px;height:18px;flex:none;border-radius:50%;border:1px solid var(--rule);color:var(--ink-3);display:inline-grid;place-items:center;font:500 11px/1 "IBM Plex Mono",monospace;background:none;padding:0;cursor:help}
.why:hover{color:var(--ink);border-color:var(--ink-3)}
.ibtn{width:32px;height:32px;border-radius:7px;border:1px solid var(--rule);background:var(--surface);display:inline-grid;place-items:center;color:var(--ink-2);cursor:pointer;padding:0;flex:none}
.ibtn:hover{color:var(--ink);border-color:var(--ink-3)}
.lab{font:500 10.5px/1.2 "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
.quiet{color:var(--ink-3);font-size:12.5px}
.link{color:var(--ink-2);border-bottom:1px solid var(--rule);font-size:12.5px;cursor:pointer;background:none;border-top:0;border-left:0;border-right:0;padding:0}
.link:hover{color:var(--ink);border-color:var(--ink-3)}
.sev{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:6px;color:var(--ink-2);font:500 12.5px/1 "IBM Plex Mono",monospace;border:1px solid transparent;background:none;cursor:pointer}
.sev i{width:8px;height:8px;border-radius:50%;display:inline-block}
.sev.crit i{background:var(--neg)}.sev.watch i{background:var(--warn)}.sev.opp i{background:var(--accent)}
.sev:hover{color:var(--ink);border-color:var(--rule)}
.sev span{font-family:Archivo,sans-serif;font-size:12px;color:var(--ink-3)}

/* buttons --------------------------------------------------------------- */
.nx-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:34px;padding:0 13px;border-radius:8px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);font:600 12.5px/1 Archivo,sans-serif;cursor:pointer;white-space:nowrap;transition:border-color .15s,transform .25s cubic-bezier(.34,1.56,.64,1),background .15s}
.nx-btn:hover{border-color:var(--ink-3)}
.nx-btn .i{width:15px;height:15px}
.nx-btn.go{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.nx-btn.go:hover{transform:translateX(2px)}
.nx-btn.go .i{transition:transform .2s}
.nx-btn.go:hover .i:last-child{transform:translateX(3px)}
.nx-btn.soft{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 40%,transparent);color:var(--ink)}
.nx-btn.ghost{background:transparent}
.nx-btn.sm{height:28px;padding:0 10px;font-size:12px;border-radius:7px}
.nx-btn.lg{height:44px;padding:0 18px;font-size:14px;border-radius:10px}
.nx-btn.off{border-style:dashed;background:transparent;color:var(--ink-3);cursor:not-allowed}
.nx-btn.off:hover{transform:none;border-color:var(--rule)}
.nx-btn.wide{width:100%}

/* the game-link mini wire, as the write buttons wear it (gw-btn on the board) */
.gw-mw{position:relative;width:24px;height:10px;flex:none;display:inline-block}
.gw-mw::before{content:"";position:absolute;left:0;top:1.5px;width:7px;height:7px;border-radius:50%;background:var(--accent)}
.gw-mw::after{content:"";position:absolute;right:0;top:0;width:10px;height:10px;border-radius:2.5px;border:1.5px solid currentColor;box-sizing:border-box}
.gw-mw i{position:absolute;left:8px;right:11px;top:4.5px;height:1.5px;background:repeating-linear-gradient(90deg,currentColor 0 2px,transparent 2px 4px);opacity:.55}
.gw-mw b{position:absolute;left:7px;top:3.5px;width:3.5px;height:3.5px;border-radius:50%;background:var(--accent);opacity:0}
.gw-btn{display:inline-flex;align-items:center;gap:9px;height:34px;padding:0 13px 0 11px;border-radius:9px;border:1px solid color-mix(in srgb,var(--accent) 45%,transparent);background:var(--accent-soft);color:var(--ink);font:600 12.5px/1 Archivo,sans-serif;cursor:pointer;white-space:nowrap;transition:transform .25s cubic-bezier(.34,1.56,.64,1),border-color .15s}
.gw-btn:hover{border-color:var(--accent);transform:translateY(-1px)}
.gw-btn:hover .gw-mw b,.gw-btn:focus-visible .gw-mw b{animation:gw-hop .8s ease-in-out infinite}
@keyframes gw-hop{0%{transform:translateX(0);opacity:0}25%{opacity:1}75%{opacity:1}100%{transform:translateX(7px);opacity:0}}
.gw-btn.off{border-style:dashed;border-color:var(--rule);background:transparent;color:var(--ink-3);cursor:not-allowed}
.gw-btn.off:hover{transform:none}
.gw-btn.sm{height:28px;font-size:12px;padding:0 10px 0 9px}

/* ======================================================================
   the shell: sidebar (recommended)
   ====================================================================== */
.nx-app{display:grid;grid-template-columns:240px minmax(0,1fr);min-height:100%;position:relative}
.nx-side{position:sticky;top:0;height:900px;align-self:start;z-index:6;display:flex;flex-direction:column;gap:18px;padding:22px 14px 18px 18px;border-right:1px solid var(--rule);background:var(--ground);min-height:100%}
.nx-brand{display:flex;align-items:baseline;gap:2px;user-select:none;padding-left:4px}
.wordmark{font-size:22px;font-weight:800;letter-spacing:-.045em;line-height:1;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px}
.nx-brand .dot{display:inline-block;flex:none;width:10px;height:10px;border-radius:50%;background:var(--accent);transform-origin:50% 100%;transition:transform .25s cubic-bezier(.34,1.56,.64,1);cursor:pointer}
.nx-brand:hover .dot{transform:translateY(-6px) scale(1.15)}
.dot.spin{animation:coinspin .6s linear}
.dot.kick{animation:kick .7s cubic-bezier(.34,1.56,.64,1)}
@keyframes kick{30%{transform:translateY(-6px) scale(1.8)}60%{transform:scale(.6)}100%{transform:none}}
@keyframes coinspin{from{transform:rotateY(0)}to{transform:rotateY(720deg)}}
.coin{position:absolute;width:9px;height:9px;border-radius:50%;background:#43c07a;pointer-events:none;animation:fall 1.1s cubic-bezier(.2,.7,.4,1) forwards;z-index:40}
@keyframes fall{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(.6);opacity:0}}

/* company, save and source: always in the shell */
.nx-co{display:flex;align-items:center;gap:8px;width:100%;border:1px solid var(--rule);border-radius:9px;background:var(--surface);padding:8px 10px;cursor:pointer;text-align:left}
.nx-co:hover{border-color:var(--ink-3)}
.nx-co .t{display:flex;flex-direction:column;min-width:0;flex:1}
.nx-co .t b{font-size:12.5px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.nx-co .t small{font:500 10.5px/1.3 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nx-src{display:grid;grid-template-columns:minmax(0,1fr) 32px;gap:4px 8px;align-items:center;padding:0 2px 0 4px}
.nx-src .st{display:flex;align-items:center;gap:7px;font:500 11px/1.2 "IBM Plex Mono",monospace;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;min-width:0}
.nx-src .st b{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none;box-shadow:0 0 0 0 currentColor;animation:nx-beat 2.4s ease-out infinite}
@keyframes nx-beat{0%{box-shadow:0 0 0 0 color-mix(in srgb,currentColor 50%,transparent)}70%{box-shadow:0 0 0 7px transparent}100%{box-shadow:0 0 0 0 transparent}}
.nx-src .st.file{color:var(--ink-2)}.nx-src .st.file b{animation:none}
.nx-src .st.stale{color:var(--warn)}.nx-src .st.stale b{animation:none}
.nx-src .st.fail{color:var(--neg)}.nx-src .st.fail b{animation:none}
.nx-src .st.read{color:var(--info)}
.nx-src .when{grid-column:1/2;font-size:11.5px;color:var(--ink-3);line-height:1.35}
.nx-src .ibtn{grid-row:1/3;grid-column:2}

.nx-nav{position:relative;display:flex;flex-direction:column;gap:1px}
.nx-nav .lab{padding:10px 8px 6px}
.nx-nav a.m{position:relative;display:grid;grid-template-columns:18px minmax(0,1fr) auto;align-items:center;gap:11px;height:38px;padding:0 8px 0 9px;border-radius:8px;color:var(--ink-2);font-size:14px;font-weight:500;transition:color .15s,background .15s}
.nx-nav a.m .i{width:18px;height:18px;transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.nx-nav a.m:hover{color:var(--ink);background:var(--surface)}
.nx-nav a.m:hover .i{transform:translateY(-2px) rotate(-6deg)}
.nx-nav a.m.on{color:var(--ink);background:var(--surface)}
.nx-nav a.m.on::before{content:"";position:absolute;left:-18px;top:9px;bottom:9px;width:3px;border-radius:0 3px 3px 0;background:var(--accent)}
.nx-nav a.m .n{font:600 10.5px/1 "IBM Plex Mono",monospace;padding:3px 6px;border-radius:9px;background:color-mix(in srgb,var(--ink) 8%,transparent);color:var(--ink-2)}
.nx-nav a.m .n.crit{background:var(--neg);color:#fff}
.nx-nav a.m .n.new{background:var(--accent-soft);color:var(--accent)}
.nx-nav .subs{display:flex;flex-direction:column;margin:2px 0 6px 18px;padding-left:10px;border-left:1px solid var(--rule)}
.nx-nav .subs a{display:flex;align-items:center;justify-content:space-between;gap:8px;height:30px;padding:0 8px;border-radius:6px;font-size:13px;color:var(--ink-2)}
.nx-nav .subs a:hover{color:var(--ink);background:var(--surface)}
.nx-nav .subs a.on{color:var(--ink);font-weight:600;background:var(--accent-soft)}
.nx-nav .subs a small{font:500 10.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.nx-nav .subs a small.w{color:var(--warn)}
.nx-nav .ref a.m{height:34px;font-size:13.5px}
.nx-util{margin-top:auto;display:flex;flex-direction:column;gap:1px;border-top:1px solid var(--rule-soft);padding-top:12px}
.nx-util a{display:flex;align-items:center;gap:10px;height:32px;padding:0 9px;border-radius:7px;color:var(--ink-2);font-size:13px}
.nx-util a:hover{color:var(--ink);background:var(--surface)}
.nx-util a .i{width:16px;height:16px}
.nx-util a kbd{margin-left:auto;font:500 10px/1 "IBM Plex Mono",monospace;color:var(--ink-3);border:1px solid var(--rule);border-radius:4px;padding:3px 5px}
.nx-util a .nd{margin-left:auto;width:7px;height:7px;border-radius:50%;background:var(--accent)}
.nx-search{white-space:nowrap;display:flex;align-items:center;gap:9px;height:34px;padding:0 9px;border-radius:8px;border:1px solid var(--rule);background:var(--surface);color:var(--ink-3);font-size:12.5px;cursor:pointer;width:100%}
.nx-search kbd{margin-left:auto;font:500 10px/1 "IBM Plex Mono",monospace;border:1px solid var(--rule);border-radius:4px;padding:3px 5px}
.nx-fine{font:500 10px/1.5 "IBM Plex Mono",monospace;color:var(--ink-3);padding:8px 9px 0;letter-spacing:.02em}

/* the main column: a page head whose rule is the sphere's shelf */
.nx-main{position:relative;min-width:0;padding:0 44px 64px 40px}
.nx-top{position:relative;display:flex;align-items:center;gap:18px;height:78px;border-bottom:1px solid var(--rule)}
.nx-top h1{font-size:23px;font-weight:700;letter-spacing:-.02em;line-height:1.1}
.nx-crumb{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-3)}
.nx-crumb a{color:var(--ink-2)}
.nx-crumb a:hover{color:var(--ink)}
.nx-crumb .i{width:12px;height:12px}
.nx-ttl{display:flex;flex-direction:column;gap:4px;min-width:0}
.clock{margin-left:auto;text-align:right;position:relative;z-index:7}
.clock b{display:block;font:500 16px/1.2 "IBM Plex Mono",monospace;letter-spacing:.01em}
.clock b i{font-style:normal;color:var(--ink-3);margin:0 6px}
.clock small{display:flex;justify-content:flex-end;align-items:center;gap:8px;font:500 10.5px/1.2 "IBM Plex Mono",monospace;color:var(--ink-3);margin-top:4px}
.fv-diff{display:inline-flex;align-items:center;gap:5px;font:500 10px/1 "IBM Plex Mono",monospace;color:var(--ink-2);padding:3px 6px;border-radius:4px;border:1px solid var(--rule);background:var(--surface)}
.fv-diff .i{width:10px;height:10px}

/* the sphere: the dot grown up, resting on the page head's rule ---------- */
.orb{position:absolute;bottom:0;width:64px;height:64px;border-radius:50%;z-index:5;cursor:pointer;will-change:transform;
  --hx:34%;--hy:30%;
  background:radial-gradient(circle at var(--hx) var(--hy),#b8f5cf 0,#5fd894 22%,#2f9e63 58%,#135c37 100%);
  box-shadow:0 18px 44px -12px #43c07a88,inset -6px -10px 18px #0b3a2255}
.board.light .orb{box-shadow:0 14px 30px -12px #00703a66,inset -6px -10px 18px #0b3a2244}
.orb u{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 30% 26%,transparent 0 5%,transparent 5%),radial-gradient(circle,#0b3a2240 0 3px,transparent 3.5px) 22% 70%/100% 100% no-repeat,radial-gradient(circle,#0b3a2240 0 2.5px,transparent 3px) 74% 34%/100% 100% no-repeat}
.orb.squish{animation:nx-squish .55s cubic-bezier(.34,1.56,.64,1)}
@keyframes nx-squish{30%{transform:var(--t) scale(1.18,.8)}60%{transform:var(--t) scale(.92,1.08)}100%{transform:var(--t)}}
.orb.in{transition:transform 1.25s cubic-bezier(.22,.8,.3,1)}
.nx-ring{position:absolute;border-radius:50%;border:2px solid #43c07a;pointer-events:none;animation:nx-ring .9s ease-out forwards;z-index:40}
@keyframes nx-ring{from{transform:scale(1);opacity:.8}to{transform:scale(1.7);opacity:0}}

/* ======================================================================
   the alternative: an evolved masthead
   ====================================================================== */
.nx-mast{position:relative;display:flex;align-items:center;gap:34px;height:92px;border-bottom:1px solid var(--rule);padding:0 44px}
.nx-mast .wordmark{font-size:29px;max-width:230px}
.nx-mast .nav{display:flex;gap:2px}
.nx-mast .nav a{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:6px;color:var(--ink-2);font-weight:500;font-size:13.5px;position:relative}
.nx-mast .nav a .i{width:18px;height:18px}
.nx-mast .nav a.on{color:var(--ink)}
.nx-mast .nav a.on::after{content:"";position:absolute;left:12px;right:12px;bottom:-24px;height:2px;border-radius:2px;background:var(--accent)}
.nx-mast .nav a .n{font:600 10px/1 "IBM Plex Mono",monospace;padding:3px 5px;border-radius:8px;background:var(--neg);color:#fff}
.nx-mast .refs{display:flex;gap:2px;padding-left:14px;border-left:1px solid var(--rule)}
.nx-mast .refs a{display:flex;align-items:center;gap:7px;padding:8px 10px;color:var(--ink-3);font-size:13px;border-radius:6px}
.nx-mast .refs a .i{width:16px;height:16px}
.nx-strip{display:flex;align-items:center;gap:14px;height:48px;padding:0 44px;border-bottom:1px solid var(--rule-soft);background:var(--surface)}
.nx-strip .co{display:flex;align-items:center;gap:8px;font-size:12.5px}
.nx-strip .co b{font-weight:600}
.nx-strip .sep{width:1px;height:18px;background:var(--rule)}

/* ======================================================================
   page parts
   ====================================================================== */
.nx-sec{margin-top:34px}
.nx-sechead{display:flex;align-items:center;flex-wrap:wrap;gap:12px 14px;margin-bottom:14px}
.nx-sechead h2{font-size:18px;font-weight:600;letter-spacing:-.01em}
.nx-sechead .aside{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.nx-h2big{font-size:26px!important;font-weight:700!important;letter-spacing:-.025em!important}
.nx-lede{font-size:13.5px;color:var(--ink-2);max-width:680px}
.nx-lede b{color:var(--ink);font-weight:600}

/* company strip: one quiet line, not a wall of tiles */
.nx-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto;align-items:stretch;margin-top:18px;border-bottom:1px solid var(--rule-soft)}
.nx-kpi{display:grid;grid-template-columns:minmax(0,1fr) 64px;grid-template-rows:auto auto auto;gap:3px 10px;padding:6px 16px 12px 0;margin-right:16px;border-right:1px solid var(--rule-soft)}
.nx-kpi .lab{grid-column:1/3;font-size:10px}
.nx-kpi .v{font:500 20px/1.15 "IBM Plex Mono",monospace;letter-spacing:-.02em;white-space:nowrap}
.nx-kpi .s{grid-column:1/3;font:400 11px/1.3 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nx-kpi svg{grid-row:2;grid-column:2;width:64px;height:22px;align-self:end}
.nx-kpi svg polyline{fill:none;stroke:var(--accent);stroke-width:1.5;stroke-linejoin:round}
.nx-kpi svg polyline.n{stroke:var(--neg)}
.nx-kpis .more{display:flex;align-items:center;padding:0 0 8px 4px}

/* Needs attention ------------------------------------------------------- */
.nx-att{margin-top:26px}
.nx-atthead{display:flex;align-items:flex-end;gap:18px;padding-bottom:14px}
.nx-atthead .t{display:flex;flex-direction:column;gap:6px;min-width:0}
.nx-atthead h2{display:flex;align-items:center;gap:12px;font-size:27px;font-weight:700;letter-spacing:-.03em;line-height:1}
.nx-atthead .checked{font-size:13px;color:var(--ink-2)}
.nx-atthead .checked b{color:var(--ink);font-weight:600}
.nx-atthead .checked .mono{font-size:12px;color:var(--ink-3)}
.nx-atthead .aside{margin-left:auto;display:flex;align-items:center;gap:6px;flex:none}
.nx-attgrid{display:grid;grid-template-columns:minmax(0,1fr) 272px;gap:30px;align-items:start}
.nx-band{display:flex;align-items:center;gap:10px;padding:14px 0 8px;border-bottom:1px solid var(--rule)}
.nx-band .lab{letter-spacing:.12em}
.nx-band .lab.crit{color:var(--neg)}
.nx-band .lab.watch{color:var(--warn)}
.nx-band .quiet{margin-left:auto}
.nx-band .n{font:600 11px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}

/* a critical finding: headline, place, evidence, consequence, action ------ */
.nx-f{position:relative;display:grid;grid-template-columns:14px minmax(0,1fr) 196px;gap:0 16px;padding:16px 4px 16px 0;border-bottom:1px solid var(--rule-soft);transition:background .15s,box-shadow .2s}
.nx-f:hover{background:linear-gradient(90deg,transparent,var(--surface) 12%)}
.nx-f .mark{width:9px;height:9px;border-radius:50%;margin-top:7px;justify-self:center;transition:transform .2s cubic-bezier(.34,1.56,.64,1)}
.nx-f:hover .mark{transform:scale(1.5)}
.nx-f.crit .mark{background:var(--neg);box-shadow:0 0 0 4px var(--neg-soft)}
.nx-f.watch .mark{background:var(--warn)}
.nx-f.opp .mark{background:var(--accent)}
.nx-f .bd{display:flex;flex-direction:column;gap:6px;min-width:0}
.nx-f .where{display:flex;align-items:center;flex-wrap:wrap;gap:6px 8px;font-size:12.5px;color:var(--ink-2)}
.nx-f .where b{color:var(--ink-2);font-weight:500}
.nx-f .where .item{color:var(--ink);font-weight:600}
.nx-f .where .k{font:500 10.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3);letter-spacing:.06em;text-transform:uppercase}
.nx-f .where .sep{color:var(--ink-3)}
.nx-f h3{font-size:16px;font-weight:600;letter-spacing:-.01em;line-height:1.3}
.nx-f .ev{font:400 12.5px/1.5 "IBM Plex Mono",monospace;color:var(--ink-2)}
.nx-f .ev b{color:var(--ink);font-weight:500}
.nx-f .cons{display:flex;align-items:center;flex-wrap:wrap;gap:6px 8px;font-size:12.5px;color:var(--ink-2)}
.nx-f .viz{margin-top:4px}
.nx-f .act{display:flex;flex-direction:column;align-items:stretch;gap:7px;padding-top:2px}
.nx-f .act .alt{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-3)}
.nx-f .act .alt .i{width:13px;height:13px}
.nx-f .act .link{align-self:flex-start}
.nx-f .kids{display:flex;flex-direction:column;margin-top:4px;border-left:1px solid var(--rule);padding-left:12px}
.nx-f .kids > div{display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:8px;align-items:center;padding:5px 0;font-size:13px}
.nx-f .kids .i{width:15px;height:15px;color:var(--ink-3)}
.nx-f .kids small{font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.nx-f .linked{display:inline-flex;align-items:center;gap:6px;font:500 11px/1.3 "IBM Plex Mono",monospace;color:var(--info);background:none;border:0;padding:0;cursor:pointer}
.nx-f .linked .i{width:13px;height:13px}
.nx-f.lit{background:linear-gradient(90deg,transparent,var(--info-soft) 14%);box-shadow:inset 3px 0 0 var(--info)}
.nx-f.held{background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--accent) 6%,transparent) 14%)}

/* a compact finding: one line, still with its named action */
.nx-r{position:relative;display:grid;grid-template-columns:14px 164px minmax(0,1fr) auto 196px;gap:0 14px;align-items:center;min-height:52px;padding:8px 4px 8px 0;border-bottom:1px solid var(--rule-soft);transition:background .15s}
.nx-r:hover{background:linear-gradient(90deg,transparent,var(--surface) 12%)}
.nx-r .mark{width:8px;height:8px;border-radius:50%;justify-self:center}
.nx-r.crit .mark{background:var(--neg)}.nx-r.watch .mark{background:var(--warn)}.nx-r.opp .mark{background:var(--accent)}
.nx-r .site{display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--ink-2);min-width:0;white-space:nowrap}
.nx-r .site span:last-child{overflow:hidden;text-overflow:ellipsis}
.nx-r .w{display:flex;flex-direction:column;gap:2px;min-width:0}
.nx-r .w b{font-size:14px;font-weight:600;line-height:1.3}
.nx-r .w small{font:400 11.5px/1.35 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nx-r .amt{font:500 13px/1.1 "IBM Plex Mono",monospace;text-align:right;white-space:nowrap}
.nx-r .amt small{display:block;font-size:10.5px;color:var(--ink-3);margin-top:3px}
.nx-r .to{display:flex;align-items:center;justify-content:flex-end;gap:6px;font-size:12.5px;font-weight:600;color:var(--accent);white-space:nowrap}
.nx-r .to .i{width:14px;height:14px;transition:transform .2s}
.nx-r:hover .to .i{transform:translateX(3px)}
.nx-r .to .gw-mw{color:var(--ink-3)}

/* where a finding is in its own resolution: the four states, never merged */
.nx-state{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 8px;border-radius:11px;font:500 11px/1 "IBM Plex Mono",monospace;white-space:nowrap;border:1px solid var(--rule);color:var(--ink-2);background:var(--surface)}
.nx-state .i{width:12px;height:12px}
.nx-state.sug{border-style:dashed}
.nx-state.mine{color:var(--ink);border-color:var(--ink-3)}
.nx-state.mine .i{stroke-width:2.2}
.nx-state.link{color:var(--info);border-color:color-mix(in srgb,var(--info) 45%,transparent);background:var(--info-soft)}
.nx-state.conf{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 45%,transparent);background:var(--accent-soft)}
.nx-state.conf .i{stroke-width:2.4}
.nx-state.bad{color:var(--neg);border-color:color-mix(in srgb,var(--neg) 45%,transparent);background:var(--neg-soft)}
.nx-state.wait{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 45%,transparent);background:var(--warn-soft)}

/* the footer lines Needs attention always keeps: what was left out and why */
.nx-omit{display:flex;flex-direction:column;gap:6px;padding:12px 0 0;font-size:12.5px;color:var(--ink-3)}
.nx-omit > div{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.nx-omit .i{width:14px;height:14px}
.nx-omit b{color:var(--ink-2);font-weight:500}
.nx-more{display:flex;align-items:center;gap:14px;padding:12px 0 2px}
.nx-more .nx-btn{height:32px}

/* the right rail: what was checked, what you changed ------------------- */
.nx-rail{display:flex;flex-direction:column;gap:14px;position:relative}
.nx-box{border:1px solid var(--rule-soft);border-radius:12px;background:var(--surface);padding:15px 16px}
.nx-box h4{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;margin-bottom:10px}
.nx-box h4 .i{color:var(--ink-3)}
.nx-box h4 .aside{margin-left:auto}
.nx-checked{display:grid;grid-template-columns:auto minmax(0,1fr);gap:7px 10px;font-size:12.5px;color:var(--ink-2)}
.nx-checked b{font:500 13px/1.2 "IBM Plex Mono",monospace;color:var(--ink);text-align:right}
.nx-prog{display:flex;flex-direction:column;gap:10px}
.nx-prog .it{display:flex;flex-direction:column;gap:5px;padding-bottom:10px;border-bottom:1px solid var(--rule-soft)}
.nx-prog .it:last-child{border-bottom:0;padding-bottom:0}
.nx-prog .it b{font-size:12.5px;font-weight:600;line-height:1.35}
.nx-prog .it small{font-size:11.5px;color:var(--ink-3);line-height:1.35}
.nx-legend{display:grid;grid-template-columns:1fr;gap:6px;font-size:12px;color:var(--ink-2)}
.nx-legend > div{display:flex;align-items:center;gap:8px}

/* task directory: four stable groups, labels that never move ----------- */
.nx-tasks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;border-top:1px solid var(--rule)}
.nx-tg{display:flex;flex-direction:column;padding:16px 18px 10px 0;border-right:1px solid var(--rule-soft)}
.nx-tg + .nx-tg{padding-left:18px}
.nx-tg:last-child{border-right:0}
.nx-tg .gh{display:flex;align-items:center;gap:9px;margin-bottom:8px}
.nx-tg .gh .ic{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent)}
.nx-tg .gh .ic .i{width:17px;height:17px}
.nx-tg .gh b{font-size:15px;font-weight:600}
.nx-tg .gh a{margin-left:auto;font-size:12px;color:var(--ink-3);display:flex;align-items:center;gap:3px}
.nx-tg .gh a .i{width:12px;height:12px}
.nx-tg .gh a:hover{color:var(--ink)}
.nx-task{display:grid;grid-template-columns:minmax(0,1fr) auto 14px;gap:2px 8px;align-items:center;padding:9px 6px 9px 0;border-top:1px solid var(--rule-soft);border-radius:0 6px 6px 0;transition:background .15s}
.nx-task:first-of-type{border-top:0}
.nx-task b{font-size:13.5px;font-weight:600;line-height:1.3}
.nx-task small{grid-column:1/2;font:400 11.5px/1.35 "IBM Plex Mono",monospace;color:var(--ink-3)}
.nx-task .c{grid-row:1/3;grid-column:2;font:500 11px/1 "IBM Plex Mono",monospace;white-space:nowrap}
.nx-task .c.w{color:var(--warn)}.nx-task .c.b{color:var(--neg)}.nx-task .c.g{color:var(--ink-3)}
.nx-task > .i{grid-row:1/3;grid-column:3;width:14px;height:14px;color:var(--ink-3);transition:transform .2s,color .15s}
.nx-task:hover{background:linear-gradient(90deg,transparent,var(--surface) 20%)}
.nx-task:hover > .i{color:var(--accent);transform:translateX(3px)}
.nx-task.pre b{color:var(--ink-2)}
.nx-task.pre small{color:var(--ink-3)}

.nx-jump{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--ink-2);border:1px solid var(--rule);border-radius:16px;padding:5px 11px;background:var(--surface);cursor:pointer}
.nx-jump .i{width:13px;height:13px}
.nx-jump:hover{color:var(--ink);border-color:var(--ink-3)}

/* evidence: the stock-cover rail (depot page), the hours bar, the need strip */
.nx-cov{display:flex;flex-direction:column;gap:4px}
.nx-cov .days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}
.nx-cov .d{position:relative;height:12px;border-radius:2px;background:var(--accent);opacity:.85}
.nx-cov .d.half{background:linear-gradient(90deg,var(--accent) 0 58%,transparent 58%),repeating-linear-gradient(135deg,var(--neg) 0 2px,transparent 2px 5px);opacity:1}
.nx-cov .d.dry{background:repeating-linear-gradient(135deg,var(--neg) 0 2px,transparent 2px 5px);opacity:.9}
.nx-cov .d.none{background:var(--rule-soft);opacity:1}
.nx-cov .d .trk{position:absolute;left:50%;top:-15px;transform:translateX(-50%);color:var(--ink)}
.nx-cov .d .trk .i{width:13px;height:13px}
.nx-cov .ax{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;font:500 9.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3);text-align:center}
.nx-cov .ax .on{color:var(--ink)}
.nx-hrs{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:1.5px}
.nx-hrs i{height:9px;border-radius:1.5px;background:var(--rule)}
.nx-hrs i.on{background:var(--accent)}
.nx-hrs i.pl{background:transparent;box-shadow:inset 0 0 0 1.2px var(--accent)}
.nx-hrs i.gap{background:repeating-linear-gradient(135deg,var(--neg) 0 2px,transparent 2px 4px)}
.nx-hrs.big i{height:14px;border-radius:2px}
.nx-bars{display:flex;align-items:flex-end;gap:3px;height:26px}
.nx-bars i{flex:1;background:var(--accent);opacity:.8;border-radius:1.5px 1.5px 0 0}

/* the arrival strip: from Needs attention, with a way back ------------- */
.nx-from{display:flex;align-items:center;gap:12px;margin-top:16px;padding:9px 10px 9px 8px;border-radius:10px;background:color-mix(in srgb,var(--accent) 9%,var(--surface));border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);animation:nx-slide .5s cubic-bezier(.2,.7,.2,1)}
@keyframes nx-slide{from{transform:translateY(-8px);opacity:0}to{transform:none;opacity:1}}
.nx-from .back{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px 0 8px;border-radius:15px;background:var(--accent);color:var(--on-accent);font:600 12px/1 Archivo,sans-serif;white-space:nowrap}
.nx-from .back .i{width:14px;height:14px}
.nx-from .what{font-size:13px;color:var(--ink-2);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nx-from .what b{color:var(--ink);font-weight:600}
.nx-from .pos{margin-left:auto;display:flex;align-items:center;gap:10px;font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap}
.nx-from .pos a{display:inline-flex;align-items:center;gap:4px;color:var(--ink-2);font-family:Archivo,sans-serif;font-size:12.5px;font-weight:500}
.nx-from .pos a .i{width:13px;height:13px}
.nx-prop{display:inline-flex;align-items:center;gap:4px;font:600 9.5px/1 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--info);border:1px dashed color-mix(in srgb,var(--info) 55%,transparent);border-radius:4px;padding:3px 5px;white-space:nowrap}

/* scope and basis: what the page is about, and what it plans for ------- */
.nx-scope{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:16px}
.nx-scope .lab{margin-right:4px}
.nx-pick{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 10px;border-radius:8px;border:1px solid var(--rule);background:var(--surface);font-size:12.5px;color:var(--ink);cursor:pointer;white-space:nowrap}
.nx-pick .i{width:14px;height:14px;color:var(--ink-3)}
.nx-pick .mono{font-size:11px}
.nx-pick.sel{border-color:var(--accent);background:var(--accent-soft)}
.nx-pick .x{color:var(--ink-3);margin-left:2px}
.nx-basis{display:grid;grid-template-columns:auto auto minmax(0,1fr);gap:10px 16px;align-items:center;margin-top:14px;padding:12px 14px;border-radius:10px;border:1px solid var(--rule-soft);background:var(--surface)}
.nx-basis .txt{font-size:12.5px;color:var(--ink-2);line-height:1.45}
.nx-basis .txt b{color:var(--ink);font-weight:600}
.nx-basis .seg{background:var(--ground)}

/* tables in the board's manner ----------------------------------------- */
.nx-t{width:100%;border-collapse:collapse;font-size:13px}
.nx-t th{font:500 10px/1.2 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);text-align:left;padding:10px 10px 9px;border-bottom:1px solid var(--rule);white-space:nowrap;font-weight:500}
.nx-t td{padding:11px 10px;border-bottom:1px solid var(--rule-soft);vertical-align:middle}
.nx-t td.n,.nx-t th.n{text-align:right;font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums}
.nx-t td small{display:block;font-size:11.5px;color:var(--ink-3);margin-top:2px}
.nx-t tr.sel td{background:color-mix(in srgb,var(--accent) 7%,transparent)}
.nx-t tr.grp td{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);padding-top:18px;border-bottom:1px solid var(--rule)}

/* the change checklist: its truck, its ticks --------------------------- */
.nx-ck{display:flex;align-items:center;gap:14px;padding:13px 16px;border-radius:12px;background:var(--surface);border:1px solid var(--rule-soft)}
.nx-ck .road{position:relative;flex:1;height:22px}
.nx-ck .road::before{content:"";position:absolute;left:0;right:0;top:15px;border-top:1.5px dashed var(--rule)}
.nx-ck .road .done{position:absolute;left:0;top:14.5px;height:2px;background:var(--accent);width:var(--p,0%);transition:width .8s cubic-bezier(.2,.7,.2,1)}
.nx-ck .road .truck{position:absolute;top:0;left:var(--p,0%);transform:translateX(-50%);color:var(--ink);transition:left .8s cubic-bezier(.2,.7,.2,1)}
.nx-ck .road .truck .i{width:20px;height:20px}
.nx-ck .road .truck.go{animation:nx-bump .35s ease-in-out 3}
@keyframes nx-bump{50%{transform:translateX(-50%) translateY(-2px)}}
.nx-ck .cnt{font:500 13px/1 "IBM Plex Mono",monospace;white-space:nowrap}
.nx-ck .cnt b{font-weight:600;font-size:15px}
.nx-tick{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--ink-3);background:none;display:grid;place-items:center;cursor:pointer;color:transparent;padding:0;flex:none;transition:all .2s}
.nx-tick .i{width:13px;height:13px;stroke-width:2.6}
.nx-tick:hover{border-color:var(--accent)}
.done > .nx-tick,.nx-tick.on{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.nx-tick.link{border-color:var(--info);background:var(--info-soft);color:var(--info)}
.nx-tick.conf{border-color:var(--accent);background:var(--accent);color:var(--on-accent)}
.nx-chg{display:grid;grid-template-columns:22px minmax(0,1fr) 150px 210px;gap:6px 14px;align-items:center;padding:13px 4px 13px 0;border-bottom:1px solid var(--rule-soft)}
.nx-chg .s{display:flex;flex-direction:column;gap:4px;min-width:0}
.nx-chg .s b{font-size:13.5px;font-weight:600}
.nx-chg .s small{font-size:12px;color:var(--ink-3);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.nx-chg .v{font:500 13px/1.3 "IBM Plex Mono",monospace;text-align:right;white-space:nowrap}
.nx-chg .v s{color:var(--ink-3)}
.nx-chg .v em{font-style:normal;color:var(--accent);font-weight:600}
.nx-chg .v small{display:block;font-size:10.5px;color:var(--ink-3)}
.nx-chg.done .s b{color:var(--ink-2)}
.nx-copy{font:400 11.5px/1.55 "IBM Plex Mono",monospace;color:var(--ink-2);background:var(--ground);border:1px solid var(--rule-soft);border-radius:8px;padding:12px 14px;white-space:pre-wrap}

/* a proposal note on the artboard itself (new interaction work) --------- */
.nx-tag{display:inline-flex;align-items:center;gap:5px;font:600 9.5px/1 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;padding:4px 6px;border-radius:4px;white-space:nowrap}
.nx-tag.ex{color:var(--ink-2);background:color-mix(in srgb,var(--ink) 8%,transparent)}
.nx-tag.rg{color:var(--accent);background:var(--accent-soft)}
.nx-tag.nw{color:var(--info);background:var(--info-soft)}

/* write dialog (the wire), from mockup/write-dialogs, as shipped -------- */
.gw-dlg{width:480px;border-radius:16px;background:var(--surface);border:1px solid var(--rule);color:var(--ink);box-shadow:var(--shadow);overflow:hidden;display:flex;flex-direction:column}
.gw-head{display:grid;grid-template-columns:40px minmax(0,1fr) 32px;gap:14px;align-items:center;padding:18px 16px 14px 20px}
.gw-kind{width:40px;height:40px;border-radius:12px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center}
.gw-kind .i{width:21px;height:21px}
.gw-head h2{font-size:17px;font-weight:600;letter-spacing:-.01em;line-height:1.25}
.gw-where{display:flex;align-items:center;gap:7px;margin-top:4px;font-size:12.5px;color:var(--ink-2)}
.gw-where .hood{height:18px;min-width:22px;font-size:9.5px}
.gw-x{width:32px;height:32px;border-radius:8px;border:0;background:none;color:var(--ink-3);display:grid;place-items:center;cursor:pointer}
.gw-verdict{display:flex;align-items:center;gap:12px;margin:0 20px;padding:10px 12px;min-height:42px;border-radius:10px;background:var(--ground);font-size:13px;color:var(--ink-2)}
.gw-verdict b{color:var(--ink);font-weight:600}
.gw-meta{margin-left:auto;font:500 11px/1.3 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap;text-align:right}
.gw-w{position:relative;flex:none;width:58px;height:16px;color:var(--info)}
.gw-w .a{position:absolute;left:0;top:3px;width:10px;height:10px;border-radius:50%;background:var(--accent)}
.gw-w .g{position:absolute;right:0;top:0;width:17px;height:17px;display:grid;place-items:center}
.gw-w .g .i{width:17px;height:17px}
.gw-w .ln{position:absolute;left:13px;right:21px;top:7.5px;height:1.5px;background:repeating-linear-gradient(90deg,currentColor 0 3px,transparent 3px 6px);opacity:.6}
.gw-w .p{position:absolute;left:12px;top:6px;width:4px;height:4px;border-radius:50%;background:currentColor;opacity:0}
.gw-w.ask .p{animation:gw-pk 1.2s linear infinite}
.gw-w.ask .p:nth-of-type(2){animation-delay:.4s}.gw-w.ask .p:nth-of-type(3){animation-delay:.8s}
@keyframes gw-pk{0%{transform:translateX(0);opacity:0}20%{opacity:1}80%{opacity:1}100%{transform:translateX(22px);opacity:0}}
.gw-w.ok{color:var(--accent)}.gw-w.ok .ln{background:currentColor;opacity:1}
.gw-w.no{color:var(--neg)}.gw-w.no .ln{background:linear-gradient(90deg,currentColor 0 34%,transparent 34% 66%,currentColor 66%);opacity:1}
.gw-w.wait{color:var(--warn)}.gw-w.wait .p:first-of-type{left:22px;opacity:1;animation:gw-blink 1.1s ease-in-out infinite}
@keyframes gw-blink{50%{opacity:.2;transform:scale(.6)}}
.gw-w.busy{color:var(--ink-3)}.gw-w.busy .p:first-of-type{opacity:1;animation:gw-bounce .9s ease-in-out infinite alternate}
@keyframes gw-bounce{from{transform:translateX(0)}to{transform:translateX(20px)}}
.gw-w.moved{color:var(--warn)}.gw-w.moved .ln{background:currentColor;opacity:.8}
.gw-body{display:flex;flex-direction:column;gap:14px;padding:16px 20px 4px}
.gw-foot{display:flex;align-items:center;gap:10px;padding:14px 20px 18px;border-top:1px solid var(--rule-soft);margin-top:14px}
.gw-hint{font-size:12px;color:var(--ink-3);margin-right:auto;line-height:1.35}
.gw-b{display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 16px;border-radius:10px;border:1px solid var(--rule);background:transparent;color:var(--ink);font:600 13px/1 Archivo,sans-serif;cursor:pointer;white-space:nowrap}
.gw-b.go{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.gw-b.ghost{border-color:transparent;color:var(--ink-2)}
.gw-b.off{border-style:dashed;color:var(--ink-3);background:transparent;border-color:var(--rule)}
.gw-b .i{width:15px;height:15px}
.gw-mat{border:1px solid var(--rule-soft);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:9px;background:var(--surface)}
.gw-mat .top{display:flex;align-items:center;gap:8px;font-size:13.5px}
.gw-mat .top b{font-weight:600}
.gw-mat .top .num{margin-left:auto;font:500 13px/1 "IBM Plex Mono",monospace}
.gw-mat .top .num s{color:var(--ink-3);margin-right:6px}
.gw-mat .top .num em{font-style:normal;color:var(--accent);font-weight:600}
.gw-lvl{position:relative;height:12px;border-radius:3px;background:var(--rule-soft);overflow:visible}
.gw-lvl .now{position:absolute;left:0;top:0;bottom:0;background:var(--ink-3);border-radius:3px 0 0 3px;opacity:.7}
.gw-lvl .add{position:absolute;top:0;bottom:0;background:var(--accent);border-radius:0 3px 3px 0}
.gw-lvl .cap{position:absolute;top:-4px;bottom:-4px;width:2px;background:var(--ink-2)}
.gw-lvl .cap::after{content:attr(data-l);position:absolute;top:18px;left:50%;transform:translateX(-50%);font:500 9.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap}
.gw-lvl .over{position:absolute;top:0;bottom:0;background:repeating-linear-gradient(135deg,var(--neg) 0 2px,transparent 2px 5px)}
.gw-mat .meta{display:flex;flex-wrap:wrap;gap:6px 12px;font:500 11px/1.3 "IBM Plex Mono",monospace;color:var(--ink-3)}
.gw-pill{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:11px;background:var(--raised);border:1px solid var(--rule);font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.gw-pill b{display:inline-grid;place-items:center;width:15px;height:15px;border-radius:50%;background:var(--ink-2);color:var(--ground);font-size:9.5px}
.gw-no{border:1px solid color-mix(in srgb,var(--neg) 40%,transparent);background:var(--neg-soft);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.gw-no .rule{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;color:var(--neg)}
.gw-no .rule .i{width:16px;height:16px}
.gw-no p{font-size:12.5px;color:var(--ink-2);line-height:1.45}
.gw-no .fix{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--ink)}
.gw-no .fix .i{width:14px;height:14px;color:var(--accent)}
.gw-no.warn{border-color:color-mix(in srgb,var(--warn) 40%,transparent);background:var(--warn-soft)}
.gw-no.warn .rule{color:var(--warn)}
.gw-lock{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:1.5px;margin-top:2px}
.gw-lock i{height:10px;background:var(--rule);border-radius:1.5px}
.gw-lock i.x{background:repeating-linear-gradient(135deg,var(--neg) 0 2px,transparent 2px 4px)}
.gw-lock i.now{box-shadow:0 0 0 2px var(--warn)}
.gw-reread{display:flex;align-items:center;gap:10px;font:500 11.5px/1.3 "IBM Plex Mono",monospace;color:var(--ink-3)}
.gw-reread .bar{flex:1;height:3px;border-radius:2px;background:var(--rule-soft);overflow:hidden;position:relative}
.gw-reread .bar::after{content:"";position:absolute;left:-40%;top:0;bottom:0;width:40%;background:var(--accent);animation:nx-scan 1.2s ease-in-out infinite}
@keyframes nx-scan{to{left:100%}}
.gw-reread.done{color:var(--accent)}.gw-reread.done .bar::after{animation:none;left:0;width:100%}
.gw-scene{position:relative;height:118px;border-radius:12px;background:linear-gradient(160deg,#233128,#131a16);overflow:hidden;border:1px solid var(--rule-soft)}
.gw-pop{position:absolute;left:50%;top:18px;transform:translateX(-50%);width:250px;border-radius:8px;background:#f4f1ea;color:#1b1e1c;padding:10px 12px;font-size:11.5px;box-shadow:0 10px 30px #0008}
.gw-pop b{display:block;font-size:12px;margin-bottom:3px}
.gw-pop .bt{display:flex;gap:6px;margin-top:8px;justify-content:flex-end}
.gw-pop .bt span{padding:4px 10px;border-radius:5px;background:#dcd6ca;font-weight:600;font-size:11px}
.gw-pop .bt span.y{background:#2f9e63;color:#fff}
.gw-cursor{position:absolute;left:62%;top:86px;width:14px;height:14px;animation:nx-cur 2.4s ease-in-out infinite}
@keyframes nx-cur{0%{transform:translate(-40px,20px)}60%,100%{transform:translate(0,0)}}

/* the annotation voice used on structure sheets ------------------------- */
.nx-sheet{padding:48px 56px}
.nx-sheet h1{font-size:34px;font-weight:800;letter-spacing:-.035em}
.nx-sheet .sub{margin-top:8px;font-size:14px;color:var(--ink-2);max-width:900px}

/* reduced motion: every movement has a still equivalent ------------------ */
.board.rm *,.board.rm *::before,.board.rm *::after{animation:none!important;transition:none!important}
.board.rm .orb{transform:none}
.board.rm .gw-w.ask .p:nth-of-type(1){opacity:1;left:18px}
.board.rm .gw-w.ask .p:nth-of-type(2){opacity:1;left:26px}
.board.rm .gw-w.wait .p:first-of-type{opacity:1}
.board.rm .gw-reread .bar::after{left:0;width:45%}
"""

# --------------------------------------------------------------------------
# icons: inline stroke svg, the board's own drawing style
# --------------------------------------------------------------------------
_P = {
    "overview": '<circle cx="12" cy="12" r="8.5"></circle><circle cx="12" cy="12" r="4"></circle><path d="M12 3.5V2M12 22v-1.5M3.5 12H2M22 12h-1.5"></path>',
    "businesses": '<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"></path><path d="M14 10h5a1 1 0 0 1 1 1v10M4 21h17M8 8h2M8 12h2M8 16h2M17 14h1M17 18h1"></path>',
    "supply": '<path d="M3.5 8.5 12 4l8.5 4.5v8L12 21l-8.5-4.5z"></path><path d="M3.5 8.5 12 13l8.5-4.5M12 13v8"></path>',
    "staffing": '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path><circle cx="17" cy="9" r="2.5"></circle><path d="M15.5 14.5a5 5 0 0 1 6 5"></path>',
    "expansion": '<path d="M4 18 10 12l4 4 6-7"></path><path d="M15 9h5v5"></path>',
    "map": '<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z"></path><path d="M9 4v14M15 6v14"></path>',
    "guide": '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"></path><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7h6M9 10.5h4"></path>',
    "search": '<circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4.2-4.2"></path>',
    "prefs": '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"></path><circle cx="16" cy="7" r="2"></circle><circle cx="10" cy="17" r="2"></circle>',
    "news": '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"></path>',
    "help": '<circle cx="12" cy="12" r="8.5"></circle><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6"></path><path d="M12 16.8v.2"></path>',
    "go": '<path d="M5 12h14M13 6l6 6-6 6"></path>',
    "back": '<path d="M19 12H5M11 6l-6 6 6 6"></path>',
    "chev": '<path d="M9 6l6 6-6 6"></path>',
    "chevd": '<path d="M6 9l6 6 6-6"></path>',
    "chevu": '<path d="M6 15l6-6 6 6"></path>',
    "tick": '<path d="M5 12.5l4.5 4.5L19 7"></path>',
    "x": '<path d="M6 6l12 12M18 6 6 18"></path>',
    "truck": '<path d="M2.5 7h11v9h-11z"></path><path d="M13.5 10h4l3 3v3h-7"></path><circle cx="6.5" cy="17.5" r="1.7"></circle><circle cx="17" cy="17.5" r="1.7"></circle>',
    "tank": '<path d="M6 4h12v16H6z"></path><path d="M6 13h12"></path><path d="M9 16.5h6"></path>',
    "copy": '<rect x="8.5" y="8.5" width="11" height="11" rx="2"></rect><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"></path>',
    "refresh": '<path d="M20 12a8 8 0 1 1-2.3-5.7"></path><path d="M20 4v5h-5"></path>',
    "plug": '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"></path>',
    "lock": '<rect x="5" y="10.5" width="14" height="10" rx="2"></rect><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"></path>',
    "link": '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"></path><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"></path>',
    "warn": '<path d="M12 4 2.8 19.5h18.4z"></path><path d="M12 10v4.5M12 17v.2"></path>',
    "pin": '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"></path><circle cx="12" cy="10" r="2.2"></circle>',
    "calendar": '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path>',
    "clock": '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path>',
    "factory": '<path d="M3 21V11l5 3V11l5 3V7l8-3v17z"></path><path d="M7 17h2M12 17h2M17 17h1"></path>',
    "shop": '<path d="M4 10v10h16V10"></path><path d="M3 5h18l-1.5 5h-15z"></path><path d="M9 20v-6h6v6"></path>',
    "warehouse": '<path d="M3 20V9l9-5 9 5v11"></path><path d="M7 20v-7h10v7M7 16h10"></path>',
    "office": '<rect x="5" y="3" width="14" height="18" rx="1"></rect><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"></path>',
    "home": '<path d="M4 11 12 4l8 7v9H4z"></path><path d="M10 20v-5h4v5"></path>',
    "plus": '<path d="M12 5v14M5 12h14"></path>',
    "minus": '<path d="M5 12h14"></path>',
    "ext": '<path d="M14 4h6v6M20 4l-9 9"></path><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"></path>',
    "filter": '<path d="M4 5h16l-6 7.5V19l-4-2v-4.5z"></path>',
    "eye": '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"></path><circle cx="12" cy="12" r="3"></circle>',
    "eyeoff": '<path d="M3 3l18 18M10.6 5.6A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.7M6.6 6.6A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 4.4-1.1"></path>',
    "flow": '<circle cx="5" cy="6" r="2"></circle><circle cx="5" cy="18" r="2"></circle><circle cx="19" cy="12" r="2"></circle><path d="M7 6c6 0 5 6 10 6M7 18c6 0 5-6 10-6"></path>',
    "list": '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"></path>',
    "star": '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"></path>',
    "tag": '<path d="M3.5 12.5V4.5h8l9 9-8 8z"></path><circle cx="8" cy="9" r="1.5"></circle>',
    "megaphone": '<path d="M3 10v4h3l7 4V6L6 10z"></path><path d="M16.5 9a4 4 0 0 1 0 6"></path>',
    "trophy": '<path d="M8 4h8v5a4 4 0 0 1-8 0z"></path><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"></path>',
    "wallet": '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4z"></path><path d="M4 7l11-3v3M16 13.5h.01"></path>',
    "coin": '<circle cx="12" cy="12" r="8"></circle><path d="M12 8v8M9.5 10.2c0-1 1.1-1.7 2.5-1.7s2.5.7 2.5 1.7-1.1 1.4-2.5 1.8-2.5.8-2.5 1.8 1.1 1.7 2.5 1.7 2.5-.7 2.5-1.7"></path>',
    "music": '<path d="M9 18V6l10-2v12"></path><circle cx="6.5" cy="18" r="2.5"></circle><circle cx="16.5" cy="16" r="2.5"></circle>',
    "sink": '<path d="M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"></path><path d="M12 12V6a2 2 0 0 1 4 0"></path>',
    "door": '<path d="M6 21V4h12v17M4 21h16"></path><circle cx="14.5" cy="12.5" r=".8"></circle>',
    "brush": '<path d="M14 4l6 6-8 8-6-6z"></path><path d="M6 12l-2 8 8-2"></path>',
    "shirt": '<path d="M8 4 4 7l2 3 2-1v11h8V9l2 1 2-3-4-3a4 4 0 0 1-8 0z"></path>',
    "keyboard": '<rect x="2.5" y="6" width="19" height="12" rx="2"></rect><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"></path>',
    "motion": '<path d="M4 12h3l2-6 4 12 2-6h5"></path>',
    "globe": '<circle cx="12" cy="12" r="8.5"></circle><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z"></path>',
    "folder": '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
    "file": '<path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4"></path>',
    "vote": '<path d="M7 11V20H4v-9zM7 11l4-7a2 2 0 0 1 3 2l-1 4h6a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7"></path>',
    "archive": '<rect x="3" y="4" width="18" height="5" rx="1"></rect><path d="M5 9v11h14V9M10 13h4"></path>',
    "heart": '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"></path>',
    "gear": '<circle cx="12" cy="12" r="3"></circle><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"></path>',
    "hand": '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6H10a5 5 0 0 1-4.3-2.5L3.5 13.8a1.5 1.5 0 0 1 2.4-1.8L8 14"></path>',
    "users": '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path><path d="M16 11.5a3 3 0 1 0 0-6M18.5 20a5.5 5.5 0 0 0-3-4.9"></path>',
    "cart": '<circle cx="9" cy="19" r="1.5"></circle><circle cx="17" cy="19" r="1.5"></circle><path d="M3 4h2l2.4 11h11L21 8H7"></path>',
    "cursor": '<path d="M5 3l14 7-6 2-2 6z"></path>',
    "game": '<rect x="3" y="6" width="18" height="12" rx="3"></rect><path d="M8 10v4M6 12h4M15 11h.01M17.5 13h.01"></path>',
}


def ic(name: str, cls: str = "i", style: str = "") -> str:
    st = f' style="{style}"' if style else ""
    return f'<svg class="{cls}" viewBox="0 0 24 24" aria-hidden="true"{st}>{_P[name]}</svg>'


def hood(tag: str) -> str:
    return f'<span class="hood">{tag}</span>'


def chip(kind: str, text: str, icon: str = "") -> str:
    return f'<span class="chip {kind}">{ic(icon) if icon else ""}{text}</span>'


def state(kind: str, text: str | None = None) -> str:
    """The four execution states of a change, plus refusal/waiting, never merged."""
    words = {"sug": ("Suggested", "dot"), "mine": ("Marked done by you", "tick"),
             "link": ("Applied through game link", "link"), "conf": ("Confirmed from refreshed data", "tick"),
             "bad": ("Refused by the game", "x"), "wait": ("Waiting", "clock")}
    t, i = words[kind]
    icon = '<i style="width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block"></i>' if i == "dot" else ic(i)
    return f'<span class="nx-state {kind}">{icon}{text or t}</span>'


def mw() -> str:
    return '<span class="gw-mw" aria-hidden="true"><i></i><b></b></span>'


def gwbtn(label: str, cls: str = "", href: str = "#", n: str = "") -> str:
    tag = "a" if href != "#" else "button"
    attr = f'href="{href}"' if tag == "a" else 'type="button"'
    return f'<{tag} class="gw-btn {cls}" {attr}>{mw()}{label}</{tag}>'


def btn(label: str, cls: str = "", href: str = "#", icon: str = "", icon_end: str = "") -> str:
    inner = (ic(icon) if icon else "") + label + (ic(icon_end) if icon_end else "")
    if href and href != "#":
        return f'<a class="nx-btn {cls}" href="{href}">{inner}</a>'
    return f'<button type="button" class="nx-btn {cls}">{inner}</button>'


def cover(days: list[str], labels: list[str], truck: int | None = None, today: int = 0) -> str:
    """The depot page's seven-day stock rail: covered, half, dry, none; truck on its day."""
    cells = "".join(f'<i class="d {d}">{"<span class=trk>" + ic("truck") + "</span>" if k == truck else ""}</i>' for k, d in enumerate(days))
    ax = "".join(f'<span class="{"on" if k == today else ""}">{l}</span>' for k, l in enumerate(labels))
    return f'<div class="nx-cov" role="img" aria-label="Stock cover over the next seven days"><div class="days">{cells}</div><div class="ax">{ax}</div></div>'


def hrow(label: str, strip: str) -> str:
    return f'<div style="display:grid;grid-template-columns:26px minmax(0,1fr);gap:6px;align-items:center"><span class="mono" style="font-size:9.5px;color:var(--ink-3)">{label}</span>{strip}</div>'


def hours(on: set[int] | range, cls: str = "", plan: set[int] | range | None = None, gap: set[int] | None = None) -> str:
    plan = set(plan or []); on = set(on); gap = gap or set()
    cells = []
    for h in range(24):
        c = "on" if h in on else ("gap" if h in gap else ("pl" if h in plan else ""))
        cells.append(f'<i class="{c}"></i>')
    return f'<div class="nx-hrs {cls}">{"".join(cells)}</div>'


def spark(vals: list[float], neg: bool = False) -> str:
    lo, hi = min(vals), max(vals)
    pts = " ".join(f"{i * 76 / (len(vals) - 1):.1f},{22 - (v - lo) / ((hi - lo) or 1) * 18:.1f}" for i, v in enumerate(vals))
    return f'<svg viewBox="0 0 76 24" aria-hidden="true"><polyline class="{"n" if neg else ""}" points="{pts}"></polyline></svg>'


# --------------------------------------------------------------------------
# the shell
# --------------------------------------------------------------------------
AREAS = [
    ("overview", "Overview", [("attention", "Needs attention"), ("tasks", "What it can do")]),
    ("businesses", "Businesses", [("results", "Results"), ("products", "Products &amp; prices"), ("standards", "Standards"), ("milestones", "Milestones")]),
    ("supply", "Supply", [("changes", "Changes"), ("imports", "Imports"), ("deliveries", "Deliveries"), ("production", "Production"), ("flow", "Goods flow")]),
    ("staffing", "Staffing", [("schedules", "Schedules"), ("needs", "Staff needs"), ("payroll", "Payroll")]),
    ("expansion", "Expansion", [("demand", "Demand"), ("finder", "Find a location"), ("plan", "Plan a factory")]),
]

# where each area and view lands on the canvas (Play mode follows these links)
ROUTE = {
    "overview": "Main.dc.html", "overview/attention": "Main.dc.html", "overview/tasks": "OverviewFull.dc.html",
    "businesses": "Results.dc.html", "businesses/results": "Results.dc.html", "businesses/products": "Prices.dc.html",
    "businesses/standards": "Standards.dc.html", "businesses/milestones": "Milestones.dc.html",
    "supply": "Changes.dc.html", "supply/changes": "Changes.dc.html", "supply/imports": "Imports.dc.html",
    "supply/deliveries": "Deliveries.dc.html", "supply/production": "Production.dc.html", "supply/flow": "GoodsFlow.dc.html",
    "staffing": "Schedules.dc.html", "staffing/schedules": "Schedules.dc.html", "staffing/needs": "StaffNeeds.dc.html",
    "staffing/payroll": "Payroll.dc.html",
    "expansion": "Demand.dc.html", "expansion/demand": "Demand.dc.html", "expansion/finder": "Finder.dc.html",
    "expansion/plan": "PlanFactory.dc.html",
    "map": "CityMap.dc.html", "guide": "Guide.dc.html", "prefs": "Preferences.dc.html", "help": "Help.dc.html",
    "news": "Help.dc.html",
}

COUNTS = {"overview": ("4", "crit"), "supply": ("9", ""), "staffing": ("2", "")}
SUBCOUNTS = {"supply/changes": ("6 left", "w"), "supply/imports": ("2", "w"), "supply/deliveries": ("4", "w"),
             "supply/production": ("2", "w"), "staffing/needs": ("3", "w"), "overview/attention": ("17", "")}

SOURCES = {
    "live": ('live', "Game link · live", "Read 14 s ago · Link mod 0.2.1"),
    "file": ('file', "Save folder · following", "autosave 3 · saved 09:40 game time"),
    "one": ('file', "One file", "Marlow Trading 12.hsg · opened by hand"),
    "reading": ('read', "Reading…", "The save moved on · rebuilding"),
    "stale": ('stale', "Stale · last good board", "Could not read the new save 2 min ago"),
    "fail": ('fail', "Game link lost", "No answer from the game for 40 s"),
    "old": ('live', "Game link · reads only", "Big Copilot Link 0.1.4 · update to write"),
}


def sidebar(active: str, sub: str = "", source: str = "live", company: str = "Marlow Trading", save: str = "Year 2 · autosave 3",
            counts: dict | None = None, compact: bool = False) -> str:
    counts = COUNTS if counts is None else counts
    nav = []
    for key, label, subs in AREAS:
        n = counts.get(key)
        badge = f'<span class="n {n[1]}">{n[0]}</span>' if n else "<span></span>"
        on = key == active
        nav.append(f'<a class="m{" on" if on else ""}" href="{ROUTE[key]}"{" aria-current=page" if on else ""}>{ic(key)}<span>{label}</span>{badge}</a>')
        if on:
            items = []
            for sk, sl in subs:
                sc = SUBCOUNTS.get(f"{key}/{sk}")
                small = f'<small class="{sc[1]}">{sc[0]}</small>' if sc else ""
                items.append(f'<a class="{"on" if sk == sub else ""}" href="{ROUTE[key + "/" + sk]}">{sl}{small}</a>')
            nav.append(f'<div class="subs">{"".join(items)}</div>')
    st_cls, st_word, st_when = SOURCES[source]
    return f"""
<aside class="nx-side" aria-label="Big Copilot">
  <div class="nx-brand"><span class="wordmark" id="wm" title="{esc(company)}">{esc(company)}</span><span class="dot" id="dot" role="button" tabindex="0" aria-label="Brand dot: pays out coins"></span></div>
  <div style="display:flex;flex-direction:column;gap:10px">
    <button class="nx-co" type="button" aria-haspopup="listbox"><span class="t"><b>{esc(company)}</b><small>{esc(save)}</small></span>{ic("chevd")}</button>
    <div class="nx-src"><span class="st {st_cls}"><b></b>{st_word}</span><span class="when">{st_when}</span><button class="ibtn" type="button" aria-label="Update now">{ic("refresh")}</button></div>
  </div>
  <nav class="nx-nav" aria-label="Main">{"".join(nav)}
    <div class="lab">Reference</div>
    <div class="ref"><a class="m{" on" if active == "map" else ""}" href="{ROUTE["map"]}">{ic("map")}<span>City map</span><span></span></a>
    <a class="m{" on" if active == "guide" else ""}" href="{ROUTE["guide"]}">{ic("guide")}<span>Game guide</span><span></span></a></div>
  </nav>
  <div class="nx-util">
    <button class="nx-search" type="button">{ic("search")}Find a tool or answer<kbd>Ctrl K</kbd></button>
    <a href="{ROUTE["prefs"]}"{' style="color:var(--ink)"' if active == "prefs" else ""}>{ic("prefs")}Preferences</a>
    <a href="{ROUTE["news"]}">{ic("news")}What's new<span class="nd" aria-label="1 new"></span></a>
    <a href="{ROUTE["help"]}"{' style="color:var(--ink)"' if active == "help" else ""}>{ic("help")}Help &amp; feedback</a>
    <div class="nx-fine">Fan-made · not affiliated with Hovgaard Games</div>
  </div>
</aside>"""


def top(title: str, crumbs: list[tuple[str, str]] | None = None, clock: bool = True, orb: bool = True, extra: str = "") -> str:
    cr = ""
    if crumbs:
        parts = []
        for i, (lab, href) in enumerate(crumbs):
            parts.append(f'<a href="{href}">{lab}</a>' if href else f"<span>{lab}</span>")
        cr = f'<div class="nx-crumb">{ic("chev").join(parts)}</div>'
    ck = ('<div class="clock"><b>Day 83<i>·</i>Wed 09:40</b><small>YEAR 2 · 14 SITES · 96 STAFF'
          f'<span class="fv-diff">{ic("prefs")}Normal</span></small></div>') if clock else ""
    ob = '<div class="orb" aria-hidden="true"><u></u></div>' if orb else ""
    return f'<header class="nx-top">{f"<div class=nx-ttl>{cr}<h1>{title}</h1></div>" if cr else f"<h1>{title}</h1>"}{extra}{ck}{ob}</header>'


def app(active: str, sub: str, title: str, body: str, crumbs=None, source: str = "live", counts=None, top_extra: str = "") -> str:
    return (f'<div class="nx-app">{sidebar(active, sub, source, counts=counts)}'
            f'<main class="nx-main">{top(title, crumbs, extra=top_extra)}{body}</main></div>')


def from_strip(what: str, pos: str = "1 of 4 critical", nxt: bool = True, back: str = "Main.dc.html") -> str:
    n = (f'<a href="#">Next finding{ic("chev")}</a><span class="nx-prop">proposed</span>') if nxt else ""
    return (f'<div class="nx-from" role="region" aria-label="Arrived from Needs attention">'
            f'<a class="back" href="{back}#att">{ic("back")}Needs attention</a>'
            f'<span class="what">From Needs attention · <b>{what}</b></span>'
            f'<span class="pos">{pos}{n}</span></div>')


# --------------------------------------------------------------------------
# one interaction script for every artboard; each part is quiet where its
# elements are absent
# --------------------------------------------------------------------------
WIRE = r"""
    const root = document.querySelector('.board');
    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    const rm = () => root && root.classList.contains('rm');
    // a link to another artboard moves Play there; every other link stays put
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a) return;
      const h = a.getAttribute('href') || '#';
      if (h.charAt(0) === '#' || h === '') e.preventDefault();
    });

    // the sphere rolls out of the wordmark's dot onto the page head's rule
    const shelf = document.querySelector('.nc') ? null : ($('.nx-top') || $('.nx-mast') || $('.nx-ptop'));
    const dot = $('#dot');
    const orbs = [];
    const place = (o, k) => {
      if (!shelf) return;
      const clock = $('.clock', shelf);
      const sr = shelf.getBoundingClientRect();
      const right = clock ? clock.getBoundingClientRect().left - sr.left - 26 : sr.width - 90;
      const sizes = [64, 46, 34];
      const size = sizes[Math.min(k, 2)];
      let x = right - size;
      for (let j = 0; j < k; j++) x -= sizes[Math.min(j, 2)] + 10;
      o.style.width = o.style.height = size + 'px';
      o.style.left = x + 'px';
      o.style.bottom = '0px';
    };
    const enter = (o) => {
      if (!dot || rm()) { o.style.setProperty('--t', 'translate(0,0)'); o.style.transform = 'none'; return; }
      const d = dot.getBoundingClientRect(), r = o.getBoundingClientRect();
      const dx = d.left + d.width / 2 - (r.left + r.width / 2), dy = d.top + d.height / 2 - (r.top + r.height / 2);
      o.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + (d.width / r.width) + ')';
      dot.classList.remove('kick'); void dot.offsetWidth; dot.classList.add('kick');
      requestAnimationFrame(() => requestAnimationFrame(() => { o.classList.add('in'); o.style.transform = 'translate(0,0) rotate(0)'; }));
      setTimeout(() => o.classList.remove('in'), 1400);
    };
    const wireOrb = (o) => {
      o.addEventListener('click', () => {
        o.style.setProperty('--t', 'translate(0,0)');
        o.classList.remove('squish'); void o.offsetWidth; o.classList.add('squish');
        if (rm()) return;
        const r = o.getBoundingClientRect(), br = root.getBoundingClientRect(), i = document.createElement('i');
        i.className = 'nx-ring'; i.style.left = (r.left - br.left) + 'px'; i.style.top = (r.top - br.top) + 'px';
        i.style.width = r.width + 'px'; i.style.height = r.height + 'px'; root.appendChild(i); setTimeout(() => i.remove(), 900);
      });
    };
    const first = shelf ? $('.orb', shelf) : null;
    if (first) { place(first, 0); orbs.push(first); wireOrb(first); setTimeout(() => enter(first), 350); }
    const wm = $('#wm');
    if (wm && first) wm.addEventListener('click', () => {
      if (orbs.length < 3) { const o = first.cloneNode(true); shelf.appendChild(o); place(o, orbs.length); orbs.push(o); wireOrb(o); enter(o); }
      else { const meal = orbs.pop(); meal.style.transition = 'transform .5s ease-in'; meal.style.transform = 'translate(40px,0) scale(.1)';
        setTimeout(() => meal.remove(), 520); first.click(); }
    });
    root && root.addEventListener('mousemove', (e) => orbs.forEach(o => {
      const r = o.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1;
      o.style.setProperty('--hx', (34 + dx / d * 18) + '%'); o.style.setProperty('--hy', (30 + dy / d * 18) + '%');
    }));
    // the dot is a coin: click it and it pays out (reduced motion: one spin, no shower)
    if (dot) dot.addEventListener('click', () => {
      dot.classList.remove('spin'); void dot.offsetWidth; dot.classList.add('spin');
      if (rm()) return;
      const r = dot.getBoundingClientRect(), br = root.getBoundingClientRect();
      for (let k = 0; k < 14; k++) {
        const c = document.createElement('i'); c.className = 'coin';
        const a = Math.random() * Math.PI - Math.PI, dd = 50 + Math.random() * 110;
        c.style.left = (r.left - br.left) + 'px'; c.style.top = (r.top - br.top) + 'px';
        c.style.setProperty('--dx', Math.cos(a) * dd + 'px'); c.style.setProperty('--dy', (Math.abs(Math.sin(a)) * dd + 120) + 'px');
        c.style.animationDelay = (Math.random() * .12) + 's'; root.appendChild(c); setTimeout(() => c.remove(), 1400);
      }
    });

    // disclosures: a button names what it opens with aria-controls
    $$('[data-open]').forEach(b => b.addEventListener('click', () => {
      const t = $$('[data-pane="' + b.dataset.open + '"]');
      const open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      t.forEach(x => x.hidden = !open);
      const lab = b.querySelector('[data-when]');
      if (lab) lab.textContent = open ? lab.dataset.when : lab.dataset.was;
    }));
    // segmented switches: one on at a time, each may show its own pane
    $$('[data-seg]').forEach(g => $$('button,a', g).forEach(b => b.addEventListener('click', () => {
      $$('button,a', g).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      const key = g.dataset.seg;
      if (b.dataset.v) $$('[data-when-' + key + ']').forEach(p => p.hidden = p.getAttribute('data-when-' + key) !== b.dataset.v);
    })));
    // linked findings: hovering one lights the other; never merged into one cause
    $$('[data-link]').forEach(f => {
      const other = () => $('[data-id="' + f.dataset.link + '"]');
      f.addEventListener('mouseenter', () => { const o = other(); if (o) o.classList.add('lit'); });
      f.addEventListener('mouseleave', () => { const o = other(); if (o) o.classList.remove('lit'); });
    });
    // the change checklist: ticks are your own notes; the truck drives the road
    const ck = $('.nx-ck');
    const paint = () => {
      if (!ck) return;
      const all = $$('.nx-chg'), done = all.filter(r => r.classList.contains('done'));
      const p = all.length ? done.length / all.length * 100 : 0;
      ck.style.setProperty('--p', p + '%');
      const c = $('.cnt b', ck); if (c) c.textContent = done.length;
      const t = $('.truck', ck); if (t && !rm()) { t.classList.remove('go'); void t.offsetWidth; t.classList.add('go'); }
    };
    $$('.nx-chg .nx-tick').forEach(t => t.addEventListener('click', () => {
      if (t.classList.contains('link') || t.classList.contains('conf')) return;
      const row = t.closest('.nx-chg'); row.classList.toggle('done');
      t.setAttribute('aria-pressed', row.classList.contains('done') ? 'true' : 'false');
      const s = $('.nx-state', row);
      if (s) { const mine = row.classList.contains('done');
        s.className = 'nx-state ' + (mine ? 'mine' : 'sug');
        s.lastChild.textContent = mine ? 'Marked done by you' : 'Suggested'; }
      paint();
    }));
    paint();
"""

LOGIC = ("class Component extends DCLogic {\n"
         "  renderVals() { return { theme: (this.props.dark ?? __DARK__) ? 'dark' : 'light', motion: (this.props.reduced ?? __RM__) ? 'rm' : '' }; }\n"
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
<div class="board {{theme}} {{motion}}" style="width: __W__px; height: __H__px;">
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
<link rel="stylesheet" href="__FONTS__"><style>__CSS__ body{background:__BG__}</style></head>
<body><div class="board __THEME__" style="width: __W__px; min-height: __H__px;">
__BODY__
</div>
<script>window.addEventListener('load', function () {__WIRE__});</script></body></html>
"""


def page(title: str, body: str, w: int, h: int, dark: bool = True, reduced: bool = False, extra_css: str = "") -> str:
    props = {"dark": {"editor": "boolean", "default": dark, "section": "Theme"},
             "reduced": {"editor": "boolean", "default": reduced, "section": "Motion"},
             "$preview": {"width": w, "height": h}}
    logic = LOGIC.replace("__DARK__", "true" if dark else "false").replace("__RM__", "true" if reduced else "false")
    return (PAGE.replace("__TITLE__", esc(title)).replace("__FONTS__", FONTS.replace("&", "&amp;"))
            .replace("__CSS__", CSS + extra_css).replace("__W__", str(w)).replace("__H__", str(h))
            .replace("__BODY__", body)
            .replace("__PROPS__", json.dumps(props, separators=(",", ":"), ensure_ascii=False).replace("'", "&#39;"))
            .replace("__LOGIC__", logic))


def preview(title: str, body: str, w: int, h: int, dark: bool = True, reduced: bool = False, extra_css: str = "") -> str:
    theme = ("" if dark else "light") + (" rm" if reduced else "")
    return (PREVIEW.replace("__TITLE__", esc(title)).replace("__FONTS__", FONTS.replace("&", "&amp;"))
            .replace("__CSS__", CSS + extra_css).replace("__BG__", "#0d100f" if dark else "#eef0ea")
            .replace("__THEME__", theme).replace("__W__", str(w)).replace("__H__", str(h))
            .replace("__BODY__", body).replace("__WIRE__", WIRE))
