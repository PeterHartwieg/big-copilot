"""Round 2: the five representative screens after the design review of 26 Sep 2026.

Direction from the review: keep the structure (five destinations, Needs attention first,
named tasks, return context, the separate marks), but let the decision lead. One compact
summary per critical finding with one expanded; no permanent explanation rail; no design
commentary inside the product; numbers and small graphics carry the evidence; Archivo for
sentences, IBM Plex Mono only for figures and short labels. The shell is the refined
masthead with a persistent local row; a slim sidebar with the same content is drawn for
comparison.
"""
from __future__ import annotations

import random

from kit import ROUTE, btn, chip, cover, esc, gwbtn, hood, hours, ic, mw, state

R2 = {
    "overview": "R2Overview.dc.html", "imports": "R2Imports.dc.html", "changes": "R2Changes.dc.html",
    "business": "R2Business.dc.html", "phone": "R2Phone.dc.html", "phoneimports": "R2PhoneImports.dc.html",
    "phonewrite": "R2PhoneWrite.dc.html",
}

CSS = """
/* --- the refined masthead: five places, the references, source and clock ---- */
.r2-mast{position:relative;display:flex;align-items:center;gap:18px;height:76px;padding:0 40px;border-bottom:1px solid var(--rule);background:var(--ground)}
.r2-mast .nx-brand{padding:0;gap:3px}
.r2-mast .wordmark{font-size:23px;max-width:210px}
.r2-co{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:6px;border:0;background:none;color:var(--ink-3);cursor:pointer;margin-left:2px;padding:0}
.r2-co:hover{color:var(--ink);background:var(--surface)}
.r2-co .i{width:15px;height:15px}
.r2-nav{display:flex;gap:2px}
.r2-nav a{position:relative;display:flex;align-items:center;gap:7px;height:40px;padding:0 10px;border-radius:7px;color:var(--ink-2);font-size:14px;font-weight:500;transition:color .15s,background .15s}
.r2-nav a .i{width:18px;height:18px;transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.r2-nav a:hover{color:var(--ink);background:var(--surface)}
.r2-nav a:hover .i{transform:translateY(-2px) rotate(-6deg)}
.r2-nav a.on{color:var(--ink)}
.r2-nav a.on::after{content:"";position:absolute;left:12px;right:12px;bottom:-19px;height:2px;border-radius:2px;background:var(--accent)}
.r2-nav a .n{font:600 10.5px/1 "IBM Plex Mono",monospace;padding:3px 6px;border-radius:9px;background:var(--neg);color:#fff}
.r2-refs{display:flex;gap:0;padding-left:10px;border-left:1px solid var(--rule)}
.r2-refs a,.r2-refs button{display:flex;align-items:center;gap:6px;height:36px;padding:0 8px;border-radius:7px;color:var(--ink-3);font-size:13px;background:none;border:0;cursor:pointer}
.r2-refs a:hover,.r2-refs button:hover{color:var(--ink);background:var(--surface)}
.r2-refs .i{width:16px;height:16px}
.r2-mast .clock{margin-left:auto}
.r2-src{display:flex;align-items:center;gap:8px;font:500 11px/1 "IBM Plex Mono",monospace;color:var(--accent);letter-spacing:.06em;white-space:nowrap}
.r2-src b{width:7px;height:7px;border-radius:50%;background:currentColor}
.r2-src .ibtn{width:30px;height:30px}
.r2-local{display:flex;align-items:center;gap:4px;height:52px;padding:0 40px;border-bottom:1px solid var(--rule-soft)}
.r2-local a{display:flex;align-items:center;gap:7px;height:34px;padding:0 13px;border-radius:7px;color:var(--ink-2);font-size:13.5px;font-weight:500}
.r2-local a:hover{color:var(--ink);background:var(--surface)}
.r2-local a.on{background:var(--ink);color:var(--ground)}
.r2-local a small{font:600 10.5px/1 "IBM Plex Mono",monospace;color:var(--warn)}
.r2-local a.on small{color:var(--ground);opacity:.7}
.r2-local .area{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin-right:10px}
.r2-main{padding:0 40px 56px}

/* --- the slim sidebar, for the comparison only -------------------------------- */
.r2-app{display:grid;grid-template-columns:196px minmax(0,1fr);min-height:100%}
.r2-side{position:sticky;top:0;height:900px;display:flex;flex-direction:column;gap:4px;padding:22px 12px;border-right:1px solid var(--rule)}
.r2-side .nx-brand{padding:0 8px 18px}
.r2-side .wordmark{font-size:21px;max-width:150px}
.r2-side a{display:flex;align-items:center;gap:10px;height:38px;padding:0 10px;border-radius:8px;color:var(--ink-2);font-size:14px;font-weight:500}
.r2-side a .i{width:18px;height:18px}
.r2-side a.on{background:var(--surface);color:var(--ink);box-shadow:inset 3px 0 0 var(--accent)}
.r2-side a .n{margin-left:auto;font:600 10.5px/1 "IBM Plex Mono",monospace;padding:3px 6px;border-radius:9px;background:var(--neg);color:#fff}
.r2-side .ref{margin-top:14px;padding-top:12px;border-top:1px solid var(--rule-soft)}
.r2-side .ref a{height:34px;font-size:13px;color:var(--ink-3)}
.r2-side .foot{margin-top:auto;display:flex;flex-direction:column;gap:2px}
.r2-side .foot a{height:32px;font-size:12.5px;color:var(--ink-3)}
.r2-sidetop{position:relative;display:flex;align-items:center;gap:18px;height:76px;padding:0 40px;border-bottom:1px solid var(--rule)}
.r2-sidetop h1{font-size:22px;font-weight:700;letter-spacing:-.02em}

/* --- company numbers: weight without a tile wall -------------------------------- */
.r2-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:20px;border-bottom:1px solid var(--rule-soft)}
.r2-kpi{display:grid;grid-template-columns:minmax(0,1fr) 104px;grid-template-rows:auto auto;gap:4px 12px;padding:4px 22px 16px 0;margin-right:22px;border-right:1px solid var(--rule-soft);color:inherit}
.r2-kpi:last-child{border-right:0;margin-right:0}
.r2-kpi .lab{grid-column:1/3}
.r2-kpi .v{font:500 27px/1.05 "IBM Plex Mono",monospace;letter-spacing:-.02em;white-space:nowrap}
.r2-kpi .d{grid-column:1/3;display:flex;align-items:center;gap:8px;font:500 11.5px/1.3 "IBM Plex Mono",monospace;color:var(--ink-2)}
.r2-kpi svg{grid-row:2;grid-column:2;width:104px;height:32px;align-self:end}
.r2-kpi svg polyline{fill:none;stroke:var(--accent);stroke-width:1.6;stroke-linejoin:round}
.r2-kpi svg polygon{fill:var(--accent);opacity:.1}
.r2-kpi svg polyline.n{stroke:var(--neg)}
.r2-kpi svg polygon.n{fill:var(--neg)}
.r2-kpi:hover .v{color:var(--accent)}

/* --- Needs attention ------------------------------------------------------------ */
.r2-head{display:flex;align-items:center;flex-wrap:wrap;gap:10px 16px;margin-top:26px}
.r2-head h2{font-size:28px;font-weight:700;letter-spacing:-.03em;line-height:1}
.r2-head .aside{margin-left:auto;display:flex;align-items:center;gap:8px}
.r2-meta{display:flex;align-items:center;flex-wrap:wrap;gap:6px 18px;margin:10px 0 12px;font-size:13px;color:var(--ink-2)}
.r2-disc{display:inline-flex;align-items:center;gap:6px;border:0;background:none;padding:0;color:var(--ink-2);font:inherit;cursor:pointer}
.r2-disc:hover{color:var(--ink)}
.r2-disc .i{width:13px;height:13px}
.r2-disc b{color:var(--ink);font-weight:600}
.r2-disc .blue{color:var(--info);font-weight:600}
.r2-tools{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 13px;border-radius:17px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);font-size:13px;font-weight:600;cursor:pointer}
.r2-tools .i{width:14px;height:14px;transition:transform .2s}
.r2-tools:hover{border-color:var(--ink-3)}
.r2-tools:hover .i{transform:translateY(2px)}

.r2-q{border-top:1px solid var(--rule)}
.r2-band{display:flex;align-items:center;gap:10px;padding:14px 0 6px}
.r2-band .lab.crit{color:var(--neg)}.r2-band .lab.watch{color:var(--warn)}
.r2-f{display:grid;grid-template-columns:16px minmax(0,1fr) 320px 196px;gap:0 22px;align-items:center;min-height:84px;padding:12px 6px 12px 0;border-bottom:1px solid var(--rule-soft);position:relative;transition:background .15s}
.r2-f:hover{background:linear-gradient(90deg,transparent,var(--surface) 10%)}
.r2-f .mark{width:10px;height:10px;border-radius:50%;background:var(--neg);box-shadow:0 0 0 4px var(--neg-soft);justify-self:center;transition:transform .2s cubic-bezier(.34,1.56,.64,1)}
.r2-f:hover .mark{transform:scale(1.35)}
.r2-f .t{display:flex;flex-direction:column;gap:5px;min-width:0}
.r2-f .t h3{display:flex;align-items:baseline;gap:10px;font-size:17px;font-weight:600;letter-spacing:-.01em;line-height:1.25}
.r2-f .t h3 .hood{transform:translateY(-2px)}
.r2-f .t h3 .k{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);font-weight:500}
.r2-f .now{font-size:14px;color:var(--ink-2)}
.r2-f .now b{font-weight:600;color:var(--neg)}
.r2-f .now b.w{color:var(--warn)}
.r2-f .vz{display:flex;flex-direction:column;gap:4px}
.r2-f .ac{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.r2-f .ac .nx-btn{min-width:176px;justify-content:space-between}
.r2-f .ac small{font-size:12px;color:var(--ink-3);display:flex;align-items:center;gap:6px}
.r2-f.sel{background:color-mix(in srgb,var(--surface) 70%,transparent);border-bottom-color:transparent;border-radius:12px 12px 0 0}
.r2-x{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:0;margin:0 0 10px 38px;border:1px solid var(--rule-soft);border-top:0;border-radius:0 0 12px 12px;background:color-mix(in srgb,var(--surface) 70%,transparent)}
.r2-x > div{padding:14px 18px 16px;display:flex;flex-direction:column;gap:9px}
.r2-x > div + div{border-left:1px solid var(--rule-soft)}
.r2-x .lab{font-size:10px}
.r2-x p{font-size:13px;color:var(--ink-2);line-height:1.45}
.r2-x p b{color:var(--ink);font-weight:600}
.r2-cmp{display:grid;grid-template-columns:112px minmax(0,1fr) 62px;gap:6px 10px;align-items:center;font-size:12.5px;color:var(--ink-2)}
.r2-cmp .bar{height:9px;border-radius:2px;background:var(--rule-soft);position:relative}
.r2-cmp .bar i{position:absolute;left:0;top:0;bottom:0;border-radius:2px}
.r2-cmp .n{font:500 12.5px/1 "IBM Plex Mono",monospace;text-align:right;color:var(--ink)}
.r2-aff{display:flex;flex-direction:column;gap:6px}
.r2-aff span{display:flex;align-items:center;gap:8px;font-size:13px}
.r2-aff span .i{width:15px;height:15px;color:var(--ink-3)}
.r2-ways{display:flex;flex-direction:column;gap:8px}
.r2-ways > span{display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--ink-2);line-height:1.4}
.r2-ways > span .i{width:15px;height:15px;color:var(--ink-3);margin-top:1px}
.r2-ways > span b{color:var(--ink);font-weight:600}
.r2-ways a.rel{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--info);font-weight:500}
.r2-ways a.rel .i{width:15px;height:15px}

.r2-w{display:grid;grid-template-columns:16px 200px minmax(0,1fr) 120px 200px;gap:0 16px;align-items:center;min-height:50px;padding:6px 6px 6px 0;border-bottom:1px solid var(--rule-soft);color:inherit;transition:background .15s}
.r2-w:hover{background:linear-gradient(90deg,transparent,var(--surface) 10%)}
.r2-w .mark{width:8px;height:8px;border-radius:50%;justify-self:center;background:var(--warn)}
.r2-w.opp .mark{background:var(--accent)}
.r2-w .site{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-2);white-space:nowrap;overflow:hidden}
.r2-w b{font-size:14.5px;font-weight:600}
.r2-w .amt{font:500 13.5px/1 "IBM Plex Mono",monospace;text-align:right;white-space:nowrap}
.r2-w .amt small{font-size:11px;color:var(--ink-3);margin-left:4px}
.r2-w .to{display:flex;align-items:center;justify-content:flex-end;gap:7px;font-size:13px;font-weight:600;color:var(--accent);white-space:nowrap}
.r2-w .to .i{width:14px;height:14px;transition:transform .2s}
.r2-w:hover .to .i{transform:translateX(3px)}
.r2-w .to .gw-mw{color:var(--ink-3)}
.r2-more{display:flex;align-items:center;gap:16px;padding:14px 0 0;font-size:13px;color:var(--ink-2)}
.r2-more .sep{width:1px;height:16px;background:var(--rule)}

/* --- the four tool panels ------------------------------------------------------- */
.r2-toolshead{display:flex;align-items:baseline;gap:14px;margin-top:40px;margin-bottom:14px}
.r2-toolshead h2{font-size:20px;font-weight:700;letter-spacing:-.02em}
.r2-tp{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.r2-p{position:relative;display:flex;flex-direction:column;border-radius:14px;background:var(--surface);border:1px solid var(--rule-soft);padding:16px 16px 8px;overflow:hidden;transition:border-color .2s}
.r2-p:hover{border-color:var(--rule)}
.r2-p .r2-ph{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;min-height:62px}
.r2-p .r2-ph b{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:600}
.r2-p .r2-ph b .i{color:var(--accent);width:18px;height:18px}
.r2-p .r2-ph svg.ill{width:118px;height:56px;flex:none;transition:transform .35s cubic-bezier(.34,1.56,.64,1)}
.r2-p:hover .ph svg.ill{transform:translateY(-2px) scale(1.04)}
.r2-p a.t{display:flex;align-items:center;gap:10px;min-height:40px;border-top:1px solid var(--rule-soft);font-size:14px;font-weight:600;color:var(--ink)}
.r2-p a.t .c{margin-left:auto;font:600 11px/1 "IBM Plex Mono",monospace;padding:3px 7px;border-radius:9px;background:var(--warn-soft);color:var(--warn)}
.r2-p a.t .c.b{background:var(--neg-soft);color:var(--neg)}
.r2-p a.t > .i{width:14px;height:14px;color:var(--ink-3);transition:transform .2s,color .15s}
.r2-p a.t .c + .i{margin-left:0}
.r2-p a.t:not(:has(.c)) > .i{margin-left:auto}
.r2-p a.t:hover > .i{color:var(--accent);transform:translateX(3px)}
.ill .ln{fill:none;stroke:var(--ink-3);stroke-width:2;stroke-linecap:round}
.ill .ln.wk{stroke-dasharray:4 4}
.ill .ln.lit{stroke:var(--accent)}
.ill .nd{fill:var(--ground);stroke:var(--rule);stroke-width:1.5}
.ill .nd.a{stroke:var(--accent)}
.ill .cell{fill:var(--accent);opacity:.75}
.ill .cell.o{fill:var(--rule)}
.ill .gap{fill:none;stroke:var(--neg);stroke-width:1.3}
.ill .bar{fill:var(--accent);opacity:.8}
.ill .bar.n{fill:var(--neg)}
.ill .dotw{fill:var(--warn)}.ill .dotg{fill:var(--accent)}
.ill .wall{fill:none;stroke:var(--ink-2);stroke-width:2}
.ill .flr{fill:color-mix(in srgb,var(--accent) 12%,transparent)}
.ill .pin{fill:var(--accent)}

/* --- sticky condensed attention bar (long queue, scrolled) ----------------------- */
.r2-sticky{position:sticky;top:0;z-index:4;display:flex;align-items:center;gap:14px;height:54px;padding:0 40px;margin:0 -40px;background:color-mix(in srgb,var(--ground) 94%,transparent);backdrop-filter:blur(6px);border-bottom:1px solid var(--rule)}
.r2-sticky b{font-size:16px;font-weight:700}

/* --- the supply decision surface ------------------------------------------------- */
.r2-from{display:flex;align-items:center;gap:12px;margin-top:16px;font-size:13px;color:var(--ink-2)}
.r2-from a.back{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px 0 9px;border-radius:15px;background:var(--accent-soft);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);color:var(--ink);font-weight:600;font-size:12.5px}
.r2-from a.back .i{width:14px;height:14px;color:var(--accent)}
.r2-from b{color:var(--ink);font-weight:600}
.r2-scope{display:flex;align-items:center;flex-wrap:wrap;gap:10px 14px;margin-top:16px}
.r2-scope .nx-basis{margin:0;padding:6px 8px 6px 12px;border-radius:10px;grid-template-columns:auto auto auto}
.r2-dec{margin-top:18px;border-radius:16px;background:var(--surface);border:1px solid var(--rule-soft);overflow:hidden}
.r2-dh{display:flex;align-items:center;flex-wrap:wrap;gap:10px 14px;padding:18px 22px 0}
.r2-dh h2{font-size:22px;font-weight:700;letter-spacing:-.02em}
.r2-dh .how{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--ink-2)}
.r2-dh .how .i{width:16px;height:16px;color:var(--ink-3)}
.r2-db{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:0}
.r2-db > div{padding:18px 22px 20px}
.r2-db > div + div{border-left:1px solid var(--rule-soft)}
.r2-big{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 14px;margin-top:10px}
.r2-big .was{font:500 26px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.r2-big .arr{font-size:22px;color:var(--ink-3)}
.r2-big .to{display:inline-flex;align-items:baseline;gap:8px;padding:6px 12px;border-radius:10px;border:1.5px solid var(--accent);background:var(--ground)}
.r2-big .to input{width:150px;border:0;background:none;color:var(--ink);font:600 40px/1 "IBM Plex Mono",monospace;letter-spacing:-.02em;padding:0;text-align:right;outline:none}
.r2-big .u{font-size:14px;color:var(--ink-2)}
.r2-basis{display:inline-flex;align-items:center;gap:6px;margin-top:10px;font-size:13px;color:var(--ink-2)}
.r2-basis b{color:var(--ink);font-weight:600}
.r2-scale{position:relative;margin-top:30px;height:14px;border-radius:3px;background:var(--rule-soft)}
.r2-scale i{position:absolute;top:0;bottom:0;border-radius:3px}
.r2-scale .m{position:absolute;top:-6px;bottom:-6px;width:2px;background:var(--ink)}
.r2-scale .m span{position:absolute;bottom:22px;left:50%;transform:translateX(-50%);white-space:nowrap;font:500 10.5px/1.2 "IBM Plex Mono",monospace;color:var(--ink-2);text-align:center}
.r2-scale .m.low span{bottom:auto;top:22px}
.r2-scale .m.cap{background:var(--ink-3)}
.r2-railbig .nx-cov .d{height:28px;border-radius:4px}
.r2-railbig .nx-cov .d .trk{top:-22px}
.r2-railbig .nx-cov .d .trk .i{width:18px;height:18px}
.r2-railbig .nx-cov .ax{font-size:11px;margin-top:4px}
.r2-railbig .nx-cov .days{gap:4px}
.r2-rn{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-top:14px;font-size:13px;color:var(--ink-2)}
.r2-rn b{font:600 15px/1 "IBM Plex Mono",monospace;color:var(--neg)}
.r2-rn b.ok{color:var(--ink)}
.r2-act{display:flex;align-items:center;flex-wrap:wrap;gap:10px 12px;padding:14px 22px;border-top:1px solid var(--rule-soft);background:color-mix(in srgb,var(--ground) 45%,transparent)}
.r2-act .gw-btn{height:40px;font-size:13.5px;padding:0 16px 0 13px}
.r2-act .nx-btn{height:40px}
.r2-act .sep{flex:1}
.r2-act .note{font-size:12.5px;color:var(--ink-3)}
.r2-open{padding:14px 22px 16px;border-top:1px solid var(--rule-soft);display:grid;grid-template-columns:1fr 1fr;gap:24px}
.r2-calc{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 18px;font-size:13px;color:var(--ink-2)}
.r2-calc b{font:500 13px/1.3 "IBM Plex Mono",monospace;color:var(--ink);text-align:right}
.r2-calc .tot{border-top:1px solid var(--rule);padding-top:6px}
.r2-steps2{display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--ink-2)}
.r2-steps2 span{display:flex;gap:10px}
.r2-steps2 span i{font:600 11px/18px "IBM Plex Mono",monospace;font-style:normal;width:18px;height:18px;border-radius:50%;background:var(--raised);text-align:center;color:var(--ink-2);flex:none}
.r2-steps2 b{color:var(--ink);font-weight:600}
.r2-once{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:center;margin-top:12px;padding:14px 18px;border-radius:14px;border:1px dashed var(--rule)}
.r2-once .k{font:500 10.5px/1.2 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}
.r2-once .v{font:600 20px/1 "IBM Plex Mono",monospace}
.r2-once p{font-size:13px;color:var(--ink-2)}
.r2-lines{margin-top:22px}
.r2-li{display:grid;grid-template-columns:22px 200px 170px minmax(0,1fr) 200px;gap:14px;align-items:center;min-height:52px;border-bottom:1px solid var(--rule-soft);font-size:13.5px}
.r2-li .i{color:var(--ink-3)}
.r2-li .n{font:500 13.5px/1.2 "IBM Plex Mono",monospace}
.r2-li .n s{color:var(--ink-3);margin-right:6px}
.r2-li .n em{font-style:normal;color:var(--accent)}
.r2-li .n small{font-size:11px;color:var(--ink-3);margin-left:4px}
.r2-li .src{font-size:12.5px;color:var(--ink-3)}

/* --- Changes ------------------------------------------------------------------ */
.r2-ck{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:22px;align-items:center;margin-top:20px;padding:18px 22px;border-radius:16px;background:var(--surface);border:1px solid var(--rule-soft)}
.r2-ck .cnt{display:flex;flex-direction:column;gap:3px}
.r2-ck .cnt b{font:600 28px/1 "IBM Plex Mono",monospace}
.r2-ck .cnt b small{font-size:15px;color:var(--ink-3);font-weight:500}
.r2-ck .cnt span{font-size:12.5px;color:var(--ink-2)}
.r2-ck .road{position:relative;height:34px}
.r2-ck .road::before{content:"";position:absolute;left:0;right:0;top:24px;border-top:2px dashed var(--rule)}
.r2-ck .road .done{position:absolute;left:0;top:23px;height:4px;border-radius:2px;background:var(--accent);width:var(--p,0%);transition:width .8s cubic-bezier(.2,.7,.2,1)}
.r2-ck .road .truck{position:absolute;top:0;left:var(--p,0%);transform:translateX(-50%);color:var(--ink);transition:left .8s cubic-bezier(.2,.7,.2,1)}
.r2-ck .road .truck .i{width:26px;height:26px}
.r2-ck .road .flag{position:absolute;right:-4px;top:8px;color:var(--ink-3)}
.r2-ck .road .flag .i{width:18px;height:18px}
.r2-ck .acts{display:flex;align-items:center;gap:8px}
.r2-ckbar{display:flex;align-items:center;gap:16px;margin-top:12px;font-size:13px;color:var(--ink-2)}
.r2-cg{display:flex;align-items:center;gap:10px;margin-top:22px;padding-bottom:8px;border-bottom:1px solid var(--rule)}
.r2-cg b{font-size:15px;font-weight:600}
.r2-cg .i{color:var(--ink-3)}
.r2-cg a{margin-left:auto;font-size:12.5px;color:var(--ink-2)}
.r2-c{display:grid;grid-template-columns:24px minmax(0,1fr) 250px 170px 190px;gap:14px;align-items:center;min-height:58px;border-bottom:1px solid var(--rule-soft)}
.r2-c .w{display:flex;align-items:center;gap:8px;min-width:0}
.r2-c .w b{font-size:14.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.r2-c .w span{font-size:13px;color:var(--ink-2);white-space:nowrap}
.r2-c .v{font:500 15px/1 "IBM Plex Mono",monospace;white-space:nowrap}
.r2-c .v s{color:var(--ink-3);margin-right:8px;text-decoration-thickness:1px}
.r2-c .v em{font-style:normal;color:var(--accent);font-weight:600}
.r2-c .v small{font-size:11.5px;color:var(--ink-3);margin-left:6px;font-weight:400}
.r2-c .where{font-size:12.5px;color:var(--ink-3);display:flex;align-items:center;gap:6px}
.r2-c .where .gw-mw{color:var(--ink-3)}
.r2-c .st{display:flex;justify-content:flex-end}
.r2-c.done .w b{color:var(--ink-2)}
.r2-c.done .v em{color:var(--ink-2)}
.r2-copyp{margin-top:12px}

/* --- the business page, with its small data graphics back ------------------------- */
.r2-bh{display:flex;align-items:center;gap:16px;margin-top:22px}
.r2-bh .av{width:52px;height:52px;border-radius:50%;background:var(--accent);color:var(--on-accent);display:grid;place-items:center;font:700 14px "IBM Plex Mono",monospace;flex:none}
.r2-bh h1{font-size:28px;font-weight:700;letter-spacing:-.025em}
.r2-bh .meta{font-size:13px;color:var(--ink-2);margin-top:3px}
.r2-bh .acts{margin-left:auto;display:flex;gap:8px}
.r2-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:20px}
.r2-tile{padding:14px 16px 14px;border-radius:12px;background:var(--surface);border:1px solid var(--rule-soft);display:flex;flex-direction:column;gap:6px}
.r2-tile .v{font:500 26px/1.05 "IBM Plex Mono",monospace;letter-spacing:-.02em}
.r2-tile .d{display:flex;align-items:center;gap:8px;font:500 11.5px/1.3 "IBM Plex Mono",monospace;color:var(--ink-2)}
.r2-mb{display:flex;align-items:flex-end;gap:3px;height:34px;margin-top:4px}
.r2-mb i{flex:1;border-radius:2px 2px 0 0;background:color-mix(in srgb,var(--ink) 18%,transparent)}
.r2-mb i.hi{background:var(--accent)}
.r2-seg{display:flex;height:10px;border-radius:3px;overflow:hidden;margin-top:12px;gap:2px}
.r2-seg i{display:block}
.r2-segl{display:flex;gap:10px;flex-wrap:wrap;font:500 10.5px/1.3 "IBM Plex Mono",monospace;color:var(--ink-3);margin-top:6px}
.r2-segl span{display:inline-flex;align-items:center;gap:5px}
.r2-segl span i{width:8px;height:8px;border-radius:2px;display:inline-block}
.r2-capb{display:grid;grid-template-columns:repeat(14,minmax(0,1fr));gap:2px;height:34px;align-items:end;margin-top:4px}
.r2-capb i{border-radius:2px 2px 0 0;background:var(--accent);opacity:.7}
.r2-capb i.top{opacity:1;box-shadow:inset 0 2px 0 var(--ink)}
.r2-g2{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:16px;margin-top:16px}
.r2-card{border-radius:14px;background:var(--surface);border:1px solid var(--rule-soft);padding:16px 18px}
.r2-card h3{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600;margin-bottom:12px}
.r2-card h3 .i{color:var(--ink-3)}
.r2-card h3 .aside{margin-left:auto;font-size:12.5px;font-weight:400;color:var(--ink-2)}
.r2-sat{display:grid;grid-template-columns:auto auto minmax(0,1fr);gap:22px;align-items:end}
.r2-sat .big{font:500 46px/1 "IBM Plex Mono",monospace;letter-spacing:-.03em}
.r2-sat .big small{font-size:16px;color:var(--ink-3)}
.r2-eq{position:relative;display:flex;align-items:flex-end;gap:8px;height:70px;padding-top:4px}
.r2-eq i{width:14px;border-radius:3px 3px 0 0}
.r2-eq .ln{position:absolute;left:-4px;right:-4px;bottom:56px;border-top:1px dashed var(--ink-3)}
.r2-eq .ln::after{content:"80";position:absolute;right:-18px;top:-7px;font:500 9.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.r2-lamps{display:flex;flex-wrap:wrap;gap:8px}
.r2-lamp{display:flex;flex-direction:column;align-items:center;gap:5px;width:58px}
.r2-lamp span{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;border:1.5px solid var(--rule)}
.r2-lamp span .i{width:18px;height:18px}
.r2-lamp.lit span{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 50%,transparent);color:var(--accent)}
.r2-lamp.miss span{background:var(--neg-soft);border-color:color-mix(in srgb,var(--neg) 60%,transparent);color:var(--neg)}
.r2-lamp small{font-size:10.5px;color:var(--ink-3);text-align:center;line-height:1.2}
.r2-promo{display:flex;height:16px;border-radius:4px;overflow:hidden;gap:2px;margin-top:10px}
.r2-heat{display:grid;grid-template-columns:34px repeat(24,minmax(0,1fr));gap:2px}
.r2-heat span{font:500 10px/15px "IBM Plex Mono",monospace;color:var(--ink-3)}
.r2-heat i{height:15px;border-radius:2px}
.r2-heat i.hr{box-shadow:inset 0 0 0 1.5px var(--neg)}
.r2-heat .ax{grid-column:2/-1;display:grid;grid-template-columns:repeat(24,minmax(0,1fr));font:500 9.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3);margin-top:4px}
.r2-people{display:flex;flex-wrap:wrap;gap:8px}
.r2-person{display:flex;align-items:center;gap:8px;height:34px;padding:0 12px 0 5px;border-radius:17px;background:var(--raised);font-size:13px}
.r2-person .hood{height:24px;min-width:24px;border-radius:12px}
.r2-person small{font-size:11.5px;color:var(--ink-3)}
.r2-pr{display:grid;grid-template-columns:minmax(0,1fr) 80px 90px 120px;gap:10px;align-items:center;min-height:44px;border-bottom:1px solid var(--rule-soft);font-size:13.5px}
.r2-pr .n{font:500 13px/1 "IBM Plex Mono",monospace;text-align:right}
.r2-pr .mini{height:6px;border-radius:3px;background:var(--rule-soft);position:relative}
.r2-pr .mini i{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:var(--accent)}
.r2-pr .mini u{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--ink-2)}

/* --- phone, round 2 ------------------------------------------------------------ */
.p2{position:relative;height:100%;display:flex;flex-direction:column}
.p2-top{position:relative;display:flex;align-items:center;gap:10px;height:56px;padding:0 16px;border-bottom:1px solid var(--rule)}
.p2-top .wordmark{font-size:21px;max-width:190px}
.p2-top .src{margin-left:auto;display:flex;align-items:center;gap:6px;font:500 10.5px/1 "IBM Plex Mono",monospace;color:var(--accent)}
.p2-top .src b{width:7px;height:7px;border-radius:50%;background:currentColor}
.p2-top .ibtn{width:40px;height:40px;border-radius:10px}
.p2-b{padding:0 16px 96px}
.p2-ctx{display:flex;align-items:center;gap:14px;height:46px;border-bottom:1px solid var(--rule-soft);font:500 12.5px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.p2-ctx b{color:var(--ink);font-weight:500}
.p2-ctx a{margin-left:auto;display:inline-grid;place-items:center;width:32px;height:32px;color:var(--ink-3)}
.p2-h{display:flex;align-items:center;gap:10px;margin:18px 0 8px}
.p2-h h2{font-size:24px;font-weight:700;letter-spacing:-.03em}
.p2-h .r2-tools{margin-left:auto;height:36px}
.p2-sev{display:flex;gap:4px;margin-bottom:6px}
.p2-sev .sev{min-height:36px;padding:0 9px}
.p2-f{display:flex;flex-direction:column;gap:6px;padding:14px 0;border-bottom:1px solid var(--rule-soft)}
.p2-f .l1{display:flex;align-items:center;gap:8px}
.p2-f .l1 .mk{width:9px;height:9px;border-radius:50%;background:var(--neg);box-shadow:0 0 0 3px var(--neg-soft);flex:none}
.p2-f .l1 b{font-size:16px;font-weight:600;line-height:1.25}
.p2-f .now{font-size:13.5px;color:var(--ink-2);padding-left:17px}
.p2-f .now b{color:var(--neg);font-weight:600}
.p2-f .go{display:flex;align-items:center;justify-content:space-between;height:44px;padding:0 14px;margin-left:17px;border-radius:10px;border:1px solid var(--rule);font-size:14px;font-weight:600;color:var(--ink)}
.p2-f .go .i{width:16px;height:16px;color:var(--accent)}
.p2-f.sel{background:var(--surface);margin:8px -10px 0;padding:14px 10px;border-radius:14px;border:1px solid var(--rule-soft)}
.p2-f.sel .go{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.p2-f.sel .go .i{color:var(--on-accent)}
.p2-f .vz{padding-left:17px;margin-top:4px}
.p2-f .vz .nx-cov .d{height:16px}
.p2-f .ev{padding-left:17px;font-size:13px;color:var(--ink-2)}
.p2-f .ev b{font-family:"IBM Plex Mono",monospace;font-weight:500;color:var(--ink)}
.p2-w{display:grid;grid-template-columns:10px minmax(0,1fr) 16px;gap:4px 10px;align-items:center;min-height:56px;padding:8px 0;border-bottom:1px solid var(--rule-soft)}
.p2-w .mk{width:7px;height:7px;border-radius:50%;background:var(--warn)}
.p2-w b{font-size:14px;font-weight:600;display:block}
.p2-w small{font-size:12.5px;color:var(--ink-3)}
.p2-w > .i{width:15px;height:15px;color:var(--ink-3)}
.p2-tp{display:grid;grid-template-columns:1fr;gap:12px;margin-top:12px}
.p2-tp .r2-p{padding:14px 14px 6px}
.p2-tp .r2-p .r2-ph{min-height:48px}
.p2-tp .r2-p .r2-ph svg.ill{width:96px;height:46px}
.p2-tp .r2-p a.t{min-height:46px}
.p2-views{position:relative;margin-top:12px}
.p2-views .row{display:flex;gap:6px;overflow:hidden;padding-right:40px}
.p2-views .row a{flex:none;display:flex;align-items:center;height:40px;padding:0 14px;border-radius:20px;border:1px solid var(--rule);font-size:13.5px;font-weight:500;color:var(--ink-2);white-space:nowrap}
.p2-views .row a.on{background:var(--ink);color:var(--ground);border-color:var(--ink)}
.p2-views .fade{position:absolute;right:0;top:0;bottom:0;width:70px;background:linear-gradient(90deg,transparent,var(--ground) 55%);display:flex;align-items:center;justify-content:flex-end}
.p2-views .fade button{width:36px;height:36px;border-radius:18px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);display:grid;place-items:center;padding:0}
.p2-views .fade .i{width:15px;height:15px}
.p2-dec{margin-top:14px;border-radius:16px;background:var(--surface);border:1px solid var(--rule-soft);overflow:hidden}
.p2-dec .hd{padding:14px 14px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.p2-dec .hd h2{font-size:18px;font-weight:700}
.p2-dec .sec{padding:12px 14px}
.p2-dec .r2-big .was{font-size:18px}
.p2-dec .r2-big .to input{width:112px;font-size:30px}
.p2-dec .r2-big{margin-top:6px}
.p2-acts{display:flex;flex-direction:column;gap:8px;padding:12px 14px 14px;border-top:1px solid var(--rule-soft)}
.p2-acts .gw-btn,.p2-acts .nx-btn{height:46px;justify-content:center;font-size:14px}
.p2-acts .row{display:flex;gap:8px}
.p2-acts .row .nx-btn{flex:1}
.p2-sheet{position:absolute;left:0;right:0;bottom:0;z-index:21;background:var(--surface);border-radius:18px 18px 0 0;border:1px solid var(--rule);border-bottom:0;box-shadow:0 -20px 50px -24px #000c;padding-bottom:16px}
.p2-sheet .grab{width:38px;height:4px;border-radius:2px;background:var(--rule);margin:8px auto 4px}
.p2-sheet .gw-dlg{width:100%;border:0;box-shadow:none;border-radius:0;background:transparent}
.p2-sheet .gw-foot{flex-wrap:wrap}
.p2-sheet .gw-b{flex:1;justify-content:center;height:46px}
.p2-sheet .gw-hint{flex-basis:100%}

/* --- before / after sheets (annotation, not product UI) ------------------------ */
.ba{padding:40px 48px}
.ba h1{font-size:30px;font-weight:800;letter-spacing:-.03em}
.ba .sub{font-size:14px;color:var(--ink-2);margin-top:6px}
.ba-pair{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:22px}
.ba-pair figure{margin:0;display:flex;flex-direction:column;gap:8px}
.ba-pair figcaption{display:flex;align-items:center;gap:10px;font:600 11px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.ba-pair figcaption b{color:var(--ink);font-family:Archivo,sans-serif;letter-spacing:0;text-transform:none;font-size:14px}
.ba-pair img{width:100%;height:auto;border-radius:10px;border:1px solid var(--rule);display:block}
.ba-notes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:22px}
.ba-notes div{border-top:2px solid var(--rule);padding-top:10px}
.ba-notes h3{font-size:14px;font-weight:600;margin-bottom:6px}
.ba-notes ul{margin:0;padding-left:16px;font-size:13px;color:var(--ink-2);line-height:1.5}
.ba-notes .rm{border-color:var(--neg)}.ba-notes .vs{border-color:var(--accent)}.ba-notes .df{border-color:var(--info)}
.ba-count{display:inline-flex;align-items:center;gap:8px;margin-left:12px;font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink-2);padding:5px 9px;border-radius:6px;background:var(--surface);border:1px solid var(--rule-soft)}
.ba-phones{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-top:22px}
"""


