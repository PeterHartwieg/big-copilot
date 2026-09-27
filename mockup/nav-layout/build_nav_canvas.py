"""Generates the navigation-layout comparison canvas: project/*.dc.html and project/canvas.json.

Two screens (Supply › Imports, Overview) in four shells: Now (the implemented masthead at
0c33440 of the ui-redesign-chunk3 worktree), A, B and C, which move progressively more of
the navigation into a sidebar. B also gets a 1100 px frame with the sidebar collapsed to
icons and a dark frame. NOTES.md beside this file says what moves where.

The styles follow the board's TEMPLATE (tokens, masthead, local row, segmented controls,
depot tables, findings); icons come from ../ui-redesign/kit.py. All data is synthetic.

Never hand-edit project/: change this file and rerun. `--preview` also writes plain HTML
copies into _preview/ for screenshots (not part of the canvas).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "ui-redesign"))
from kit import _P, ic  # noqa: E402

_P.update({
    "sun": '<circle cx="12" cy="12" r="4"></circle><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"></path>',
    "box": '<path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16z"></path><path d="M3.5 8 12 12.5 20.5 8M12 12.5v8"></path>',
    "mapsm": '<rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M9 4v16M15 4v16M4 12h5M15 12h5"></path>',
    "panel": '<rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect><path d="M9 4.5v15"></path>',
    "why": '<path d="M9 6l6 6-6 6"></path>',
    "route": '<circle cx="6" cy="6" r="2"></circle><circle cx="18" cy="18" r="2"></circle><path d="M8 6h7a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h7"></path>',
    "pause": '<path d="M9 6v12M15 6v12"></path>',
    "down": '<path d="M12 5v14M6 13l6 6 6-6"></path>',
    "trend": '<path d="M4 17 10 11l4 4 6-7"></path><path d="M15 8h5v5"></path>',
    "people": '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path><circle cx="17" cy="9" r="2.5"></circle><path d="M15.5 14.5a5 5 0 0 1 6 5"></path>',
    "bldg": '<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"></path><path d="M14 10h5a1 1 0 0 1 1 1v10M4 21h17M8 8h2M8 12h2M8 16h2"></path>',
})

FONTS = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"

CSS = r"""
*{box-sizing:border-box}
body{margin:0}
.board{--ground:#eef0ea;--surface:#fdfdfb;--raised:#f3f4ef;--ink:#15181a;--ink-2:#5b6469;--ink-3:#7d868b;
  --rule:#d2d6cd;--rule-soft:#e0e3da;--accent:#00703a;--accent-soft:#00703a1f;--on-accent:#fff;
  --pos:#00703a;--neg:#cc2a20;--warn:#b34d00;--info:#2a5ea8;--news:#e4e8df;--chipbg:#00000010;
  position:relative;overflow:hidden;background:var(--ground);color:var(--ink);
  font-family:Archivo,"Helvetica Neue",Arial,sans-serif;font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased}