# --------------------------------------------------------------------------
# shells
# --------------------------------------------------------------------------
MAIN5 = [("overview", "Overview"), ("businesses", "Businesses"), ("supply", "Supply"), ("staffing", "Staffing"), ("expansion", "Expansion")]
LOCAL = {
    "supply": [("changes", "Changes", "6"), ("imports", "Imports", "2"), ("deliveries", "Deliveries", "4"), ("production", "Production", "2"), ("flow", "Goods flow", "")],
    "businesses": [("results", "Results", ""), ("products", "Products &amp; prices", ""), ("standards", "Standards", ""), ("milestones", "Milestones", "")],
}
R2ROUTE = dict(ROUTE)
R2ROUTE.update({"overview": R2["overview"], "supply/imports": R2["imports"], "supply/changes": R2["changes"], "supply": R2["changes"]})


def mast(active: str, company: str = "Marlow Trading") -> str:
    nav = "".join(f'<a class="{"on" if k == active else ""}" href="{R2ROUTE[k]}"{" aria-current=page" if k == active else ""}>{ic(k)}{l}{"<span class=n>4</span>" if k == "overview" else ""}</a>' for k, l in MAIN5)
    return f"""
<header class="r2-mast nx-mast">
  <div class="nx-brand"><span class="wordmark" id="wm" title="{esc(company)}">{esc(company)}</span><span class="dot" id="dot" role="button" tabindex="0" aria-label="Brand dot: pays out coins"></span>
    <button class="r2-co" type="button" aria-label="Switch company or save">{ic("chevd")}</button></div>
  <nav class="r2-nav" aria-label="Main">{nav}</nav>
  <div class="r2-refs"><a href="{R2ROUTE["map"]}">{ic("map")}City map</a><a href="{R2ROUTE["guide"]}">{ic("guide")}Game guide</a><button type="button" aria-label="Search, preferences, help">{ic("more")}</button></div>
  <div class="clock"><b>Day 83<i>·</i>Wed 09:40</b><small><span class="r2-src"><b></b>LIVE · 14 S</span><button class="ibtn" type="button" aria-label="Update now" style="width:24px;height:24px">{ic("refresh", style="width:13px;height:13px")}</button></small></div>
  <div class="orb" aria-hidden="true"><u></u></div>
</header>"""


def local(area: str, on: str) -> str:
    items = "".join(f'<a class="{"on" if k == on else ""}" href="{R2ROUTE.get(area + "/" + k, "#")}">{l}{f"<small>{c}</small>" if c else ""}</a>' for k, l, c in LOCAL[area])
    name = dict(MAIN5)[area]
    return f'<nav class="r2-local" aria-label="{name} views"><span class="area">{name}</span>{items}</nav>'


def shell(active: str, body: str, area_local: str = "") -> str:
    return f'{mast(active)}{area_local}<main class="r2-main">{body}</main>'


# --------------------------------------------------------------------------
# Overview
# --------------------------------------------------------------------------
def area(vals, w=104, h=32):
    lo, hi = min(vals), max(vals)
    pts = [(i * w / (len(vals) - 1), h - 3 - (v - lo) / ((hi - lo) or 1) * (h - 8)) for i, v in enumerate(vals)]
    line = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    return line, f"0,{h} " + line + f" {w},{h}"


def kpis() -> str:
    data = [("Profit yesterday", "-$1,240", chip("bad", "▼ 154%") + "vs 7-day avg", [4, 5, 3, 6, 5, 7, 6, 5, 8, 7, 6, 1], True),
            ("Revenue yesterday", "$38,920", chip("dim", "4,812") + "customers", [5, 6, 5, 7, 6, 8, 7, 7, 9, 8, 8, 7], False),
            ("Cash on hand", "$212,400", chip("ok", "▲ $9,800") + "this week", [3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9], False),
            ("Net worth", "$1.84M", chip("dim", "day 76") + "$120k owed", [5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 8], False)]
    cells = ""
    for lab, v, d, s, n in data:
        line, poly = area(s)
        cells += (f'<a class="r2-kpi" href="{R2ROUTE["businesses/results"]}"><span class="lab">{lab}</span><span class="v{" neg" if n else ""}">{v}</span>'
                  f'<svg viewBox="0 0 104 32" aria-hidden="true"><polygon class="{"n" if n else ""}" points="{poly}"></polygon><polyline class="{"n" if n else ""}" points="{line}"></polyline></svg>'
                  f'<span class="d">{d}</span></a>')
    return f'<div class="r2-kpis">{cells}</div>'