.board.dark{--ground:#0d100f;--surface:#151917;--raised:#1c211e;--ink:#e9ece6;--ink-2:#9aa39d;--ink-3:#808a84;
  --rule:#262c28;--rule-soft:#1e2320;--accent:#43c07a;--accent-soft:#43c07a26;--on-accent:#08130d;
  --pos:#43c07a;--neg:#ff6257;--warn:#f0913a;--info:#6ea8ff;--news:#141a17;--chipbg:#ffffff12}
.board a{color:inherit;text-decoration:none}
.board button{font:inherit;color:inherit}
.i{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none}
.mono{font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace;font-variant-numeric:tabular-nums}
.new{display:inline-block;font:600 8.5px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;padding:3px 5px;border-radius:4px;background:var(--accent-soft);color:var(--accent)}
.hood{display:inline-grid;place-items:center;min-width:22px;height:18px;padding:0 4px;border:1px solid var(--rule);border-radius:4px;background:var(--raised);font:600 9.5px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.mapb{display:inline-grid;place-items:center;width:20px;height:20px;border:1px solid var(--rule);border-radius:4px;color:var(--ink-2)}
.mapb .i{width:12px;height:12px}

/* the news strip */
.news{display:flex;align-items:center;gap:8px;height:38px;padding:0 36px;background:var(--news);font-size:12px;color:var(--ink-2);white-space:nowrap;overflow:hidden}
.news b.d{width:6px;height:6px;border-radius:50%;background:var(--accent);flex:none}
.news strong{color:var(--ink);font-weight:600}
.news span{overflow:hidden;text-overflow:ellipsis}
.news a{color:var(--accent)!important;text-decoration:underline!important;flex:none}
.news .x{margin-left:auto;flex:none;color:var(--ink-3)}
.news .x .i{width:13px;height:13px}

/* brand: wordmark, dot, sphere */
.wordmark{font-size:30px;font-weight:800;letter-spacing:-.045em;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dot{display:inline-block;flex:none;width:10px;height:10px;border-radius:50%;background:var(--accent)}
.orb{position:absolute;width:42px;height:42px;border-radius:50%;
  background:radial-gradient(circle at 32% 30%,#d9ffe8 0%,#7fe3a8 14%,#43c07a 38%,#146b3c 78%,#0b3d23 100%);
  box-shadow:0 10px 22px #43c07a3d,inset -8px -11px 18px #00000066,inset 3px 4px 10px #ffffff22}
.orb::before{content:"";position:absolute;inset:0;border-radius:50%;
  background:radial-gradient(circle at 72% 28%,#0003 0 4.5%,transparent 5.5%),radial-gradient(circle at 26% 62%,#0003 0 3.5%,transparent 4.5%),radial-gradient(circle at 62% 80%,#0002 0 3%,transparent 4%)}
.orb::after{content:"";position:absolute;left:14%;right:14%;bottom:-6px;height:8px;border-radius:50%;background:#000;opacity:.2;filter:blur(4px);z-index:-1}
.dark .orb::after{opacity:.45}

/* buttons shared by the shells */
.ib{display:inline-grid;place-items:center;width:36px;height:36px;border:1px solid var(--rule);border-radius:8px;background:var(--surface);color:var(--ink);position:relative}
.ib .i{width:15px;height:15px}
.ib .new{position:absolute;top:-10px;left:50%;transform:translateX(-50%)}
.tb{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:36px;padding:0 13px;border:1px solid var(--rule);border-radius:8px;background:var(--surface);font-size:13px;font-weight:500;white-space:nowrap}
.tb .i{width:15px;height:15px}
.clock{text-align:right;white-space:nowrap}
.clock b{font:500 16px/1.2 "IBM Plex Mono",monospace}
.clock b i{font-style:normal;color:var(--ink-3);margin:0 5px}
.clock small{display:block;font:400 10.5px/1.3 "IBM Plex Mono",monospace;color:var(--ink-3);margin-top:3px}

/* the current masthead */
.mast{position:relative;display:flex;align-items:center;gap:14px;height:100px;margin:0 36px;border-bottom:1px solid var(--rule)}
.mast .brand{display:flex;align-items:baseline;gap:3px;margin-right:auto}
.mast .wordmark{max-width:236px}
.mast .orb{left:262px;top:22px}
.refs{display:flex;align-items:center;gap:12px;padding:0 14px;border-left:1px solid var(--rule);font-size:13px;color:var(--ink-2)}
.refs a{display:flex;align-items:center;gap:6px}
.refs .i{width:15px;height:15px}
.mast .clock{margin-left:14px}
.areas{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));margin:0 36px;border-bottom:1px solid var(--rule)}
.areas a{position:relative;display:flex;align-items:center;justify-content:center;gap:8px;height:46px;color:var(--ink-2);font-size:14px;font-weight:500}
.areas a .i{width:17px;height:17px}
.areas a.on{color:var(--ink)}
.areas a.on::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--accent)}
.bad{display:inline-grid;place-items:center;min-width:17px;height:17px;padding:0 5px;border-radius:9px;background:var(--neg);color:#fff;font:600 10px/1 "IBM Plex Mono",monospace}

/* the view row: tabs and the view's controls */
.vrow{display:flex;align-items:center;gap:10px;min-height:54px;margin:0 36px;border-bottom:1px solid var(--rule-soft)}
.vtabs{display:flex;align-items:center;gap:2px;margin-right:auto}
.vtabs a{display:flex;align-items:center;gap:7px;height:34px;padding:0 13px;border-radius:7px;color:var(--ink-2);font-size:13.5px;font-weight:500;white-space:nowrap}
.vtabs a.on{background:var(--ink);color:var(--ground)}
.cnt{font:600 10.5px/1 "IBM Plex Mono",monospace;color:var(--warn)}
.vtabs a.on .cnt{color:var(--ground);opacity:.75}
.ctls{display:flex;align-items:center;gap:10px}
.scope{display:flex;align-items:center;gap:10px;height:36px;padding:0 12px;border:1px solid var(--rule);border-radius:8px;background:var(--surface);font-size:13px;font-weight:500;white-space:nowrap;min-width:210px}
.scope .i{width:15px;height:15px;color:var(--ink-3)}
.scope .i:last-child{margin-left:auto;color:var(--ink)}
.seg{display:inline-flex;gap:2px;padding:3px;border:1px solid var(--rule);border-radius:8px;background:var(--surface)}
.seg a{display:flex;align-items:center;justify-content:center;height:28px;padding:0 10px;border-radius:5px;font-size:12.5px;color:var(--ink-2);white-space:nowrap}
.seg a.on{background:var(--ink);color:var(--ground)}

/* a page's content column */
.pg{padding:22px 36px 40px}

/* Imports: the focused change */
.ic-card{border:1px solid var(--rule);border-radius:12px;background:var(--surface);overflow:hidden}
.ic-h{display:flex;align-items:center;gap:12px;padding:22px 22px 0}
.ic-h h2{margin:0;font-size:21px;font-weight:700;letter-spacing:-.01em;white-space:nowrap}
.ic-h .meta{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-2);white-space:nowrap}
.ic-h .x{margin-left:auto;width:30px;height:30px;border-radius:50%;border:1px solid var(--rule);display:grid;place-items:center}
.ic-h .x .i{width:13px;height:13px}
.step{display:flex;align-items:center;gap:12px;padding:22px 22px 0;font-weight:600;font-size:15px}
.step b{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--ink);color:var(--ground);font:600 11px/1 "IBM Plex Mono",monospace}
.amt{display:flex;align-items:center;gap:18px;padding:16px 22px 0}
.amt .was{font:400 26px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.amt .i{color:var(--ink-2)}
.amt .box{display:flex;align-items:baseline;justify-content:flex-end;gap:6px;width:240px;height:60px;padding:14px 14px 0;border:1.5px solid var(--accent);border-radius:8px}
.amt .box b{font:500 32px/1 "IBM Plex Mono",monospace}
.amt .box small{font-size:12px;color:var(--ink-2)}
.scale{position:relative;height:84px;margin:0 22px}
.scale .trk{position:absolute;left:0;right:0;top:44px;height:8px;border-radius:4px;background:var(--rule-soft)}
.scale .now{position:absolute;left:0;top:44px;height:8px;border-radius:4px 0 0 4px;background:#9aa0a0}
.scale .pl{position:absolute;top:44px;height:8px;background:var(--accent)}
.scale .mk{position:absolute;top:36px;width:1.5px;height:24px;background:var(--ink-2)}
.scale .lb{position:absolute;transform:translateX(-50%);text-align:center;font:400 10.5px/1.25 "IBM Plex Mono",monospace;color:var(--ink-2)}
.scale .lb.w{color:var(--warn)}
.scale .lb.g{color:var(--accent)}
.ic-f{display:flex;gap:22px;padding:14px 22px 14px;margin-top:10px;border-top:1px solid var(--rule-soft);background:var(--ground);font-size:12.5px;color:var(--ink-2)}
.dark .ic-f{background:#111513}
.ic-f span{display:flex;align-items:center;gap:6px;text-decoration:underline;text-underline-offset:3px}
.ic-f .i{width:13px;height:13px}

/* Imports: depot tables */
.depot{margin-top:22px;padding-top:20px;border-top:1px solid var(--rule)}
.dh{display:grid;grid-template-columns:52px minmax(0,1fr) auto;align-items:start;gap:0}
.dh .ico{width:34px;height:34px;border-radius:50%;background:var(--raised);display:grid;place-items:center;color:var(--ink-2);margin-top:2px}
.dh .ico .i{width:15px;height:15px}
.dh .nm{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600}
.dh .sub{display:flex;gap:16px;margin-top:6px;font-size:12px;font-style:italic;color:var(--ink-2)}
.dh .sub span{display:flex;align-items:center;gap:4px}
.dh .sub .i{width:12px;height:12px}
.dh .st{display:flex;align-items:center;gap:22px}
.dh .st div{text-align:right}
.dh .st small{display:block;font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;color:var(--ink-2)}
.dh .st b{display:block;margin-top:6px;font:500 16px/1 "IBM Plex Mono",monospace}
.dh .st .ch{font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--warn)}
.dh .st .cv{width:26px;height:26px;border-radius:50%;border:1px solid var(--rule);display:grid;place-items:center}
.dh .st .cv .i{width:12px;height:12px}
.tbl{margin:14px 0 0 52px}
.tr{display:grid;grid-template-columns:32px minmax(150px,1.5fr) 72px 88px 70px 128px minmax(190px,1.4fr) 84px 96px;align-items:center;gap:0 12px;min-height:58px;padding:0 0 0 6px;border-bottom:1px solid var(--rule-soft)}
.tr.hd{white-space:nowrap;min-height:36px;font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;color:var(--ink-2);border-bottom:1px solid var(--rule)}
.tr.sel{background:var(--accent-soft);box-shadow:inset 3px 0 0 var(--accent)}
.tr .r{text-align:right}
.tr .n{font:400 13.5px/1 "IBM Plex Mono",monospace}
.tr .rad{width:20px;height:20px;border-radius:50%;border:1.5px solid var(--ink-3)}
.tr .pn{font-size:14px}
.tr .pn small{display:block;font-size:11.5px;color:var(--ink-2)}
.rv{display:inline-block;margin-left:6px;padding:2px 7px;border:1px solid var(--rule);border-radius:10px;font:500 10.5px/1.2 "IBM Plex Mono",monospace;color:var(--ink-2);vertical-align:1px}
.cov{display:flex;gap:3px;align-items:flex-end;height:16px;position:relative}
.cov i{width:13px;height:5px;border-radius:2px;background:var(--rule)}
.cov i.f{background:var(--accent)}
.cov i.s{background:repeating-linear-gradient(135deg,var(--neg) 0 3px,transparent 3px 5px)}
.cov .t{position:absolute;top:-4px;width:12px;height:12px;color:var(--ink)}
.ord{display:flex;align-items:center;justify-content:flex-end;gap:7px;font:400 13px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.ord .in{width:86px;height:30px;border:1px solid var(--rule);border-radius:6px;background:var(--surface);display:flex;align-items:center;justify-content:flex-end;padding:0 8px;color:var(--ink);font-size:13.5px}
.ord .in.g{border-color:var(--accent);color:var(--accent);border-width:1.5px}
.ord small{white-space:nowrap;font:400 10.5px/1 Archivo,sans-serif}
.ord .res{white-space:nowrap;padding:3px 6px;border-radius:4px;background:#cc2a201a;color:var(--neg);font-size:11px}
.us{text-decoration:underline dotted;text-underline-offset:3px}
.pill{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:4px;font:500 11px/1 "IBM Plex Mono",monospace;background:#cc2a201a;color:var(--neg);white-space:nowrap}
.pill .i{width:11px;height:11px}
.pill.o{background:none;border:1px solid var(--neg)}
.tr2{grid-template-columns:32px minmax(150px,1fr) 110px 150px;min-height:44px}

/* Overview */
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-bottom:1px solid var(--rule-soft)}
.kpi{padding:6px 18px 16px 0;margin-right:18px;border-right:1px solid var(--rule-soft)}
.kpi:last-child{border-right:0;margin-right:0}
.kpi .lab{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.14em;color:var(--ink-2)}
.kpi .v{margin-top:10px;font:500 28px/1.05 "IBM Plex Mono",monospace;letter-spacing:-.02em}
.kpi .v.neg{color:var(--neg)}
.kpi .d{display:flex;gap:10px;align-items:center;margin-top:8px;font:400 11px/1.3 "IBM Plex Mono",monospace;color:var(--ink-2);white-space:nowrap;overflow:hidden}
.kpi .d .c{padding:2px 6px;border-radius:3px;background:var(--chipbg)}
.kpi .d .c.n{background:#cc2a201a;color:var(--neg)}
.kpi svg{display:block;width:100%;height:28px;margin-top:10px}
.kpi svg polyline{fill:none;stroke-width:1.5;stroke-linejoin:round}
.na-h{display:flex;align-items:center;gap:12px;margin-top:26px}
.na-h h2{margin:0;font-size:26px;font-weight:700;letter-spacing:-.02em}
.qm{width:18px;height:18px;border-radius:50%;border:1px solid var(--rule);display:grid;place-items:center;font:500 10px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.sev{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 11px;border:1px solid var(--ink-3);border-radius:6px;font:500 12px/1 "IBM Plex Mono",monospace}
.sev b{width:7px;height:7px;border-radius:50%}
.cust{margin-left:auto;display:flex;align-items:center;gap:7px;height:30px;padding:0 11px;border:1px solid var(--rule);border-radius:6px;background:var(--surface);font-size:12px;font-weight:600}
.cust .i{width:14px;height:14px}
.grp{margin-top:18px;font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em}
.fr{display:grid;grid-template-columns:24px minmax(0,1fr) auto auto auto;align-items:center;gap:0 14px;min-height:64px;padding:10px 0;border-bottom:1px solid var(--rule-soft)}
.fr .sd{width:10px;height:10px;border-radius:50%;background:var(--neg);box-shadow:0 0 0 4px #cc2a2022}
.fr .sd.w{background:var(--warn);box-shadow:none}
.fr .l1{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;white-space:nowrap}
.fr .pl{font-size:13px;color:var(--ink-2)}
.fr .hl{font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis}
.fr .l2{margin-top:4px;font-size:12.5px;color:var(--ink-2)}
.ev{display:grid;grid-template-columns:auto 58px 58px;gap:5px 10px;align-items:center;font-size:11.5px;color:var(--ink-2)}
.ev .bar{height:5px;border-radius:3px;background:var(--rule-soft);position:relative}
.ev .bar i{position:absolute;left:0;top:0;bottom:0;border-radius:3px}
.ev .v{font:400 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink);text-align:right}
.det{display:flex;align-items:center;gap:6px;height:30px;padding:0 10px;border:1px solid var(--rule);border-radius:6px;background:var(--surface);font-size:12px;font-weight:500}
.det .i{width:12px;height:12px}
.board .act{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:148px;height:34px;padding:0 12px;border-radius:6px;background:var(--accent);color:var(--on-accent);font-size:12.5px;font-weight:600;white-space:nowrap}
.act .i{width:13px;height:13px}
.board .lnk{display:flex;align-items:center;gap:8px;color:var(--accent);font-size:12.5px;font-weight:600;white-space:nowrap}
.lnk .i{width:13px;height:13px}
.more{display:inline-flex;align-items:center;gap:7px;margin-top:12px;height:30px;padding:0 11px;border:1px solid var(--rule);border-radius:6px;background:var(--surface);font-size:12px;font-weight:600}
.more .i{width:12px;height:12px}
.fine{margin-top:10px;font-size:12px;color:var(--ink-2)}
.fine u{text-underline-offset:3px}
.tools-h{margin:34px 0 14px;font-size:19px;font-weight:700}
.tools{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.tool{border:1px solid var(--rule);border-radius:12px;background:var(--surface);padding:18px 16px 10px}
.tool .th{display:flex;align-items:center;gap:8px;height:48px;font-size:15px;font-weight:600}
.tool .th .i{width:15px;height:15px;color:var(--accent)}
.tool .th svg.pic{margin-left:auto;width:96px;height:44px}
.tool a{display:flex;align-items:center;gap:8px;min-height:37px;padding:4px 0;line-height:1.25;border-bottom:1px solid var(--rule-soft);font-size:13px;font-weight:500}
.tool a:last-child{border-bottom:0}
.tool a .i{width:13px;height:13px;margin-left:8px;color:var(--ink-2)}
.tool a .c{margin-left:auto;white-space:nowrap;flex:none;font:600 9.5px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;padding:3px 6px;border-radius:8px;background:var(--chipbg);color:var(--ink-2)}
.tool a .c.w{background:#b34d001a;color:var(--warn)}
.tool a .c.g{background:var(--accent-soft);color:var(--accent)}
.tool a .c+.i{margin-left:8px}
.tool a span.fill{margin-left:auto}

/* ---- sidebar shells ---------------------------------------------------- */
.app{display:grid;grid-template-columns:var(--sw) minmax(0,1fr);height:100%}
.side{position:relative;border-right:1px solid var(--rule);background:var(--ground)}
.sin{position:relative;height:900px;display:flex;flex-direction:column;padding:22px 14px 16px}
.shead{position:relative;display:flex;align-items:baseline;gap:3px;padding:6px 8px 0;height:62px;border-bottom:1px solid var(--rule)}
.shead .wordmark{font-size:21px;max-width:calc(var(--sw) - 64px)}
.shead .orb{right:4px;top:28px;width:34px;height:34px}
.sk{display:flex;align-items:center;gap:9px;height:36px;margin:14px 0 6px;padding:0 10px;border:1px solid var(--rule);border-radius:8px;background:var(--surface);font-size:13px;color:var(--ink-2);position:relative}
.sk .i{width:15px;height:15px}
.sk kbd{margin-left:auto;font:500 10px/1 "IBM Plex Mono",monospace;padding:3px 5px;border:1px solid var(--rule);border-radius:4px;color:var(--ink-3)}
.sk .new{margin-left:2px}
.snav{display:flex;flex-direction:column;gap:1px;margin-top:8px}
.snav a.m{display:flex;align-items:center;gap:10px;height:38px;padding:0 10px;border-radius:8px;color:var(--ink-2);font-size:14px;font-weight:500}
.snav a.m .i{width:18px;height:18px}
.snav a.m.on{background:var(--surface);color:var(--ink);box-shadow:inset 3px 0 0 var(--accent)}
.snav a.m.open{color:var(--ink)}
.snav a.m .bad,.snav a.m .cv{margin-left:auto}
.snav a.m .cv{width:13px;height:13px;color:var(--ink-3)}
.snav .subs{display:flex;flex-direction:column;gap:1px;margin:2px 0 6px 19px;padding-left:12px;border-left:1px solid var(--rule)}
.snav .subs a{display:flex;align-items:center;gap:8px;height:31px;padding:0 10px;border-radius:6px;color:var(--ink-2);font-size:13.5px;font-weight:500}
.snav .subs a .cnt{margin-left:auto}
.snav .subs a.on{background:var(--ink);color:var(--ground)}
.snav .subs a.on .cnt{color:var(--ground);opacity:.75}
.sctl{display:flex;flex-direction:column;gap:7px;margin:5px 0 6px 0;padding:10px;border:1px solid var(--rule);border-radius:9px;background:var(--surface)}
.sctl .scope{min-width:0;height:32px;background:var(--ground);font-size:12.5px}
.sctl .seg{display:grid;grid-template-columns:1fr 1fr;background:var(--ground)}
.sctl .seg a{height:26px;padding:0 6px;font-size:12px}
.sref{display:flex;flex-direction:column;gap:1px;margin-top:12px;padding-top:12px;border-top:1px solid var(--rule-soft)}
.sref a{display:flex;align-items:center;gap:10px;height:34px;padding:0 10px;border-radius:8px;color:var(--ink-2);font-size:13.5px}
.sref a .i{width:17px;height:17px}
.sref a .new{margin-left:auto}
.sfoot{margin-top:auto;padding-top:14px;border-top:1px solid var(--rule)}
.sfoot .clock{text-align:left;padding:0 8px}
.sfoot .clock b{font-size:14.5px}
.sfoot .row{display:flex;gap:8px;margin-top:12px}
.sfoot .row .tb{flex:1}
.sfoot .src{display:flex;align-items:center;gap:7px;margin:10px 8px 0;font:400 10.5px/1.3 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sfoot .src b{width:6px;height:6px;border-radius:50%;background:var(--accent);flex:none}
.cbar{display:flex;align-items:center;gap:10px;min-height:58px;margin:0 36px;border-bottom:1px solid var(--rule-soft)}
.main .news{padding:0 36px}
.app .scope{min-width:180px}
.menu{left:244px;bottom:14px}
.narrow .vrow{flex-wrap:wrap;padding:8px 0;row-gap:8px}
.narrow .vrow .ctls{margin-left:auto}
.narrow .tr{grid-template-columns:28px minmax(120px,1.3fr) 64px 76px 62px 118px minmax(150px,1.2fr) 82px 84px;gap:0 10px}
.narrow .tr2{grid-template-columns:28px minmax(120px,1fr) 110px 150px}

/* the merged menu, drawn open */
.menu{position:absolute;z-index:20;width:286px;padding:6px;border-radius:12px;background:var(--surface);border:1px solid var(--rule);box-shadow:0 20px 50px #15181a2e}
.menu .lab{display:block;padding:10px 10px 5px;font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;color:var(--ink-3)}
.menu a{display:flex;align-items:center;gap:10px;min-height:38px;padding:0 10px;border-radius:8px;font-size:13.5px;font-weight:500}
.menu a .i{width:16px;height:16px;color:var(--ink-2)}
.menu a.hi{background:var(--raised)}
.menu .stat{padding:8px 10px 10px;font-size:12px;color:var(--ink-2);border-bottom:1px solid var(--rule-soft)}
.menu .stat b{font-weight:600;color:var(--ink)}
.menu hr{border:0;border-top:1px solid var(--rule-soft);margin:6px 4px}
.menu a small{margin-left:auto;color:var(--ink-3)}
.sfoot .ib.open{border-color:var(--ink);box-shadow:0 0 0 2px var(--accent-soft)}

/* the rail: B at 1100 px */
.rail .sin{padding:18px 10px 14px;align-items:center}
.rail .rhead{position:relative;width:44px;height:58px;border-bottom:1px solid var(--rule);display:flex;justify-content:center}
.rail .rhead .orb{position:relative;width:34px;height:34px;display:block}
.rail a.ri{position:relative;display:grid;place-items:center;width:44px;height:42px;border-radius:9px;color:var(--ink-2)}
.rail a.ri .i{width:19px;height:19px}
.rail a.ri.on{background:var(--surface);color:var(--ink);box-shadow:inset 3px 0 0 var(--accent)}
.rail a.ri .bad{position:absolute;top:3px;right:1px;min-width:15px;height:15px;font-size:9px;padding:0 4px}
.rail a.ri .nd{position:absolute;top:8px;right:8px;width:7px;height:7px;border-radius:50%;background:var(--accent)}
.rail .grp{display:flex;flex-direction:column;gap:3px;margin-top:10px}
.rail .grp.sep{padding-top:10px;border-top:1px solid var(--rule-soft)}
.rail .rclock{margin-top:auto;padding-top:12px;border-top:1px solid var(--rule);text-align:center;font:500 12px/1.3 "IBM Plex Mono",monospace}
.rail .rclock small{display:block;font-size:9.5px;color:var(--ink-3)}
.rail .rfoot{display:flex;flex-direction:column;gap:6px;margin-top:10px}
"""

# --------------------------------------------------------------------------
# synthetic company: QA Expanded Co.
# --------------------------------------------------------------------------
CO = "QA Expanded Co."
AREAS = [("overview", "Overview", "sun"), ("businesses", "Businesses", "bldg"), ("supply", "Supply", "box"),
         ("staffing", "Staffing", "people"), ("expansion", "Expansion", "trend")]
VIEWS = {
    "businesses": [("Results", ""), ("Products &amp; prices", ""), ("Standards", "11"), ("Milestones", "")],
    "supply": [("Changes", "14"), ("Imports", "7"), ("Deliveries", "1"), ("Production", "6"), ("Goods flow", "")],
    "staffing": [("Schedules", "2"), ("Staff needs", "1"), ("Payroll", "")],
    "expansion": [("Demand", ""), ("Find a location", ""), ("Plan a factory", "")],
}


def news() -> str:
    return ('<div class="news"><b class="d"></b><strong>New</strong><span>Big Copilot Link 0.2.0 lets the board make changes in your game: '
            'set uniforms, apply import amounts and write staffing plans, with a preview and one-step undo.</span>'
            f'<a href="#">Get the mod on the Steam Workshop</a><span class="x">{ic("x")}</span></div>')


def clock() -> str:
    return '<div class="clock"><b>Day 47<i>·</i>Fri 14:30</b><small>YEAR 1</small></div>'


def vtabs(active: str) -> str:
    out = []
    for name, n in VIEWS["supply"]:
        c = f'<span class="cnt">{n}</span>' if n else ""
        out.append(f'<a class="{"on" if name == active else ""}" href="#">{name}{c}</a>')
    return f'<nav class="vtabs">{"".join(out)}</nav>'


def controls() -> str:
    return (f'<div class="ctls"><span class="scope">{ic("bldg")}Whole company{ic("chevd")}</span>'
            '<span class="seg"><a class="on">Needs a change</a><a>Everything</a></span>'
            '<span class="seg"><a class="on">Full production</a><a>Shop demand</a></span></div>')


# --------------------------------------------------------------------------
# content: Supply › Imports
# --------------------------------------------------------------------------
def cov(cells: str, truck: int | None = None) -> str:
    cls = {"f": "f", "s": "s", "e": ""}
    out = "".join(f'<i class="{cls[c]}"></i>' for c in cells)
    t = f'<svg class="i t" viewBox="0 0 24 24" style="left:{truck * 16}px">{_P["truck"]}</svg>' if truck is not None else ""
    return f'<div class="cov">{out}{t}</div>'


def depot(name: str, sub: str, feeds: str, floor: str, uses: str, changes: str, rows: str, hood: str = "IC") -> str:
    return f"""
<section class="depot">
  <div class="dh">
    <span class="ico">{ic("box")}</span>
    <div><div class="nm"><span class="hood">{hood}</span>{name}<span class="mapb">{ic("mapsm")}</span></div>
      <div class="sub"><span>{ic("truck")}{sub}</span><span>{ic("go")}{feeds}</span></div></div>
    <div class="st"><div><small>ON THE FLOOR</small><b>{floor}</b></div><div><small>USES / WEEK</small><b>{uses}</b></div>
      <span class="ch">{changes}</span><span class="cv">{ic("chevd")}</span></div>
  </div>
  <div class="tbl">
    <div class="tr hd"><span></span><span>PRODUCT</span><span class="r">ON HAND</span><span class="r">DRAW / DAY</span><span class="r">BUSIEST</span><span>COVER</span><span class="r">ORDER / TOP-UP</span><span class="r">USES / WEEK</span><span>STATUS</span></div>
    {rows}
  </div>
</section>"""


def imports_body() -> str:
    card = f"""
<article class="ic-card">
  <div class="ic-h"><span class="hood">IC</span><h2>Gift (Cheap) · HART. Overflow Depot</h2>
    <span class="meta">{ic("truck")}Fixed weekly amount from 1 Pier, delivered Monday</span><span class="x">{ic("x")}</span></div>
  <div class="step"><b>1</b>Prevent the recurring shortage</div>
  <div class="amt"><span class="was">100</span>{ic("go")}<span class="box"><b>650</b><small>a week</small></span></div>
  <div class="scale">
    <span class="trk"></span><span class="now" style="width:14.3%"></span><span class="pl" style="left:14.3%;width:78.6%"></span>
    <span class="mk" style="left:14.3%"></span><span class="mk" style="left:79%;background:var(--warn)"></span><span class="mk" style="left:92.9%;background:var(--accent)"></span>
    <span class="lb" style="left:14.3%;top:10px">order now<br>100</span>
    <span class="lb w" style="left:79%;top:10px">today's draw<br>560</span>
    <span class="lb g" style="left:92.9%;top:62px">planned 650</span>
  </div>
  <div class="ic-f"><span>{ic("why")}Why this amount?</span><span>{ic("list")}Manual instructions</span><span>{ic("copy")}Copy the change</span><span>{ic("route")}Follow its supply route</span></div>
</article>"""
    hub_rows = f"""
    <div class="tr"><span class="rad"></span><span class="pn">Umbrella<span class="rv">Review</span><small>200 arrived last week</small></span><span class="r n">20</span><span class="r n">20</span><span class="r n">Sat 23</span>{cov("feeeeee")}
      <span class="ord"><span class="in">200</span><small>a week</small><span class="res">resume import</span></span><span class="r n us">140</span><span><span class="pill">{ic("pause")}paused</span></span></div>
    <div class="tr sel"><span class="rad"></span><span class="pn">Gift (Cheap)<span class="rv">Review</span><small>100 arrived last week</small></span><span class="r n">100</span><span class="r n">80</span><span class="r n">Sat 91</span>{cov("fssffff", 3)}
      <span class="ord">100 {ic("go")}<span class="in g">650</span><small>a week</small></span><span class="r n us">560</span><span><span class="pill">{ic("down")}short</span></span></div>"""
    water = f"""
    <div class="tr"><span class="rad"></span><span class="pn">Water<span class="rv">Review</span><small>3,000 arrived last week</small></span><span class="r n">1,500</span><span class="r n">400</span><span class="r n">400</span>{cov("fffffff", 3)}
      <span class="ord">3,000 {ic("go")}<span class="in g">16800</span><small>a week</small></span><span class="r n us">16,800</span><span><span class="pill">{ic("down")}short</span></span></div>"""
    nodepot = "".join(
        f'<div class="tr tr2"><span class="rad"></span><span class="pn">{p}</span><span class="r n">16,800</span><span><span class="pill o">{ic("warn")}no plan</span></span></div>'
        for p in ("Barley", "Carbon Dioxide", "Hops", "Yeast"))
    none = f"""
<section class="depot">
  <div class="dh"><span class="ico">{ic("box")}</span>
    <div><div class="nm">No depot</div><div class="sub"><span>factory inputs no depot imports or tops up</span></div></div>
    <div class="st"><span class="ch">4 changes to type</span><span class="cv">{ic("chevd")}</span></div></div>
  <div class="tbl"><div class="tr tr2 hd"><span></span><span>PRODUCT</span><span class="r">USES / WEEK</span><span>STATUS</span></div>{nodepot}</div>
</section>"""
    return (card + depot("HART. Overflow Depot", "weekly from 1 Pier, Monday", "feeds 1 site", "120", "700", "2 changes to type", hub_rows)
            + depot("HART. Hub", "weekly from 1 Pier, Monday", "feeds 1 site", "11,500", "16,800", "1 change to type", water) + none)


# --------------------------------------------------------------------------
# content: Overview
# --------------------------------------------------------------------------
def spark(vals: list[float], color: str, fill: str) -> str:
    lo, hi = min(vals), max(vals)
    n = len(vals) - 1
    pts = " ".join(f"{i * 300 / n:.1f},{26 - (v - lo) / ((hi - lo) or 1) * 20:.1f}" for i, v in enumerate(vals))
    return (f'<svg viewBox="0 0 300 28" preserveAspectRatio="none" aria-hidden="true">'
            f'<polygon points="0,28 {pts} 300,28" fill="{fill}"></polygon><polyline points="{pts}" stroke="{color}"></polyline></svg>')


def finding(place: str, hood: str, head: str, sub: str, action: str, ev: tuple | None = None, details: bool = True) -> str:
    evh = ""
    if ev:
        a, b = ev
        evh = (f'<div class="ev"><span>Ordered a week</span><span class="bar"><i style="width:{a * 100 // b if b else 0}%;min-width:8px;background:var(--ink-2)"></i></span><span class="v">{a:,}</span>'
               f'<span>Used a week</span><span class="bar"><i style="width:100%;background:var(--warn)"></i></span><span class="v">{b:,}</span></div>')
    det = f'<span class="det">Details{ic("chevd")}</span>' if details else "<span></span>"
    return (f'<div class="fr"><span class="sd"></span><div><div class="l1"><span class="hood">{hood}</span><span class="pl">{place}</span>'
            f'<span class="mapb">{ic("mapsm")}</span><span class="hl">{head}</span></div><div class="l2">{sub}</div></div>'
            f'{evh or "<span></span>"}{det}<a class="act" href="#">{action}{ic("go")}</a></div>')


def warning(place: str, hood: str, head: str, action: str) -> str:
    return (f'<div class="fr" style="min-height:50px"><span class="sd w"></span><div><div class="l1"><span class="hood">{hood}</span><span class="pl">{place}</span>'
            f'<span class="mapb">{ic("mapsm")}</span><span class="hl" style="font-size:14px">{head}</span></div></div><span></span><span></span>'
            f'<a class="lnk" href="#">{action}{ic("go")}</a></div>')


def tool_pic(kind: str) -> str:
    if kind == "supply":
        return ('<svg class="pic" viewBox="0 0 96 44"><circle cx="10" cy="22" r="6" fill="none" stroke="var(--ink-3)"></circle>'
                '<path d="M17 22h14" stroke="var(--ink-3)" stroke-dasharray="3 3"></path><rect x="32" y="12" width="20" height="20" rx="3" fill="none" stroke="var(--accent)" stroke-width="1.6"></rect>'
                '<path d="M52 22c8 0 8-12 18-12M52 22c8 0 8 12 18 12" fill="none" stroke="var(--accent)" stroke-width="1.6"></path>'
                '<rect x="72" y="4" width="14" height="12" rx="2" fill="none" stroke="var(--ink-3)"></rect><rect x="72" y="28" width="14" height="12" rx="2" fill="none" stroke="var(--ink-3)"></rect></svg>')
    if kind == "staffing":
        cells = "".join(f'<rect x="{2 + c * 7.5}" y="{4 + r * 7.5}" width="6" height="6" rx="1" fill="{"none" if (r == 4 and c in (9, 10, 11)) else "var(--accent)"}" stroke="{"var(--neg)" if (r == 4 and c in (9, 10, 11)) else "none"}" stroke-dasharray="2 1"></rect>'
                        for r in range(5) for c in range(12))
        return f'<svg class="pic" viewBox="0 0 96 44">{cells}</svg>'
    if kind == "businesses":
        return ('<svg class="pic" viewBox="0 0 96 44"><rect x="20" y="18" width="11" height="24" fill="var(--accent)"></rect><rect x="38" y="24" width="11" height="18" fill="var(--accent)"></rect>'
                '<rect x="56" y="12" width="11" height="30" fill="var(--accent)"></rect><rect x="74" y="32" width="11" height="10" fill="var(--accent)"></rect><rect x="82" y="36" width="10" height="6" rx="2" fill="var(--neg)"></rect>'
                '<circle cx="25" cy="10" r="2.2" fill="var(--accent)"></circle><circle cx="43" cy="16" r="2.2" fill="var(--accent)"></circle><circle cx="61" cy="5" r="2.2" fill="var(--accent)"></circle></svg>')
    return ('<svg class="pic" viewBox="0 0 96 44"><rect x="26" y="8" width="66" height="34" fill="var(--raised)" stroke="var(--ink-2)"></rect><path d="M60 8v14h32" fill="none" stroke="var(--ink-2)"></path>'
            '<path d="M14 18s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z" fill="var(--accent)"></path><circle cx="14" cy="8" r="2" fill="var(--surface)"></circle></svg>')


def tool(area: str, label: str, icon: str, items: list[tuple[str, str, str]]) -> str:
    rows = []
    for t, c, k in items:
        badge = f'<span class="c {k}">{c}</span>' if c else '<span class="fill"></span>'
        rows.append(f'<a href="#">{t}{badge}{ic("go")}</a>')
    rows = "".join(rows)
    return f'<div class="tool"><div class="th">{ic(icon)}{label}{tool_pic(area)}</div>{rows}</div>'


def overview_body() -> str:
    kpis = f"""
<div class="kpis">
  <div class="kpi"><div class="lab">PROFIT YESTERDAY</div><div class="v neg">-$628</div><div class="d"><span class="c n">−31%</span>vs 7-day</div>{spark([5, 3, 6, 4, 3, 5, 4, 6, 5, 3, 5, 7, 5, 4, 5], "var(--neg)", "#cc2a2014")}</div>
  <div class="kpi"><div class="lab">REVENUE YESTERDAY</div><div class="v">$6,164</div><div class="d"><span class="c">270</span>customers</div>{spark([4, 6, 3, 4, 5, 7, 4, 5, 6, 7, 5, 8, 4, 5, 6], "var(--accent)", "#00703a14")}</div>
  <div class="kpi"><div class="lab">CASH ON HAND</div><div class="v">$25,560</div><div class="d"><span class="c">-$3k profit</span>$30k owed on loans</div>{spark([5, 5, 5, 5, 5], "var(--accent)", "transparent")}</div>
  <div class="kpi"><div class="lab">FIXED COST / DAY</div><div class="v">$3,808</div><div class="d"><span class="c">rent $2k</span>payroll $1k</div>{spark([5, 5, 5, 5, 5], "var(--accent)", "transparent")}</div>
</div>"""
    crit = "".join([
        finding("HART. New Gifts", "MT", "Opened day 46, not trading yet", "no staff, no prices set, no delivery plan, $150/day rent", "Open readiness", details=False),
        finding("HART. Spirits", "MT", "1 staff with unmet demands", "No weekends for 1 (important); 1 of them has warned they will quit", "Resolve staff demand", details=False),
        finding("HART. Overflow Depot", "IC", "Gift (Cheap) orders 100 a week against a 560 week of use", "460 short. already runs dry on Saturday, 2.8 days before Monday's import", "Review import", (100, 560)),
        finding("HART. Overflow Depot", "IC", "Umbrella import is paused", "1 day left at 20/day", "Review import"),
        finding("HART. Hub", "IC", "Water", "this import needs to cover 16,800 a week and the import order is 3,000; raise it to 16,800", "Review factory input", (3000, 16800)),
        finding("HART. Brewery", "IC", "5 factory inputs are not fed as the machines need", "largest Barley. Barley feeds Beer at 2,400/day but no depot tops it up", "Review factory input"),
        finding("HART. Brewery", "IC", "4 factory machines are not staffed round the clock", "worst Beer at position 2: staffed 0 of 168 hours, nobody on it Mon–Sun 0–24; 1,200 a day not made", "Plan factory hours"),
        finding("HART. Brewery", "IC", "1 machine at Bottled Goods Workstation #3 has no recipe set", "staffed and rented, making nothing", "Identify recipe", details=False),
    ])
    warns = "".join([
        warning("HART. Spirits", "MT", "Customer bathroom has no privacy", "Review amenities"),
        warning("HART. Spirits", "MT", "No music playing for customers", "Review amenities"),
        warning("HART. Spirits", "MT", "Interior design falls short of what customers expect here", "Review amenities"),
        warning("HART. Gifts", "LM", "Customer satisfaction at 64.0%", "Review satisfaction"),
        warning("HART. Gifts", "LM", "No uniform locker installed", "Review uniforms"),
    ])
    tools = "".join([
        tool("supply", "Supply", "box", [("Calculate import amounts", "13 TO CHANGE", "g"), ("Set delivery targets", "2", "w"), ("Plan factory running hours", "5", "w"), ("Trace goods through the company", "", "")]),
        tool("staffing", "Staffing", "people", [("Build shop schedules", "−2 ENTRIES", "g"), ("See whom to hire", "", ""), ("Resolve staff demands", "1", "w")]),
        tool("businesses", "Businesses", "bldg", [("Compare business profits", "", ""), ("Check prices and product sales", "", ""), ("Improve customer satisfaction", "11", "w")]),
        tool("expansion", "Expansion", "trend", [("Find a suitable location", "NONE FREE", ""), ("Plan a new factory", "", ""), ("Explore market demand", "", "")]),
    ])
    return f"""{kpis}
<div class="na-h"><h2>Needs attention</h2><span class="qm">?</span>
  <span class="sev"><b style="background:var(--neg)"></b>8 critical</span><span class="sev"><b style="background:var(--warn)"></b>13 warnings</span><span class="sev"><b style="background:var(--accent)"></b>2 opportunities</span>
  <span class="cust">{ic("prefs")}Customize checks</span></div>
<div class="grp" style="color:var(--neg)">CRITICAL</div>{crit}
<div class="grp" style="color:var(--warn)">WARNINGS</div>{warns}
<div class="grp" style="color:var(--accent)">OPPORTUNITIES</div>
<span class="more">{ic("chevd")}Show 10 more: 8 warnings, 2 opportunities</span>
<div class="fine">3 below the $500/day line · $850/day <u>show</u></div>
<div class="fine" style="margin-top:4px">1 in kinds switched off: Demand wave ending (1, $193/day) <u>show</u></div>
<div class="tools-h">All tools</div><div class="tools">{tools}</div>"""


# --------------------------------------------------------------------------
# the shells
# --------------------------------------------------------------------------
def shell_now(screen: str) -> str:
    active = "supply" if screen == "imports" else "overview"
    areas = "".join(f'<a class="{"on" if k == active else ""}" href="#">{ic(i)}{l}{"<span class=bad>8</span>" if k == "overview" else ""}</a>' for k, l, i in AREAS)
    mast = f"""
<header class="mast"><div class="brand"><span class="wordmark">{CO}</span><span class="dot"></span></div><span class="orb"></span>
  <div class="refs"><a href="#">{ic("map")}City map <span class="new">NEW</span></a><a href="#">{ic("guide")}Game guide <span class="new">NEW</span></a>{ic("more")}</div>
  <span class="ib">{ic("search")}<span class="new">NEW</span></span><span class="tb">Update</span><span class="ib">{ic("more")}</span>{clock()}</header>
<nav class="areas">{areas}</nav>"""
    if screen == "imports":
        return news() + mast + f'<div class="vrow">{vtabs("Imports")}{controls()}</div><div class="pg">{imports_body()}</div>'
    return news() + mast + f'<div class="pg">{overview_body()}</div>'


def side_head(search_new: bool = True) -> str:
    return (f'<div class="shead"><span class="wordmark">{CO}</span><span class="dot"></span><span class="orb"></span></div>'
            f'<div class="sk">{ic("search")}Search{"<span class=new>NEW</span>" if search_new else ""}<kbd>Ctrl K</kbd></div>')


def side_refs() -> str:
    return (f'<div class="sref"><a href="#">{ic("map")}City map<span class="new">NEW</span></a>'
            f'<a href="#">{ic("guide")}Game guide<span class="new">NEW</span></a></div>')


def side_foot(menu_open: bool = False) -> str:
    return (f'<div class="sfoot">{clock()}<div class="src"><b></b>Save folder · saved 16:25</div>'
            f'<div class="row"><span class="tb">{ic("refresh")}Update</span><span class="ib{" open" if menu_open else ""}">{ic("more")}</span></div></div>')


MENU = f"""
<div class="menu">
  <span class="lab">SAVE SOURCE</span>
  <div class="stat"><b>One save file</b> · expanded saved 27 Sept, 16:25</div>
  <a href="#">{ic("folder")}Choose save folder</a>
  <a href="#">{ic("game")}Link to the game<span class="new" style="margin-left:6px">NEW</span></a>
  <a href="#">{ic("file")}Open one save file</a>
  <a href="#">{ic("help")}Where is my save?</a>
  <hr>
  <a href="#">{ic("list")}What's new</a>
  <a href="#" class="hi">{ic("prefs")}Preferences</a>
  <a href="#">{ic("help")}Help &amp; feedback</a>
</div>"""


def side_nav(active: str, nested: bool, view: str = "", ctl: bool = False) -> str:
    out = []
    for k, l, i in AREAS:
        bad = '<span class="bad">8</span>' if k == "overview" else ""
        if nested and k in VIEWS:
            is_open = k == active
            cv = "" if is_open else ic("chev", "i cv")
            out.append(f'<a class="m{" open" if is_open else ""}" href="#">{ic(i)}{l}{bad}{cv}</a>')
            if is_open:
                subs = []
                for name, n in VIEWS[k]:
                    c = f'<span class="cnt">{n}</span>' if n else ""
                    subs.append(f'<a class="{"on" if name == view else ""}" href="#">{name}{c}</a>')
                    if ctl and name == view:
                        subs.append(f'<div class="sctl"><span class="scope">{ic("bldg")}Whole company{ic("chevd")}</span>'
                                    '<span class="seg"><a class="on">Needs a change</a><a>Everything</a></span>'
                                    '<span class="seg"><a class="on">Full production</a><a>Shop demand</a></span></div>')
                out.append(f'<div class="subs">{"".join(subs)}</div>')
        else:
            out.append(f'<a class="m{" on" if k == active else ""}" href="#">{ic(i)}{l}{bad}</a>')
    return f'<nav class="snav">{"".join(out)}</nav>'


def shell_side(variant: str, screen: str, menu_open: bool = False) -> str:
    active = "supply" if screen == "imports" else "overview"
    nested = variant in ("B", "C")
    sw = {"A": 240, "B": 256, "C": 280}[variant]
    side = (f'<aside class="side"><div class="sin">{side_head()}'
            f'{side_nav(active, nested, "Imports" if screen == "imports" else "", ctl=variant == "C")}{side_refs()}{side_foot(menu_open)}{MENU if menu_open else ""}</div></aside>')
    if screen == "imports":
        top = {"A": f'<div class="vrow">{vtabs("Imports")}{controls()}</div>',
               "B": f'<div class="cbar">{controls()}</div>', "C": ""}[variant]
        body = top + f'<div class="pg">{imports_body()}</div>'
    else:
        body = f'<div class="pg">{overview_body()}</div>'
    return f'<div class="app" style="--sw:{sw}px">{side}<main class="main">{news()}{body}</main></div>'


def shell_rail(screen: str) -> str:
    items = "".join(f'<a class="ri{" on" if k == "supply" else ""}" href="#" aria-label="{l}">{ic(i)}{"<span class=bad>8</span>" if k == "overview" else ""}</a>' for k, l, i in AREAS)
    side = f"""<aside class="side rail"><div class="sin">
  <div class="rhead"><span class="orb"></span></div>
  <div class="grp"><a class="ri" href="#" aria-label="Search">{ic("search")}<span class="nd"></span></a></div>
  <div class="grp">{items}</div>
  <div class="grp sep"><a class="ri" href="#" aria-label="City map">{ic("map")}<span class="nd"></span></a><a class="ri" href="#" aria-label="Game guide">{ic("guide")}<span class="nd"></span></a></div>
  <div class="rclock">D47<br>14:30<small>YEAR 1</small></div>
  <div class="rfoot"><a class="ri" href="#" aria-label="Update">{ic("refresh")}</a><a class="ri" href="#" aria-label="More">{ic("more")}</a></div>
</div></aside>"""
    body = f'<div class="vrow">{vtabs("Imports")}{controls()}</div><div class="pg">{imports_body()}</div>'
    return f'<div class="app" style="--sw:64px">{side}<main class="main">{news()}{body}</main></div>'


# --------------------------------------------------------------------------
# pages and the canvas
# --------------------------------------------------------------------------
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
<div class="board __THEME__" style="width: __W__px; height: __H__px;">
__BODY__
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='__PROPS__'>
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>
"""

PREVIEW = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>__TITLE__</title>
<link rel="stylesheet" href="__FONTS__"><style>__CSS__</style></head>
<body><div class="board __THEME__" style="width: __W__px; height: __H__px;">
__BODY__
</div></body></html>
"""


def render(tpl: str, title: str, body: str, w: int, h: int, dark: bool) -> str:
    props = json.dumps({"$preview": {"width": w, "height": h}})
    return (tpl.replace("__TITLE__", title).replace("__FONTS__", FONTS.replace("&", "&amp;")).replace("__CSS__", CSS)
            .replace("__THEME__", ("dark" if dark else "light") + (" narrow" if w < 1400 else "")).replace("__W__", str(w)).replace("__H__", str(h))
            .replace("__BODY__", body).replace("__PROPS__", props))


H_IMP, H_OV = 1400, 1720
# (file, title, body, width, height, dark, row, col)
BOARDS = [
    ("Main.dc.html", "Now", shell_now("imports"), 1440, H_IMP, False, 0, 0),
    ("ImportsA.dc.html", "A", shell_side("A", "imports"), 1440, H_IMP, False, 0, 1),
    ("ImportsB.dc.html", "B", shell_side("B", "imports"), 1440, H_IMP, False, 0, 2),
    ("ImportsC.dc.html", "C", shell_side("C", "imports"), 1440, H_IMP, False, 0, 3),
    ("OverviewNow.dc.html", "Now", shell_now("overview"), 1440, H_OV, False, 1, 0),
    ("OverviewA.dc.html", "A", shell_side("A", "overview"), 1440, H_OV, False, 1, 1),
    ("OverviewB.dc.html", "B", shell_side("B", "overview", menu_open=True), 1440, H_OV, False, 1, 2),
    ("OverviewC.dc.html", "C", shell_side("C", "overview"), 1440, H_OV, False, 1, 3),
    ("ImportsB1100.dc.html", "B · 1100", shell_rail("imports"), 1100, H_IMP, False, 2, 0),
    ("ImportsBDark.dc.html", "B · dark", shell_side("B", "imports"), 1440, H_IMP, True, 2, 1),
]


def main() -> None:
    out = HERE / "project"
    out.mkdir(exist_ok=True)
    for old in out.glob("*.dc.html"):
        old.unlink()
    boards, order = {}, []
    heights = {0: H_IMP, 1: H_OV, 2: H_IMP}
    ys, y = {}, 0
    for r in range(3):
        ys[r] = y
        y += heights[r] + 420
    for f, title, body, w, h, dark, row, col in BOARDS:
        (out / f).write_text(render(PAGE, f"Big Copilot · {title}", body, w, h, dark), encoding="utf-8", newline="\n")
        x = col * (1440 + 80) if row < 2 else (0 if col == 0 else 1100 + 80)
        boards[f] = {"x": x, "y": ys[row], "w": w, "h": h, "title": title}
        order.append(f)
    notes = {
        "rowImports": {"x": 0, "y": -300, "text": "Supply › Imports", "kind": "title1", "maxW": 5980},
        "rowOverview": {"x": 0, "y": ys[1] - 300, "text": "Overview", "kind": "title1", "maxW": 5980},
        "rowB": {"x": 0, "y": ys[2] - 300, "text": "B at 1100 px, and dark", "kind": "title1", "maxW": 2620},
    }
    canvas = {"v": 3, "createdOnFiles": {"v": 1, "at": "2026-09-27T12:00:00Z"}, "title": "Big Copilot navigation: sidebar A/B/C",
              "launch": {"view": "canvas"}, "pages": [], "boards": boards, "order": order, "notes": notes, "designSystems": []}
    (out / "canvas.json").write_text(json.dumps(canvas, indent=1), encoding="utf-8", newline="\n")
    if "--preview" in sys.argv:
        pv = HERE / "_preview"
        pv.mkdir(exist_ok=True)
        for f, title, body, w, h, dark, row, col in BOARDS:
            (pv / f.replace(".dc.html", ".html")).write_text(render(PREVIEW, title, body, w, h, dark), encoding="utf-8")
    print(f"wrote {len(BOARDS)} boards")


if __name__ == "__main__":
    main()