def head(sticky: bool = False) -> str:
    sev = ('<button class="sev crit" type="button" aria-pressed="true"><i></i>4<span>critical</span></button>'
           '<button class="sev watch" type="button" aria-pressed="true"><i></i>11<span>warnings</span></button>'
           '<button class="sev opp" type="button" aria-pressed="true"><i></i>2<span>opportunities</span></button>')
    tools = f'<a class="r2-tools" href="#tools">{ic("chevd")}All tools</a>'
    if sticky:
        return (f'<div class="r2-sticky"><b>Needs attention</b>{sev}<span class="quiet">showing all 17</span>'
                f'<span style="margin-left:auto;display:flex;gap:8px"><a class="nx-btn sm ghost" href="{R2ROUTE["overview"]}">{ic("chevu")}Back to top</a>{tools}</span></div>')
    return f"""
<div class="r2-head" id="att"><h2>Needs attention</h2>{sev}
  <div class="aside"><a class="nx-btn sm ghost" href="Customize.dc.html">{ic("prefs")}Customize checks</a>{tools}</div></div>
<div class="r2-meta">
  <button class="r2-disc" type="button" aria-expanded="false">{ic("tick")}Checked <b>14 businesses</b> at day 83, 09:40{ic("chevd")}</button>
  <button class="r2-disc" type="button" aria-expanded="false">{ic("link")}Your changes: <span class="blue">1 applied, awaiting refresh</span>{ic("chevd")}</button>
</div>"""


def f_import(sel: bool) -> str:
    row = f"""
<article class="r2-f{" sel" if sel else ""}" data-id="imp" data-link="feed">
  <span class="mark" aria-label="Critical"></span>
  <div class="t"><h3>{hood("IC")}Water · Bridge Hub<span class="k">Import shortfall</span></h3>
    <p class="now"><b>Runs out Sat ~14:00</b>, 2 days before Monday's delivery</p></div>
  <div class="vz">{cover(["", "", "", "half", "dry", "", ""], ["WED", "THU", "FRI", "SAT", "SUN", "MON", "TUE"], truck=5)}</div>
  <div class="ac">{btn("Review import", "go", R2ROUTE["supply/imports"], icon_end="go")}{"" if sel else f'<small>{mw()}game link can apply</small>'}</div>
</article>"""
    if not sel:
        return row
    return row + f"""
<div class="r2-x" role="region" aria-label="Water at Bridge Hub, details">
  <div><span class="lab">Weekly amount · units a week</span>
    <div class="r2-cmp">
      <span>Order now</span><span class="bar"><i style="width:44.8%;background:var(--ink-3)"></i></span><span class="n">8,400</span>
      <span>Current draw</span><span class="bar"><i style="width:65%;background:var(--warn)"></i></span><span class="n">12,180</span>
      <span>Full production</span><span class="bar"><i style="width:100%;background:var(--accent)"></i></span><span class="n">18,740</span>
    </div>
    <p>Today's draw already outruns the order. The plan for full production raises it to <b>18,740</b>.</p></div>
  <div><span class="lab">Goes without</span>
    <div class="r2-aff"><span>{ic("factory")}Canal Brewery, Beer line</span><span>{ic("shop")}Marlow Market {hood("MT")} and {hood("HK")}</span></div></div>
  <div><span class="lab">Ways to fix</span>
    <div class="r2-ways"><span>{mw()}<span>The <b>game link</b> can set the weekly amount after a preview.</span></span>
      <span>{ic("hand")}<span>Or bridge to Monday with a <b>one-time purchase</b> of about 3,050, by hand.</span></span>
      <a class="rel" href="{R2ROUTE["supply/production"]}">{ic("link")}Related, separate fix: Canal Brewery's Water top-up</a></div></div>
</div>"""


CRIT_MORE = f"""
<article class="r2-f">
  <span class="mark"></span>
  <div class="t"><h3>{hood("IC")}Beer machine 4 · Canal Brewery<span class="k">Nobody staffed</span></h3>
    <p class="now"><b>Idle all week</b>: 0 of 168 hours staffed</p></div>
  <div class="vz" style="gap:3px">{hours(range(24))}{hours(range(24))}{hours(range(6, 18))}{hours([], gap=set(range(24)))}</div>
  <div class="ac">{btn("Plan factory hours", "", R2ROUTE["supply/production"], icon_end="go")}</div>
</article>
<article class="r2-f">
  <span class="mark"></span>
  <div class="t"><h3>{hood("HK")}Ana Reyes · Vale Liquor<span class="k">Staff demands</span></h3>
    <p class="now"><b>May quit</b>: wants free weekends, scheduled Sat and Sun</p></div>
  <div class="vz"><div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px">{"".join(f'<i style="height:14px;border-radius:2px;background:{"repeating-linear-gradient(135deg,var(--neg) 0 2px,transparent 2px 5px)" if d >= 5 else "var(--accent)"};opacity:{1 if d >= 5 else .75}"></i>' for d in range(7))}</div>
    <div class="nx-cov"><div class="ax">{"".join(f"<span>{x}</span>" for x in ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"])}</div></div></div>
  <div class="ac">{btn("Resolve staff demand", "", R2ROUTE["staffing/needs"], icon_end="go")}</div>
</article>
<article class="r2-f">
  <span class="mark"></span>
  <div class="t"><h3>{hood("LM")}Harbor Gifts<span class="k">Not trading yet</span></h3>
    <p class="now"><b>Closed since day 81</b>: no prices on 3 products, nobody scheduled</p></div>
  <div class="vz"><div class="mo-lamps" style="display:flex;gap:8px">{"".join(f'<span style="display:flex;align-items:center;gap:6px;height:30px;padding:0 10px 0 7px;border-radius:15px;border:1.5px solid color-mix(in srgb,var(--neg) 55%,transparent);background:var(--neg-soft);color:var(--neg);font-size:12px;font-weight:600">{ic(i, style="width:15px;height:15px")}{t}</span>' for i, t in [("tag", "Prices"), ("staffing", "Staff")])}
    <span style="display:flex;align-items:center;gap:6px;height:30px;padding:0 10px 0 7px;border-radius:15px;border:1.5px solid color-mix(in srgb,var(--accent) 50%,transparent);background:var(--accent-soft);color:var(--accent);font-size:12px;font-weight:600">{ic("supply", style="width:15px;height:15px")}Stock</span></div></div>
  <div class="ac">{btn("Open readiness", "", "BusinessDetail.dc.html", icon_end="go")}</div>
</article>"""

WARN = [
    ("MT", "Juniper Books", "4 amenities missing", "4", "fixes", "Review amenities", "businesses/standards", False),
    ("IC", "Canal Brewery", "Water top-up covers 12 of 24 hours", "12 h", "a day", "Review factory input", "supply/production", False),
    ("LM", "Harbor Gifts", "Gift (Cheap) wholesale delivery too low", "600", "/week", "Review delivery", "supply/deliveries", False),
    ("HK", "Vale Liquor", "2 roles have no uniform", "2", "roles", "Set uniforms", "businesses/standards", True),
    ("GD", "Garment Depot", "Fabric (Cheap) weekly order too small", "6,300", "/week", "Review import", "supply/imports", True),
    ("GD", "Garment Depot", "Clothing (Cheap) not routed", "3,000", "held", "Review routes", "supply/deliveries", False),
    ("MT", "Marlow Market", "Umbrella has no delivery plan", "21", "/day", "Set delivery target", "supply/deliveries", False),
    ("IC", "Stitch Yard", "Factory line without a named recipe", "2", "machines", "Identify recipe", "supply/production", False),
    ("MH", "Pepper &amp; Pine Florist", "Cash register staffing is the limit, 17–19", "$410", "/day", "Review staffing", "staffing/schedules", False),
    ("HK", "Corner Brew Coffee", "Customer satisfaction 71%", "71%", "", "Review satisfaction", "businesses/standards", False),
    ("HK", "Marlow Market", "Promotion at 80% of the cap", "80%", "", "Review promotion", "businesses/standards", False),
]
OPP = [("MT", "Marlow Market", "Soda Can top-up target far above sales", "1,400", "target", "Review target", "supply/deliveries", False),
       ("HK", "Corner Brew Coffee", "Week up 22% on the week before", "+22%", "", "See results", "businesses/results", False)]


def wrow(r, opp=False) -> str:
    hd, site, what, amt, unit, act, route, write = r
    return (f'<a class="r2-w{" opp" if opp else ""}" href="{R2ROUTE[route]}"><span class="mark"></span><span class="site">{hood(hd)}<span>{site}</span></span>'
            f'<b>{what}</b><span class="amt">{amt}<small>{unit}</small></span><span class="to">{mw() if write else ""}{act}{ic("go")}</span></a>')


def ill(kind: str) -> str:
    if kind == "supply":
        return ('<svg class="ill" viewBox="0 0 118 56" aria-hidden="true"><path class="ln wk" d="M16 28 H52"></path><path class="ln lit" d="M64 28 C80 28 80 14 96 14"></path><path class="ln lit" d="M64 28 C80 28 80 42 96 42"></path>'
                '<circle class="nd" cx="12" cy="28" r="8"></circle><rect class="nd a" x="50" y="18" width="18" height="20" rx="3"></rect><rect class="nd" x="96" y="6" width="16" height="16" rx="3"></rect><rect class="nd" x="96" y="34" width="16" height="16" rx="3"></rect></svg>')
    if kind == "staffing":
        cells = ""
        for r in range(4):
            for c in range(12):
                cls = "cell o" if (r == 3 and 8 <= c <= 10) else "cell"
                if (r == 3 and 8 <= c <= 10):
                    continue
                cells += f'<rect class="{cls}" x="{4 + c * 9.2}" y="{6 + r * 11}" width="7.6" height="9" rx="1.5"></rect>'
        return f'<svg class="ill" viewBox="0 0 118 56" aria-hidden="true">{cells}<rect class="gap" x="77.6" y="39" width="26" height="9" rx="1.5" stroke-dasharray="3 2"></rect></svg>'
    if kind == "businesses":
        bars = [(8, 30), (30, 22), (52, 36), (74, 16)]
        out = "".join(f'<rect class="bar" x="{x}" y="{44 - h}" width="16" height="{h}" rx="2"></rect>' for x, h in bars)
        out += '<rect class="bar n" x="96" y="44" width="16" height="9" rx="2"></rect><line x1="4" x2="114" y1="44" y2="44" stroke="var(--rule)"></line>'
        out += "".join(f'<circle class="{c}" cx="{x + 8}" cy="{36 - h}" r="3"></circle>' for (x, h), c in zip(bars + [(96, -8)], ["dotg", "dotg", "dotg", "dotw", "dotw"]))
        return f'<svg class="ill" viewBox="0 0 118 56" aria-hidden="true">{out}</svg>'
    return ('<svg class="ill" viewBox="0 0 118 56" aria-hidden="true"><rect class="flr" x="30" y="10" width="80" height="42"></rect><path class="wall" d="M30 10 H110 V52 H78 M62 52 H30 Z"></path>'
            '<path class="wall" d="M86 10 V28 H110" style="stroke-width:1.3"></path><path class="pin" d="M18 4a9 9 0 0 1 9 9c0 7-9 15-9 15s-9-8-9-15a9 9 0 0 1 9-9z"></path><circle cx="18" cy="13" r="3.2" fill="var(--ground)"></circle></svg>')


TOOLS = [
    ("supply", "Supply", [("Calculate import amounts", "2", "", "supply/imports"), ("Set delivery targets", "4", "", "supply/deliveries"),
                          ("Plan factory running hours", "", "", "supply/production"), ("Trace goods through the company", "", "", "supply/flow")]),
    ("staffing", "Staffing", [("Build shop schedules", "2", "", "staffing/schedules"), ("See whom to hire", "", "", "staffing/needs"), ("Resolve staff demands", "3", "b", "staffing/needs")]),
    ("businesses", "Businesses", [("Compare business profits", "", "", "businesses/results"), ("Check prices and product sales", "", "", "businesses/products"), ("Improve customer satisfaction", "3", "", "businesses/standards")]),
    ("expansion", "Expansion", [("Find a suitable location", "", "", "expansion/finder"), ("Plan a new factory", "", "", "expansion/plan"), ("Explore market demand", "", "", "expansion/demand")]),
]


def tools(cls: str = "r2-tp") -> str:
    out = ""
    for k, name, items in TOOLS:
        rows = "".join(f'<a class="t" href="{R2ROUTE[r]}">{lab}{f"<span class=\'c {cc}\'>{c}</span>" if c else ""}{ic("go")}</a>' for lab, c, cc, r in items)
        out += f'<div class="r2-p"><div class="r2-ph"><b>{ic(k)}{name}</b>{ill(k)}</div>{rows}</div>'
    return f'<div class="{cls}">{out}</div>'


def overview_body(expanded_all: bool = False) -> str:
    warns = WARN if expanded_all else WARN[:5]
    rest = "" if expanded_all else (f'<div class="r2-more"><button class="nx-btn sm" type="button" data-open="more2" aria-expanded="false">{ic("chevd")}'
                                    f'<span data-when="Show fewer" data-was="Show 8 more: 6 warnings, 2 opportunities">Show 8 more: 6 warnings, 2 opportunities</span></button>'
                                    f'<span class="sep"></span><button class="r2-disc" type="button">{ic("eyeoff")}3 below the $500/day line</button>'
                                    f'<button class="r2-disc" type="button">{ic("prefs")}3 in switched-off checks</button><button class="r2-disc" type="button">{ic("clock")}2 waiting for data</button></div>'
                                    f'<div data-pane="more2" hidden>{"".join(wrow(r) for r in WARN[5:])}{"".join(wrow(r, True) for r in OPP)}</div>')
    opp = "".join(wrow(r, True) for r in OPP) if expanded_all else ""
    q = (f'<div class="r2-q"><div class="r2-band"><span class="lab crit">Critical · 4</span></div>{f_import(True)}{CRIT_MORE}'
         f'<div class="r2-band"><span class="lab watch">Warnings · 11</span></div>{"".join(wrow(r) for r in warns)}{opp}</div>{rest}')
    return (kpis() + f'<section aria-labelledby="att">{head()}{q}</section>'
            + f'<div class="r2-toolshead" id="tools"><h2>All tools</h2></div>{tools()}')


def overview() -> str:
    return shell("overview", overview_body())


def overview_long() -> str:
    """Scrolled deep into a long queue: the condensed bar keeps All tools one click away."""
    warns = "".join(wrow(r) for r in WARN) + "".join(wrow(r, True) for r in OPP)
    body = (head(sticky=True) + f'<div class="r2-q" style="border-top:0">{CRIT_MORE}<div class="r2-band"><span class="lab watch">Warnings · 11</span></div>{warns}</div>'
            + f'<div class="r2-toolshead" id="tools"><h2>All tools</h2></div>{tools()}')
    return shell("overview", body)


def overview_sidebar() -> str:
    """The same content and type scale with a slim sidebar, for a fair comparison."""
    nav = "".join(f'<a class="{"on" if k == "overview" else ""}" href="{R2ROUTE[k]}">{ic(k)}{l}{"<span class=n>4</span>" if k == "overview" else ""}</a>' for k, l in MAIN5)
    side = f"""
<aside class="r2-side"><div class="nx-brand"><span class="wordmark" id="wm">Marlow Trading</span><span class="dot" id="dot" role="button" tabindex="0" aria-label="Brand dot"></span></div>
  {nav}<div class="ref"><a href="{R2ROUTE["map"]}">{ic("map")}City map</a><a href="{R2ROUTE["guide"]}">{ic("guide")}Game guide</a></div>
  <div class="foot"><a href="#">{ic("search")}Search</a><a href="{R2ROUTE["prefs"]}">{ic("prefs")}Preferences</a><a href="{R2ROUTE["help"]}">{ic("help")}Help &amp; feedback</a></div></aside>"""
    top = f"""<header class="r2-sidetop nx-top"><h1>Overview</h1><span class="r2-src" style="margin-left:18px"><b></b>LIVE · 14 S</span>
  <button class="r2-co" type="button" aria-label="Switch company or save">{ic("chevd")}</button>
  <div class="clock"><b>Day 83<i>·</i>Wed 09:40</b><small>YEAR 2 · 14 SITES</small></div><div class="orb" aria-hidden="true"><u></u></div></header>"""
    body = overview_body().replace('grid-template-columns:16px minmax(0,1fr) 320px 196px', '')
    return f'<div class="r2-app">{side}<div>{top}<main class="r2-main">{body}</main></div></div>'


SIDE_CSS = """
.r2-app .r2-f{grid-template-columns:16px minmax(0,1fr) 260px 190px}
.r2-app .r2-w{grid-template-columns:16px 180px minmax(0,1fr) 100px 180px}
.r2-app .r2-tp{grid-template-columns:repeat(2,minmax(0,1fr))}
"""


# --------------------------------------------------------------------------
# Imports
# --------------------------------------------------------------------------
def basis_ctl(full: bool = True) -> str:
    return (f'<div class="nx-basis"><span class="lab">Plan for</span><div class="seg" data-seg="basis">'
            f'<button class="{"on" if full else ""}" type="button" data-v="full">Full production</button><button class="{"" if full else "on"}" type="button" data-v="demand">Shop demand</button></div>'
            f'<span class="txt">{"Factory lines at rated output, round the clock" if full else "Factory lines sized to shop sales + 15%"}</span></div>')


def imports(opened: bool = False) -> str:
    why = f"""
<div class="r2-open" data-pane="why"{"" if opened else " hidden"}>
  <div><span class="lab">Why 18,740 a week</span>
    <div class="r2-calc" style="margin-top:8px"><span>Canal Brewery at rated output, 2,400 a day × 7</span><b>16,800</b>
      <span>2 grocery shelves, 240 a day × 7, plus 15%</span><b>1,932</b>
      <span class="tot">Rounded up to the ten</span><b class="tot">18,740</b>
      <span>Shop demand instead: the brewery at 1,300 a day</span><b style="color:var(--ink-2)">11,040</b></div></div>
  <div><span class="lab">Set it in the game</span>
    <div class="r2-steps2" style="margin-top:8px"><span><i>1</i>Open <b>BizMan › Purchasing agent</b></span><span><i>2</i>Pick the <b>1 Pier</b> contract, then <b>Water</b></span>
      <span><i>3</i>Set <b>Amount</b> to <b>18,740</b> before Sun 20:00</span></div></div>
</div>"""
    body = f"""
<div class="r2-from"><a class="back" href="{R2ROUTE["overview"]}#att">{ic("back")}Needs attention</a><span>You came from <b>Water · Bridge Hub</b>, import shortfall · 1 of 4 critical</span></div>
<div class="r2-scope"><span class="nx-pick sel">{ic("warehouse")}Bridge Hub<span class="x" aria-label="Clear">{ic("x", style="width:12px;height:12px")}</span></span>
  <a class="link" href="#">All import lines</a><span style="margin-left:auto">{basis_ctl()}</span></div>
<section class="r2-dec" aria-labelledby="dh">
  <div class="r2-dh">{hood("IC")}<h2 id="dh">Water · Bridge Hub</h2>{chip("bad", "short")}<span class="how">{ic("truck")}Fixed weekly amount from 1 Pier, delivered Monday 08:00</span></div>
  <div class="r2-db">
    <div>
      <span class="lab">Weekly order at 1 Pier</span>
      <div class="r2-big"><span class="was">8,400</span><span class="arr">→</span><label class="to"><input value="18,740" aria-label="Weekly order of Water"><span class="u">units a week</span></label></div>
      <div class="r2-basis">{ic("factory", style="width:15px;height:15px;color:var(--accent)")}Planned for <b>full production</b></div>
      <div class="r2-scale" aria-label="Weekly amounts on one scale">
        <i style="left:0;width:42%;background:var(--ink-3);opacity:.6"></i><i style="left:42%;width:51.7%;background:var(--accent)"></i>
        <span class="m" style="left:42%"><span>order now<br>8,400</span></span>
        <span class="m low" style="left:60.9%;background:var(--warn)"><span style="color:var(--warn)">today's draw<br>12,180</span></span>
        <span class="m" style="left:93.7%;background:var(--accent)"><span style="color:var(--accent)">planned<br>18,740</span></span>
        <span class="m cap low" style="left:100%"><span>1 Pier cap<br>20,000</span></span>
      </div>
    </div>
    <div class="r2-railbig">
      <span class="lab" style="display:block;margin-bottom:26px">Stock cover at today's draw</span>
      {cover(["", "", "", "half", "dry", "", ""], ["WED", "THU", "FRI", "SAT", "SUN", "MON", "TUE"], truck=5)}
      <div class="r2-rn"><span>Runs out</span><b>Sat ~14:00</b></div>
      <div class="r2-rn" style="margin-top:6px"><span>Next delivery</span><b class="ok">Mon 08:00</b></div>
    </div>
  </div>
  <div class="r2-act">
    {state("sug")}
    {gwbtn("Preview in the game", "", "WritePreview.dc.html")}
    {btn("Mark done by you", "ghost", "ImportsMarked.dc.html", icon="tick")}
    <span class="sep"></span>
    <button class="r2-disc" type="button" data-open="why" aria-expanded="{"true" if opened else "false"}">{ic("chevd")}Why this amount?</button>
    <button class="r2-disc" type="button" data-open="why" aria-expanded="{"true" if opened else "false"}">{ic("pin")}Set it in the game</button>
    <button class="r2-disc" type="button">{ic("copy")}Copy</button>
    <span class="note">Orders close Sun 20:00</span>
  </div>
  {why}
</section>
<div class="r2-once">
  <span class="k">One-time<br>by hand</span>
  <p><span class="v">~3,050</span> units bought once before <b style="color:var(--ink)">Sat 14:00</b> bridge to Monday. Urgent orders cost more and count against Monday's cap; the game link does not place them.</p>
  <span style="display:flex;gap:8px">{btn("Set it in the game", "sm ghost", icon="pin")}{btn("Mark done", "sm ghost", icon="tick")}</span>
</div>
<div class="r2-lines">
  <div class="r2-band"><span class="lab">Other lines at Bridge Hub</span><span class="quiet" style="margin-left:auto">2 covered lines hidden · <button class="link" type="button">Show everything</button></span></div>
  <div class="r2-li">{ic("tank")}<b>Soda Can</b><span class="n">2,600<small>in stock</small></span><span class="src">Smart Delivery at 1 Pier keeps this stock level</span><span style="display:flex;justify-content:flex-end">{state("conf", "Confirmed · 09:40")}</span></div>
</div>"""
    return shell("supply", body, local("supply", "imports"))


# --------------------------------------------------------------------------
# Changes
# --------------------------------------------------------------------------
CHG = [
    ("imports", "Imports", [("sug", "Water", "IC", "Bridge Hub", "8,400", "18,740", "a week", "1 Pier weekly order", True),
                            ("sug", "Fabric (Cheap)", "GD", "Garment Depot", "5,000", "6,300", "a week", "7 Pier weekly order", True),
                            ("link", "Soda Can", "IC", "Bridge Hub", "2,000", "2,600", "in stock", "1 Pier Smart Delivery", True)]),
    ("deliveries", "Deliveries", [("conf", "Umbrella", "MT", "Marlow Market", "none", "30", "a day", "top-up from Bridge Hub", False),
                                  ("mine", "Gift (Cheap)", "LM", "Harbor Gifts", "450", "700", "a week", "wholesale delivery", False),
                                  ("mine", "Soda Can", "MT", "Marlow Market", "1,400", "300", "target", "top-up target", False),
                                  ("sug", "Clothing (Cheap)", "GD", "Garment Depot", "none", "180", "a day", "new route to Stitch &amp; Co", False)]),
    ("production", "Production", [("sug", "Water", "IC", "Canal Brewery", "1,200", "2,400", "a day", "top-up from Bridge Hub", False),
                                  ("sug", "Beer, 4 machines", "IC", "Canal Brewery", "15", "24", "h a day", "factory staffing", False)]),
]
MARK = {"sug": ("nx-tick", "Suggested"), "mine": ("nx-tick on", "Marked by you"), "link": ("nx-tick link", "Applied · awaiting refresh"), "conf": ("nx-tick conf", "Confirmed")}


def changes(copy_open: bool = False) -> str:
    groups = ""
    for key, name, rows in CHG:
        rr = ""
        for st, item, hd, site, now, to, unit, where, wr in rows:
            tc, lab = MARK[st]
            kind = {"sug": "sug", "mine": "mine", "link": "link", "conf": "conf"}[st]
            rr += (f'<div class="r2-c nx-chg{" done" if st != "sug" else ""}"><button class="{tc}" type="button" aria-pressed="{"true" if st != "sug" else "false"}" aria-label="Mark {item} at {site} done">{ic("tick" if st != "link" else "link")}</button>'
                   f'<div class="w"><b>{item}</b>{hood(hd)}<span>{site}</span></div>'
                   f'<div class="v"><s>{now}</s>→ <em>{to}</em><small>{unit}</small></div>'
                   f'<div class="where">{mw() if wr and st == "sug" else ""}{where}</div><div class="st">{state(kind, lab)}</div></div>')
        groups += f'<div class="r2-cg">{ic({"imports": "truck", "deliveries": "supply", "production": "factory"}[key])}<b>{name}</b><span class="mono dim" style="font-size:12px">{len(rows)}</span><a href="{R2ROUTE["supply/" + key]}">Open {name}</a></div>{rr}'
    copy = """Marlow Trading · day 83 · plan for full production
[ ] Bridge Hub · 1 Pier · Water: weekly order 8,400 -> 18,740
[ ] Garment Depot · 7 Pier · Fabric (Cheap): weekly order 5,000 -> 6,300
[ ] Garment Depot -> Stitch &amp; Co · Clothing (Cheap): route, 180 a day
[ ] Canal Brewery · Water top-up from Bridge Hub: 1,200 -> 2,400 a day
[ ] Canal Brewery · Beer, 4 machines: 24 h a day"""
    body = f"""
<div class="r2-ck nx-ck" style="--p:44%">
  <div class="cnt"><b><span data-n>4</span> <small>of 9</small></b><span>recorded or applied</span></div>
  <div class="road" aria-hidden="true"><i class="done"></i><span class="truck">{ic("truck")}</span><span class="flag">{ic("pin")}</span></div>
  <div class="acts">{btn("Copy remaining 5", "go", icon="copy")}{gwbtn("Apply 2 import amounts", "", "WritePreview.dc.html")}</div>
</div>
<div class="r2-ckbar">
  <span class="chip dim">Plan for: Full production</span>
  <button class="r2-disc" type="button" data-open="cp" aria-expanded="{"true" if copy_open else "false"}">{ic("chevd")}Preview the copied text</button>
  <button class="r2-disc" type="button">{ic("help")}Why 9 here and 17 on the Overview?</button>
  <span style="margin-left:auto"><button class="link" type="button">Clear my marks</button></span>
</div>
<div class="r2-copyp" data-pane="cp"{"" if copy_open else " hidden"}><div class="nx-copy">{copy}</div></div>
{groups}"""
    return shell("supply", body, local("supply", "changes"))


# --------------------------------------------------------------------------
# Business page
# --------------------------------------------------------------------------
def business() -> str:
    random.seed(3)
    rev = [1320, 1410, 1380, 1520, 1690, 1900, 1750, 1340, 1460, 1500, 1610, 1780, 1960, 1840]
    cus = [150, 158, 151, 166, 181, 205, 188, 142, 157, 160, 171, 190, 212, 196]
    mb = lambda vs: '<div class="r2-mb">' + "".join(f'<i class="{"hi" if k == len(vs) - 1 else ""}" style="height:{v / max(vs) * 100:.0f}%"></i>' for k, v in enumerate(vs)) + "</div>"
    capv = [18, 20, 20, 19, 22, 30, 30, 21, 20, 20, 23, 30, 30, 26]
    capb = '<div class="r2-capb">' + "".join(f'<i class="{"top" if v >= 30 else ""}" style="height:{v / 30 * 100:.0f}%"></i>' for v in capv) + "</div>"
    heat = ""
    for d, dn in enumerate(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]):
        heat += f"<span>{dn}</span>"
        for h in range(24):
            if h < 8 or h >= 22:
                heat += '<i style="background:var(--rule-soft)"></i>'
                continue
            v = min(1, (0.35 + 0.5 * (h in (12, 13, 17, 18, 19)) + 0.15 * (d >= 4)) * (0.8 + random.random() * .3))
            hr = "hr" if h in (17, 18) and d >= 3 else ""
            heat += f'<i class="{hr}" style="background:color-mix(in srgb,var(--accent) {int(v * 90)}%,var(--rule-soft))"></i>'
    heat += '<div class="ax">' + "".join(f"<span>{h if h % 3 == 0 else ''}</span>" for h in range(24)) + "</div>"
    lamps = "".join(f'<div class="r2-lamp {c}"><span>{ic(i)}</span><small>{t}</small></div>' for i, t, c in
                    [("door", "Bathroom", "lit"), ("lock", "Privacy", "lit"), ("sink", "Sink", "lit"), ("music", "Music", "lit"), ("brush", "Interior 48/55", "miss"), ("shirt", "Uniforms", "lit")])
    people = "".join(f'<span class="r2-person">{hood(r)}{n}<small>{t}</small></span>' for r, n, t in
                     [("CS", "Ben Ode", "Cash register"), ("CS", "Cy Moss", "Cash register"), ("CS", "Ana Silva", "Cash register"), ("CL", "Lea Kim", "Cleaning"), ("CL", "Tom Vu", "Cleaning")])
    prods = "".join(f'<div class="r2-pr"><span>{p}</span><span class="n">{pr}</span><span class="n">{s}</span><div class="mini" title="stock against the busiest day"><i style="width:{c}%"></i><u style="left:80%"></u></div></div>' for p, pr, s, c in
                    [("Flowers (Cheap)", "$6.50", "118", 92), ("Flowers (Luxury)", "$24.00", "41", 71), ("Plant (Potted)", "$18.00", "22", 88)])
    body = f"""
<div class="r2-bh"><span class="av">MH</span>
  <div><div style="display:flex;align-items:center;gap:12px"><h1>Pepper &amp; Pine Florist</h1><span class="chip line">3rd of 11 by profit</span></div>
  <div class="meta">Florist · 14 Park Ave, Murray Hill · open 08–22 · since day 12</div></div>
  <div class="acts">{btn("Schedule", "", R2ROUTE["staffing/schedules"], icon="calendar")}{btn("Deliveries", "", R2ROUTE["supply/deliveries"], icon="truck")}{btn("Prices", "", "PricesShop.dc.html", icon="tag")}</div></div>
<a class="r2-w" href="{R2ROUTE["staffing/schedules"]}" style="margin-top:14px;border-top:1px solid var(--rule-soft)"><span class="mark"></span><span class="site"><span class="lab" style="color:var(--warn)">Needs attention here</span></span>
  <b>Cash register staffing is the limit, 17–19 daily</b><span class="amt">$410<small>/day</small></span><span class="to">Review staffing{ic("go")}</span></a>
<div class="r2-tiles">
  <div class="r2-tile"><span class="lab">Revenue yesterday</span><span class="v">$1,840</span><span class="d">{chip("ok", "▲ 6%")}on its weekday</span>{mb(rev)}</div>
  <div class="r2-tile"><span class="lab">Customers</span><span class="v">196</span><span class="d">$9.40 a visit</span>{mb(cus)}</div>
  <div class="r2-tile"><span class="lab">Profit yesterday</span><span class="v pos">$690</span><span class="d">37.5% margin</span>
    <div class="r2-seg"><i style="flex:31;background:var(--warn)"></i><i style="flex:18;background:var(--info)"></i><i style="flex:13;background:var(--ink-3)"></i><i style="flex:38;background:var(--accent)"></i></div>
    <div class="r2-segl"><span><i style="background:var(--warn)"></i>goods</span><span><i style="background:var(--info)"></i>wages</span><span><i style="background:var(--ink-3)"></i>rent</span><span><i style="background:var(--accent)"></i>profit</span></div></div>
  <div class="r2-tile"><span class="lab">Customers an hour, peak</span><span class="v">30<small style="font-size:14px;color:var(--ink-3)"> of 30</small></span><span class="d">at building capacity on 4 of 14 days</span>{capb}</div>
</div>
<div class="r2-g2">
  <div class="r2-card"><h3>{ic("star")}Satisfaction<span class="aside"><a class="link" href="{R2ROUTE["businesses/standards"]}">Compare shops</a></span></h3>
    <div class="r2-sat"><span class="big">86<small>%</small></span>
      <div class="r2-eq" title="four scores against the 80 line"><span class="ln"></span><i style="height:64px;background:var(--accent)"></i><i style="height:58px;background:var(--accent)"></i><i style="height:42px;background:var(--warn)"></i><i style="height:62px;background:var(--accent)"></i></div>
      <div class="r2-lamps">{lamps}</div></div></div>
  <div class="r2-card"><h3>{ic("megaphone")}Promotion<span class="aside">at the cap</span></h3>
    <div style="display:flex;align-items:baseline;gap:8px"><span class="mono" style="font-size:40px;letter-spacing:-.03em">100</span><span style="color:var(--ink-3)">/ 100</span></div>
    <div class="r2-promo"><i style="flex:72;background:var(--accent);opacity:.75"></i><i style="flex:28;background:var(--accent)"></i></div>
    <div class="r2-segl"><span><i style="background:var(--accent);opacity:.75"></i>foot traffic 72</span><span><i style="background:var(--accent)"></i>marketing 28</span></div></div>
</div>
<div class="r2-card" style="margin-top:16px"><h3>{ic("clock")}Customers by hour<span class="aside">red outline: Cash register at its ceiling</span></h3><div class="r2-heat">{heat}</div></div>
<div class="r2-g2" style="grid-template-columns:1fr 1fr">
  <div class="r2-card"><h3>{ic("users")}People<span class="aside">5 · $512 a day</span></h3><div class="r2-people">{people}</div></div>
  <div class="r2-card"><h3>{ic("tag")}Products<span class="aside"><a class="link" href="PricesShop.dc.html">Prices against the market</a></span></h3>
    <div class="r2-pr" style="min-height:28px;font:500 10px/1 'IBM Plex Mono',monospace;letter-spacing:.1em;color:var(--ink-3)"><span>PRODUCT</span><span class="n" style="font-size:10px">PRICE</span><span class="n" style="font-size:10px">A DAY</span><span>STOCK</span></div>{prods}</div>
</div>"""
    return shell("businesses", body, local("businesses", "results"))


# --------------------------------------------------------------------------
# phone
# --------------------------------------------------------------------------
def pshell(active: str, body: str) -> str:
    tabs = "".join(f'<a class="{"on" if k == active else ""}" href="{R2ROUTE[k]}">{ic(k)}<span>{l}</span>{"<span class=n>4</span>" if k == "overview" else ""}</a>' for k, l in MAIN5)
    tabs += f'<a href="#" aria-haspopup="menu">{ic("map")}<span>Map &amp; more</span></a>'
    return f"""
<div class="p2">
  <header class="p2-top nx-ptop"><div class="nx-brand"><span class="wordmark" id="wm">Marlow Trading</span><span class="dot" id="dot" role="button" tabindex="0" aria-label="Brand dot"></span></div>
    <span class="src"><b></b>14 S</span><button class="ibtn" type="button" aria-label="Update now">{ic("refresh")}</button></header>
  <div class="p2-b">{body}</div>
  <nav class="ph-tabs" aria-label="Main">{tabs}</nav>
</div>"""


def phone() -> str:
    crit = f"""
<article class="p2-f sel">
  <div class="l1"><span class="mk"></span><b>Water · Bridge Hub</b></div>
  <p class="now"><b>Runs out Sat ~14:00</b>, before Monday's delivery</p>
  <div class="vz">{cover(["", "", "", "half", "dry", "", ""], ["W", "T", "F", "S", "S", "M", "T"], truck=5)}</div>
  <p class="ev">Order <b>8,400</b> a week · today's draw <b>12,180</b></p>
  <a class="go" href="{R2["phoneimports"]}">Review import{ic("go")}</a>
</article>
<article class="p2-f"><div class="l1"><span class="mk"></span><b>Beer machine 4 · Canal Brewery</b></div><p class="now"><b>Idle all week</b>, nobody staffed</p><a class="go" href="{R2ROUTE["supply/production"]}">Plan factory hours{ic("go")}</a></article>
<article class="p2-f"><div class="l1"><span class="mk"></span><b>Ana Reyes · Vale Liquor</b></div><p class="now"><b>May quit</b>: wants free weekends</p><a class="go" href="{R2ROUTE["staffing/needs"]}">Resolve staff demand{ic("go")}</a></article>
<article class="p2-f"><div class="l1"><span class="mk"></span><b>Harbor Gifts</b></div><p class="now"><b>Not trading</b>: prices and staff missing</p><a class="go" href="BusinessDetail.dc.html">Open readiness{ic("go")}</a></article>"""
    warns = "".join(f'<a class="p2-w" href="{R2ROUTE[r[6]]}"><span class="mk"></span><span><b>{r[2]}</b><small>{r[1]}</small></span>{ic("chev")}</a>' for r in WARN[:3])
    body = f"""
<div class="p2-ctx"><span>Profit <b class="neg">-$1,240</b></span><span>Cash <b>$212k</b></span><span>Day 83</span><a href="{R2ROUTE["businesses/results"]}" aria-label="Company results">{ic("chev")}</a></div>
<div class="p2-h"><h2>Needs attention</h2><a class="r2-tools" href="#tools">{ic("chevd")}All tools</a></div>
<div class="p2-sev"><button class="sev crit" type="button"><i></i>4</button><button class="sev watch" type="button"><i></i>11</button><button class="sev opp" type="button"><i></i>2</button><a class="nx-btn sm ghost" href="Customize.dc.html" style="margin-left:auto;height:36px">{ic("prefs")}Checks</a></div>
{crit}
<div class="r2-band"><span class="lab watch">Warnings · 11</span></div>
{warns}
<button class="nx-btn wide" type="button" style="height:44px;margin-top:12px">Show 10 more</button>
<h2 id="tools" style="font-size:20px;font-weight:700;margin-top:26px">All tools</h2>
{tools("p2-tp")}"""
    return pshell("overview", body)


def phone_imports(sheet: bool = False) -> str:
    body = f"""
<div class="r2-from" style="margin-top:12px"><a class="back" href="{R2["phone"]}">{ic("back")}Needs attention</a><span>1 of 4</span></div>
<div class="p2-views" aria-label="Supply views"><div class="row"><a href="{R2ROUTE["supply/changes"]}">Changes</a><a class="on" href="#">Imports</a><a href="#">Deliveries</a><a href="#">Production</a><a href="#">Goods flow</a></div>
  <span class="fade"><button type="button" aria-label="More Supply views">{ic("chev")}</button></span></div>
<div class="p2-dec">
  <div class="hd">{hood("IC")}<h2>Water · Bridge Hub</h2>{chip("bad", "short")}</div>
  <div class="sec"><span class="lab">Weekly order at 1 Pier</span>
    <div class="r2-big"><span class="was">8,400</span><span class="arr">→</span><label class="to"><input value="18,740" aria-label="Weekly order"><span class="u">/ week</span></label></div>
    <div class="seg" style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr"><button class="on" type="button" style="justify-content:center;min-height:38px">Full production</button><button type="button" style="justify-content:center;min-height:38px">Shop demand</button></div>
    <p style="font-size:12.5px;color:var(--ink-2);margin-top:8px">Today's draw needs 12,180; 1 Pier allows 20,000.</p></div>
  <div class="sec" style="border-top:1px solid var(--rule-soft)"><span class="lab" style="display:block;margin-bottom:20px">Stock cover</span>{cover(["", "", "", "half", "dry", "", ""], ["W", "T", "F", "S", "S", "M", "T"], truck=5)}
    <div class="r2-rn"><span>Runs out</span><b>Sat ~14:00</b></div></div>
  <div class="p2-acts">
    {gwbtn("Preview in the game", "", R2["phonewrite"])}
    <div class="row">{btn("Mark done", "ghost", "#", icon="tick")}{btn("Set it in game", "ghost", "#", icon="pin")}</div>
    <button class="r2-disc" type="button" style="justify-content:center;height:36px">{ic("chevd")}Why this amount?</button>
  </div>
</div>
<div class="r2-once" style="grid-template-columns:1fr;gap:6px"><span class="k">One-time, by hand</span><p><span class="v">~3,050</span> before Sat 14:00, bought as an urgent order.</p></div>"""
    b = pshell("supply", body)
    if sheet:
        wire = f'<span class="gw-w ok" aria-hidden="true"><i class="a"></i><i class="ln"></i><span class="g">{ic("game")}</span></span>'
        d = f"""
<div class="gw-dlg" role="dialog" aria-label="Set import amounts">
  <div class="gw-head"><span class="gw-kind">{ic("truck")}</span><div><h2>Set import amounts</h2><div class="gw-where">{hood("IC")}<span>Bridge Hub · 1 contract</span></div></div><button class="gw-x" type="button" aria-label="Close">{ic("x")}</button></div>
  <div class="gw-verdict">{wire}<span><b>The game would take this.</b></span><span class="gw-meta">closes Sun 20:00</span></div>
  <div class="gw-body"><div class="gw-mat"><div class="top">{ic("truck")}<b>Water</b><span class="quiet">a week</span><span class="num"><s>8,400</s><em>18,740</em></span></div>
    <div class="gw-lvl"><i class="now" style="width:42%"></i><i class="add" style="left:42%;width:51.7%"></i><i class="cap" style="left:99.6%" data-l="cap 20,000"></i></div><div class="meta" style="margin-top:14px"><span>next delivery $15,930</span></div></div></div>
  <div class="gw-foot"><span class="gw-hint">Only the amount changes. Undo lasts until your next import change.</span><button class="gw-b ghost" type="button">Cancel</button><a class="gw-b go" href="#">Apply 1 change</a></div>
</div>"""
        b += f'<div class="sp-scrim"></div><div class="p2-sheet"><div class="grab"></div>{d}</div>'
    return b


# --------------------------------------------------------------------------
# before / after sheets (canvas annotation, never product UI)
# --------------------------------------------------------------------------
BA = [
    ("BAOverview", "Overview", ("before-Main", "after-R2Overview"), ("639", "OV"),
     ["The right rail: 'What the board checked' repeated the check line; 'Your changes' moved to one line that opens it",
      "Design commentary: 'never folded away', 'ranked by materiality', 'the same thirteen tasks'",
      "Repeated site and product in a meta line and a sentence title; the second action note per row"],
     ["One summary per critical finding: where and what, what matters now, one picture, one action",
      "Hours strip, weekend grid and readiness lamps for the other three criticals",
      "Company numbers at 27 px with trend areas; four tool panels with small working pictures"],
     ["Weekly amounts by basis, who goes without and the ways to fix: the expanded finding",
      "What was checked: 'Checked 14 businesses ▾'",
      "Below the line, switched off, waiting for data: three counted buttons under the queue"]),
    ("BAImports", "Imports", ("before-Imports", "after-R2Imports"), ("378", "IM"),
     ["The three-box status column; 'Change it yourself' and its copy preview",
      "The long catch-up card text and the second 'In the game' path box",
      "The sidebar's second level; the scope row's object chips"],
     ["8,400 → 18,740 units a week at 40 px, labelled 'Planned for full production'",
      "One scale with order now, today's draw, planned and the 1 Pier cap: the basis change is visible",
      "The stock rail at twice the size with runs-out and next delivery beside it"],
     ["The arithmetic: 'Why this amount?'", "BizMan steps: 'Set it in the game'", "Mark history: the single state pill; manual and game link are alternatives in one bar"]),
    ("BAChanges", "Changes", ("before-Changes", "after-R2Changes"), ("421", "CH"),
     ["The sentence restating each change; the permanent copy preview", "The paragraph on why the counts differ", "The legend box of marks"],
     ["The truck on a longer road, with the count at 28 px", "Rows lead with product and site, then current → proposed with the unit", "Where it is set, and one state pill per row"],
     ["Copied text: 'Preview the copied text'", "Count difference: 'Why 9 here and 17 on the Overview?'", "Apply stays one button: 'Apply 2 import amounts'"]),
    ("BABusiness", "Business page", ("before-BusinessDetail", "after-R2Business"), ("201", "BU"),
     ["The name as two consecutive large headings", "Descriptive tile sub-lines", "The jump bar duplicating the local row"],
     ["Revenue and customers: 14-day mini bars", "Profit: a segmented bar of goods, wages, rent and profit", "Peak customers an hour against capacity; lamps with names under them"],
     ["Rank and history: 'Results' in the local row", "Prices against the market: Products & prices", "Staffing plan: the Schedule button"]),
    ("BAPhone", "Phone", ("before-PhoneOverview", "after-R2Phone", "before-PhoneImports", "after-R2PhoneImports"), ("270, 97", "PH"),
     ["The company line and the 2 × 2 metric block: one context line", "Four filled green buttons: one filled, the rest outlined", "The clipped Supply tab row"],
     ["One selected finding with its stock rail; the others as two lines and an action", "Supply views as pills with a visible continuation button", "8,400 → 18,740 as the lead of Imports"],
     ["Evidence for the other findings: their own screens", "The arithmetic: 'Why this amount?'", "Company numbers: the › on the context line"]),
]


def ba_sheet(i: int, assets: dict, counts: dict) -> str:
    key, name, imgs, (before_words, ck), rm, vs, df = BA[i]
    after = counts.get(ck, "")
    if len(imgs) == 2:
        figs = (f'<div class="ba-pair"><figure><figcaption>Before<b>round 1</b></figcaption><img src="{assets.get(imgs[0], "")}" alt="{name} before"></figure>'
                f'<figure><figcaption>After<b>round 2</b></figcaption><img src="{assets.get(imgs[1], "")}" alt="{name} after"></figure></div>')
    else:
        figs = '<div class="ba-phones">' + "".join(f'<figure style="margin:0"><figcaption class="lab" style="margin-bottom:6px;display:block">{"Before" if im.startswith("before") else "After"}</figcaption><img src="{assets.get(im, "")}" alt="" style="width:100%;border-radius:10px;border:1px solid var(--rule)"></figure>' for im in imgs) + "</div>"
    li = lambda xs: "".join(f"<li>{x}</li>" for x in xs)
    return f"""
<div class="ba">
  <h1>{name}: before and after<span class="ba-count">on-page words {before_words} → {after}</span></h1>
  <p class="sub">Annotation sheet for the review, not part of the product.</p>
  {figs}
  <div class="ba-notes">
    <div class="rm"><h3>Removed</h3><ul>{li(rm)}</ul></div>
    <div class="vs"><h3>Became visual</h3><ul>{li(vs)}</ul></div>
    <div class="df"><h3>Deferred detail lives in</h3><ul>{li(df)}</ul></div>
  </div>
</div>"""
