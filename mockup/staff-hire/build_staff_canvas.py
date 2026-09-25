"""Generates the Staff page canvas: project/*.dc.html and project/canvas.json.

Issue #89, reshaped into a mass-hire tool: Company > Staff replaces Payroll. It sums what
every planned site needs per role, moves surplus people first, auto-picks the headhunters'
candidates through Peter's filters, and hires, assigns and schedules them over the Big
Copilot Link mod in one confirm. Decisions and open questions are NOTES.md beside this file.

The board's stylesheet comes from mockup/revamp/build_canvas.py and the write dialog shell
from mockup/write-dialogs/build_write_canvas.py, so the three never drift. Every class added
here carries the hr- prefix (unused on the board today).

Never hand-edit project/: change this and rerun. `--preview` also writes plain HTML copies
into _preview/ (both themes) for screenshots; do not commit _preview/.

The canvas is published at https://claude.ai/artifact/DmH1wQnG58khjVYu4JgimJ.
All names (company, sites, people) are invented. Never put a real save's names here.
"""
from __future__ import annotations

import html
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE / "project"
sys.path.insert(0, str(HERE.parent / "revamp"))
sys.path.insert(0, str(HERE.parent / "write-dialogs"))
sys.path.insert(0, str(HERE.parent / "site-panel"))
from build_canvas import CSS as BOARD_CSS  # noqa: E402
from build_write_canvas import GW_CSS, P as GW_P  # noqa: E402
from build_site_canvas import P as SP_P  # noqa: E402

CREATED_AT = "2026-09-25T09:00:00Z"
FONTS = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"

# --------------------------------------------------------------------------
# the page's own stylesheet, all under hr-
# --------------------------------------------------------------------------
HR_CSS = r"""
.board{--gw-on:#08130d}
.board.light{--gw-on:#ffffff}
.board.hr-page{min-width:0;min-height:0;overflow:hidden}
.hr-i{display:inline-grid;place-items:center}
.hr-i svg{width:15px;height:15px}

/* the page head: Company's views, the title, the link --------------------------- */
.hr-sub{display:flex;align-items:center;gap:12px;margin-top:26px}
.hr-head{display:flex;align-items:flex-end;gap:16px;margin-top:26px}
.hr-head h1{margin:0;font-size:26px;font-weight:600;letter-spacing:-.02em}
.hr-head p{margin:6px 0 0;color:var(--ink-2);font-size:13.5px;max-width:660px;text-wrap:pretty}
.hr-head .aside{margin-left:auto;display:flex;gap:10px;align-items:center}
.hr-linked{display:inline-flex;align-items:center;gap:10px;height:34px;padding:0 12px 0 10px;border-radius:9px;border:1px solid var(--rule);font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink-2);white-space:nowrap}
.hr-linked b{color:var(--ink);font-weight:500}
.hr-linked.off{border-style:dashed;color:var(--ink-3)}
.hr-linked.off .gw-w .a{background:var(--ink-3)}
.hr-tiles{grid-template-columns:repeat(4,minmax(0,1fr))}
.hr-tiles .sstat{position:relative}
.hr-tiles .v small{font-size:12px;color:var(--ink-3);margin-left:6px;letter-spacing:0}
.hr-tiles .note{display:block;margin-top:6px;font-size:12px;color:var(--ink-3)}
.hr-tiles .note.warn{color:var(--warn)}

/* blocks ------------------------------------------------------------------------ */
.hr-block{margin-top:40px}
.hr-ico{width:28px;height:28px;border-radius:8px;background:var(--raised);color:var(--ink-2);display:grid;place-items:center;flex:none}
.hr-ico svg{width:15px;height:15px}
.hr-ico.go{background:var(--accent-soft);color:var(--accent)}

/* moves first ------------------------------------------------------------------- */
.hr-moves{display:flex;flex-direction:column;border-top:1px solid var(--rule)}
.hr-move{display:grid;grid-template-columns:28px minmax(0,.9fr) minmax(0,1.5fr) minmax(0,1fr);gap:16px;align-items:center;padding:12px 6px;border-bottom:1px solid var(--rule-soft);cursor:pointer;transition:background .15s,opacity .25s}
.hr-move:hover{background:var(--surface)}
.hr-move.off{opacity:.45}
.hr-move .what b{font-weight:600;font-size:14px}
.hr-move .what small{display:block;font-size:12px;color:var(--ink-3);margin-top:2px}
.hr-route{display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--ink-2);min-width:0;flex-wrap:wrap}
.hr-route .arr{color:var(--accent);transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.hr-move:hover .hr-route .arr{transform:translateX(4px)}
.hr-move .crew{justify-content:flex-end}
.hr-move .person{padding:4px 10px 4px 4px}
.hr-st{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 8px 0 3px;border-radius:6px;background:var(--ground);border:1px solid var(--rule-soft);font-size:12px;color:var(--ink-2);white-space:nowrap}
.hr-st .hood{height:18px;min-width:22px;font-size:9.5px}
.hr-st b{font:600 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink)}
.hr-new{font:600 9px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--info);border:1px solid color-mix(in srgb,var(--info) 45%,transparent);border-radius:4px;padding:3px 4px}

/* the checkbox -------------------------------------------------------------------- */
.hr-cb{appearance:none;-webkit-appearance:none;margin:0;width:18px;height:18px;border-radius:5px;border:1.5px solid var(--ink-3);background:transparent;display:inline-grid;place-items:center;cursor:pointer;vertical-align:middle;transition:background .15s,border-color .15s}
.hr-cb::after{content:"";width:9px;height:5px;border-left:2px solid var(--gw-on);border-bottom:2px solid var(--gw-on);transform:rotate(-45deg) scale(0);margin-top:-3px;transition:transform .2s cubic-bezier(.34,1.56,.64,1)}
.hr-cb:checked{background:var(--accent);border-color:var(--accent)}
.hr-cb:checked::after{transform:rotate(-45deg) scale(1)}
.hr-cb:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

/* filters --------------------------------------------------------------------------- */
.hr-filters{display:flex;flex-direction:column;gap:14px;padding:16px 18px;border-radius:12px;background:var(--surface);border:1px solid var(--rule-soft);margin-bottom:18px}
.hr-frow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.hr-flab{font:500 10.5px/1.3 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);width:170px;flex:none}
.hr-dem{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 11px 0 9px;border-radius:15px;border:1px solid var(--rule);background:transparent;color:var(--ink-2);font:500 12.5px/1 Archivo,sans-serif;cursor:pointer;transition:border-color .15s,background .15s,color .15s,transform .2s cubic-bezier(.34,1.56,.64,1)}
.hr-dem:hover{color:var(--ink);transform:translateY(-1px)}
.hr-dem small{font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.hr-dem svg{width:12px;height:12px}
.hr-dem .x{display:none}
.hr-dem[aria-pressed="true"]{border-color:color-mix(in srgb,var(--neg) 55%,transparent);background:color-mix(in srgb,var(--neg) 10%,transparent);color:var(--ink)}
.hr-dem[aria-pressed="true"] .t{text-decoration:line-through;text-decoration-color:var(--neg);text-decoration-thickness:1.5px}
.hr-dem[aria-pressed="true"] .x{display:block;color:var(--neg)}
.hr-dem[aria-pressed="true"] .p{display:none}
.hr-range{display:inline-flex;align-items:center;gap:10px;margin-right:22px}
.hr-range input[type=range]{width:150px;accent-color:var(--accent)}
.hr-range output{font:500 13px/1 "IBM Plex Mono",monospace;min-width:40px;color:var(--ink)}
.hr-range span{font-size:12.5px;color:var(--ink-2)}
.hr-fnote{font-size:12px;color:var(--ink-3);margin-left:auto}
.hr-scope{display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--ink-2)}

/* what each role needs ----------------------------------------------------------- */
.hr-needs{display:flex;flex-direction:column;border-top:1px solid var(--rule)}
.hr-need{display:grid;grid-template-columns:40px minmax(0,1fr) 220px 104px 128px;gap:18px;align-items:center;padding:14px 6px;border-bottom:1px solid var(--rule-soft);transition:background .15s}
.hr-need:hover,.hr-need.open{background:var(--surface)}
.hr-code{width:36px;height:36px;border-radius:10px;background:var(--raised);display:grid;place-items:center;font:600 11px/1 "IBM Plex Mono",monospace;color:var(--ink-2);transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
.hr-need:hover .hr-code{transform:rotate(-8deg)}
.hr-nm b{font-size:15px;font-weight:600;letter-spacing:-.005em}
.hr-nm b em{font-style:normal;font-family:"IBM Plex Mono",monospace;font-weight:500;color:var(--accent)}
.hr-nm .kinds{margin-left:8px;font-size:12.5px;color:var(--ink-3);font-weight:400}
.hr-sites{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.hr-pool .tr{position:relative;height:6px;border-radius:3px;background:var(--rule-soft);overflow:hidden}
.hr-pool .tr i{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:var(--accent);width:var(--w);transition:width .3s cubic-bezier(.2,.7,.2,1)}
.hr-pool .tr u{position:absolute;top:0;bottom:0;right:0;width:var(--short);background:repeating-linear-gradient(135deg,var(--warn) 0 3px,transparent 3px 6px);opacity:.8}
.hr-pool small{display:block;margin-top:7px;font:500 11.5px/1.35 "IBM Plex Mono",monospace;color:var(--ink-3)}
.hr-pool small b{color:var(--ink);font-weight:500}
.hr-pool small .warn{color:var(--warn)}
.hr-cost{font:500 15px/1.1 "IBM Plex Mono",monospace;text-align:right}
.hr-cost small{display:block;margin-top:3px;font-size:10.5px;color:var(--ink-3);letter-spacing:.04em}
.hr-open{display:inline-flex;align-items:center;justify-content:space-between;gap:8px;height:34px;padding:0 10px 0 13px;border-radius:9px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);font:500 12.5px/1 Archivo,sans-serif;cursor:pointer;transition:border-color .15s,transform .2s}
.hr-open:hover{border-color:var(--ink-3);transform:translateY(-1px)}
.hr-open svg{width:13px;height:13px;transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.hr-need.open .hr-open svg{transform:rotate(90deg)}
.hr-drawer{display:none;padding:6px 6px 22px 64px;border-bottom:1px solid var(--rule-soft);background:var(--surface)}
.hr-drawer.open{display:block}
.hr-dnote{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:4px 0 12px;font-size:12.5px;color:var(--ink-2)}
.hr-dnote b{color:var(--ink);font-weight:600}
.hr-dnote .gw-hint{max-width:none;margin:0}
.hr-count{font:500 12.5px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.hr-count b{color:var(--ink);font-weight:500}

/* candidates ---------------------------------------------------------------------- */
.hr-cands table{font-size:13px}
.hr-cands th,.hr-cands td{padding:8px 10px}
.hr-cands thead th{background:var(--surface)}
.hr-cands thead th.sorted{color:var(--ink)}
.hr-cands thead th.sorted::after{content:" \2193";color:var(--accent)}
.hr-cands tr.hr-out{display:none}
.hr-cands tbody tr td{color:var(--ink-2)}
.hr-cands tbody tr.hr-picked td{color:var(--ink)}
.hr-cands tbody tr.hr-picked{background:color-mix(in srgb,var(--accent) 6%,transparent)}
.hr-cands tbody tr.hr-picked:hover{background:color-mix(in srgb,var(--accent) 10%,transparent)}
.hr-cands tbody tr.hr-brk td:not(:first-child):not(.hr-dcell){opacity:.55}
.hr-cands td b{font-weight:500}
.hr-cands td .sub{font-family:"IBM Plex Mono",monospace;font-size:11px}
.hr-sk{display:inline-block;vertical-align:middle;width:52px;height:4px;border-radius:2px;background:var(--rule);margin-right:8px;overflow:hidden}
.hr-sk i{display:block;height:100%;width:var(--w);background:var(--accent)}
.hr-also{font-family:"IBM Plex Mono",monospace!important;font-size:11.5px;color:var(--ink-3)!important}
.hr-d{display:inline-flex;align-items:center;gap:4px;height:21px;padding:0 7px;border-radius:5px;font:500 11px/1 Archivo,sans-serif;background:var(--raised);color:var(--ink-2);margin:1px 4px 1px 0;white-space:nowrap}
.hr-d svg{width:10px;height:10px;stroke-width:2.4}
.hr-d.ok svg{color:var(--accent)}
.hr-d.no{background:color-mix(in srgb,var(--neg) 14%,transparent);color:var(--neg)}
.hr-exp{font-family:"IBM Plex Mono",monospace}
.hr-exp.warn{color:var(--warn)!important}
.hr-nop{font-size:11.5px;color:var(--neg)}
.hr-over{font-size:11.5px;color:var(--warn)}
.hr-cands td.hr-dcell{white-space:normal;min-width:150px}
.hr-split .hr-also{display:none}
.hr-rail .hr-range{flex-wrap:wrap;gap:6px 10px}
.hr-rail .hr-range>span:first-child{width:100%}
.hr-u{font-size:12px;color:var(--ink-3);font-family:Archivo,sans-serif}
.hr-dhead .c .mvc{display:block;color:var(--accent)}
.hr-dhead .c .cst{display:block;color:var(--ink-3)}
.hr-morerow{display:flex;align-items:center;gap:16px;margin-top:10px;font-size:12.5px;color:var(--ink-3)}

/* the action bar ------------------------------------------------------------------- */
.hr-bar{position:sticky;bottom:16px;z-index:4;display:flex;align-items:center;gap:22px;margin-top:22px;padding:12px 12px 12px 20px;border-radius:14px;background:var(--surface);border:1px solid var(--rule);box-shadow:0 22px 50px -26px #000c}
.light .hr-bar{box-shadow:0 22px 50px -30px #1a1f1c66}
.hr-bar .sum{display:flex;gap:24px}
.hr-bar .sum div{display:flex;flex-direction:column;gap:5px}
.hr-bar .sum span{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.hr-bar .sum b{font:500 17px/1 "IBM Plex Mono",monospace;letter-spacing:-.01em}
.hr-bar .gw-hint{margin-left:auto;margin-right:0;max-width:300px;text-align:right}

/* the headhunters' finds for the sites the board does not plan --------------------- */
.hr-found td .hr-st{margin-right:4px}
.hr-found td.l b{font-weight:500}
.hr-found .gw-mini-b{height:26px}

/* payroll, as it was ------------------------------------------------------------------ */
.hr-pay{display:grid;grid-template-columns:1.25fr 1fr;gap:40px;align-items:start}
.hr-rate{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.hr-rate .sstat .v small{font-size:12px;color:var(--ink-3);margin-left:4px}
.hr-rate p{grid-column:1/-1;margin:2px 0 0;font-size:12.5px;color:var(--ink-3);text-wrap:pretty}
.hr-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}

/* option B: a rail and a table --------------------------------------------------------- */
.hr-split{display:grid;grid-template-columns:268px minmax(0,1fr);gap:28px;align-items:start}
.hr-rail{display:flex;flex-direction:column;gap:18px;position:sticky;top:20px}
.hr-rlist{display:flex;flex-direction:column;gap:2px}
.hr-rlist .lab{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin:10px 0 6px}
.hr-rbtn{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;align-items:center;width:100%;padding:8px 10px;border-radius:8px;border:1px solid transparent;background:none;color:var(--ink-2);font:500 13px/1.3 Archivo,sans-serif;text-align:left;cursor:pointer;transition:background .15s,color .15s}
.hr-rbtn:hover{background:var(--surface);color:var(--ink)}
.hr-rbtn[aria-pressed="true"]{background:var(--surface);border-color:var(--rule);color:var(--ink)}
.hr-rbtn small{grid-column:1/-1;font:500 11px/1.2 "IBM Plex Mono",monospace;color:var(--ink-3)}
.hr-rbtn .n{font:500 12px/1 "IBM Plex Mono",monospace;color:var(--accent)}
.hr-rbtn .n.warn{color:var(--warn)}
.hr-rbtn .n.dim{color:var(--ink-3)}
.hr-rail .hr-filters{margin:0;padding:14px}
.hr-rail .hr-frow{gap:6px}
.hr-rail .hr-flab{width:100%}
.hr-rail .hr-range{margin:0;width:100%}
.hr-rail .hr-range input[type=range]{flex:1;width:auto}
.hr-tbar{display:flex;align-items:center;gap:14px;margin-bottom:12px}
.hr-tbar h2{margin:0;font-size:17px;font-weight:600}
.hr-search{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 10px;border-radius:8px;border:1px solid var(--rule);background:var(--surface);color:var(--ink-3);font-size:12.5px;margin-left:auto;width:220px}
.hr-search input{border:0;background:none;color:var(--ink);font:inherit;outline:none;width:100%}
.hr-search svg{width:14px;height:14px}

/* the dialog: who goes where ------------------------------------------------------------ */
.gw-dlg.hr-wide{width:640px}
.hr-dsites{display:flex;flex-direction:column;border-top:1px solid var(--rule-soft)}
.hr-dsite{border-bottom:1px solid var(--rule-soft)}
.hr-dhead{display:grid;grid-template-columns:minmax(0,1fr) auto 84px 14px;gap:12px;align-items:center;width:100%;padding:9px 2px;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;border-radius:8px;transition:background .15s}
.hr-dhead:hover{background:var(--ground)}
.hr-dhead .nm{display:flex;align-items:center;gap:8px;min-width:0;font-size:13.5px;font-weight:500}
.hr-dhead .nm .hood{height:18px;min-width:22px;font-size:9.5px}
.hr-dhead .nm span.s{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hr-dhead .plan{display:block;font-size:11.5px;color:var(--ink-3);font-weight:400;margin-top:2px;padding-left:30px}
.hr-dhead .c{font:500 11.5px/1.35 "IBM Plex Mono",monospace;color:var(--ink-2);text-align:right;white-space:nowrap}
.hr-dhead>svg{width:13px;height:13px;color:var(--ink-3);transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.hr-dsite.open .hr-dhead>svg{transform:rotate(90deg)}
.hr-dots{display:flex;gap:3px;align-items:center}
.hr-dots i{width:8px;height:8px;border-radius:50%;background:var(--accent)}
.hr-dots i.mv{background:transparent;box-shadow:inset 0 0 0 1.5px var(--accent)}
.hr-dots i.gap{background:transparent;box-shadow:inset 0 0 0 1.5px var(--warn);opacity:.9}
.hr-dots i.done{animation:pop .4s cubic-bezier(.34,1.56,.64,1)}
.hr-dots i.wait{background:var(--rule)}
.hr-dhead:hover .hr-dots i{animation:sp-hop .45s ease-in-out;animation-delay:calc(var(--k)*30ms)}
.hr-dpeople{display:none;padding:2px 0 12px}
.hr-dsite.open .hr-dpeople{display:block}
.hr-dp{display:grid;grid-template-columns:minmax(0,1fr) 110px 44px 40px 118px 40px;gap:10px;align-items:center;padding:5px 4px;font-size:12.5px;border-radius:6px}
.hr-dp:hover{background:var(--ground)}
.hr-dp .who b{font-weight:500}
.hr-dp .who small{display:block;color:var(--ink-3);font-size:11px;margin-top:1px}
.hr-dp .who small.mv{color:var(--accent)}
.hr-dp .r{font-size:12px;color:var(--ink-2)}
.hr-dp .m{font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-2);text-align:right}
.hr-dp.gap{color:var(--warn)}
.hr-dp.gap .who b{color:var(--warn)}
.hr-dp.hd{padding-top:0;padding-bottom:2px}
.hr-dp.hd span{font:500 9.5px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}
.hr-wk{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px}
.hr-wk i{height:12px;border-radius:2px;background:var(--rule-soft)}
.hr-wk i.on{background:var(--accent);opacity:.85}
.hr-wk.gap i.on{background:transparent;box-shadow:inset 0 0 0 1px var(--warn);opacity:1}
.hr-wkd{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px;text-align:center}
.hr-lock{display:inline-flex;align-items:flex-start;gap:7px}
.hr-lock svg{width:13px;height:13px;margin-top:1px;flex:none}
.hr-prog{position:relative;height:4px;border-radius:2px;background:var(--rule);overflow:hidden}
.hr-prog i{position:absolute;top:0;bottom:0;width:40%;border-radius:2px;background:var(--info);animation:slide 1.2s ease-in-out infinite}
.hr-struck{text-decoration:line-through;text-decoration-color:var(--warn)}

/* not linked --------------------------------------------------------------------------- */
.hr-nolink{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:6px 20px;align-items:center;margin-top:22px;padding:20px 20px 20px 22px;border-radius:14px;border:1px dashed var(--rule);background:var(--surface)}
.hr-nolink .ic{width:52px;height:52px;border-radius:14px;background:var(--raised);display:grid;place-items:center;color:var(--ink-2)}
.hr-nolink .ic svg{width:24px;height:24px}
.hr-nolink:hover .ic svg{animation:sp-wiggle .5s ease-in-out}
.hr-nolink h3{margin:0;font-size:15px;font-weight:600}
.hr-nolink ol{margin:8px 0 0;padding-left:18px;color:var(--ink-2);font-size:13px;line-height:1.6}
.hr-nolink ol b{color:var(--ink);font-weight:600}
.hr-nolink .acts{display:flex;flex-direction:column;gap:8px;align-items:stretch}
.hr-nolink .gw-b[disabled]{border-style:dashed}
.hr-stale{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--warn)}
.hr-stale svg{width:13px;height:13px}

/* phone ---------------------------------------------------------------------------------- */
.hr-phone{position:relative;width:390px;height:844px;overflow:hidden;background:var(--ground)}
.hr-phone .pin{padding:0 16px 120px}
.hr-pm{display:flex;align-items:center;justify-content:space-between;height:56px;border-bottom:1px solid var(--rule)}
.hr-pm .wm{font-size:22px;font-weight:800;letter-spacing:-.04em}
.hr-pm .wm i{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);margin-left:2px}
.hr-pm .clk{font:500 11px/1.3 "IBM Plex Mono",monospace;color:var(--ink-2);text-align:right}
.hr-pm .clk small{display:block;color:var(--ink-3);font-size:9.5px;letter-spacing:.06em}
.hr-phone .hr-sub{margin-top:14px;overflow:hidden}
.hr-phone .seg{flex:none}
.hr-phone .hr-head{margin-top:16px;align-items:center}
.hr-phone .hr-head h1{font-size:22px}
.hr-phone .hr-tiles{grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
.hr-phone .sstat{padding:11px 12px}
.hr-phone .sstat .v{font-size:18px;margin-top:6px}
.hr-phone .hr-block{margin-top:24px}
.hr-phone .sechead{margin-bottom:10px}
.hr-phone .sechead h2{font-size:15px}
.hr-pcard{display:flex;flex-direction:column;gap:9px;padding:13px 0;border-bottom:1px solid var(--rule-soft)}
.hr-pcard .top{display:flex;align-items:center;gap:10px}
.hr-pcard .top .hr-code{width:32px;height:32px;font-size:10px}
.hr-pcard .top b{font-size:14.5px;font-weight:600}
.hr-pcard .top b em{font-style:normal;font-family:"IBM Plex Mono",monospace;font-weight:500;color:var(--accent)}
.hr-pcard .top .hr-cost{margin-left:auto;font-size:13px}
.hr-pcard .bot{display:flex;align-items:center;gap:12px}
.hr-pcard .bot .hr-pool{flex:1}
.hr-pcard .hr-open{height:44px}
.hr-pmove{display:flex;flex-direction:column;gap:6px;padding:11px 0;border-bottom:1px solid var(--rule-soft);font-size:12.5px;color:var(--ink-2)}
.hr-pmove b{color:var(--ink);font-size:13.5px}
.hr-pmove .hr-route{gap:6px}
.hr-pbar{position:absolute;left:0;right:0;bottom:0;padding:12px 16px 26px;background:var(--surface);border-top:1px solid var(--rule);display:flex;flex-direction:column;gap:10px}
.hr-pbar .row{display:flex;align-items:center;gap:12px}
.hr-pbar .row b{font:500 14px/1.2 "IBM Plex Mono",monospace}
.hr-pbar .row small{display:block;font-size:11px;color:var(--ink-3)}
.hr-pbar .gw-b{margin-left:auto;height:46px}
.hr-pbar .gw-hint{max-width:none;font-size:11.5px}
.hr-phone .hr-fade{position:absolute;left:0;right:0;bottom:130px;height:60px;background:linear-gradient(transparent,var(--ground));pointer-events:none}
@keyframes sp-hop{40%{transform:translateY(-4px)}}
@media (prefers-reduced-motion:reduce){.board *{animation:none!important;transition:none!important}}
"""

# --------------------------------------------------------------------------
# icons (stroke, 24 grid): the site panel's and the write dialogs', plus a few
# --------------------------------------------------------------------------
P = {**SP_P, **GW_P,
     "move": '<path d="M4 8h13M13 4l4 4-4 4"></path><path d="M20 16H7M11 12l-4 4 4 4"></path>',
     "filter": '<path d="M4 5h16l-6 7.500V19l-4 2v-8.500z"></path>',
     "search": '<circle cx="11" cy="11" r="6.500"></circle><path d="M16 16l4.500 4.500"></path>',
     "map": '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"></path><path d="M9 4v14M15 6v14"></path>',
     "wiki": '<path d="M5 4.500A1.500 1.500 0 0 1 6.500 3H19v15H6.500A1.500 1.500 0 0 0 5 19.500z"></path><path d="M5 19.500A1.500 1.500 0 0 0 6.500 21H19"></path>',
     "hq": '<path d="M4 21V9l8-5 8 5v12"></path><path d="M9 21v-6h6v6M9 11h.01M15 11h.01"></path>',
     "plus2": '<path d="M12 6v12M6 12h12"></path>',
     "x2": '<path d="M7 7l10 10M17 7 7 17"></path>',
     "check2": '<path d="M5 12.500l4.500 4.500L19 7"></path>',
     "hourglass": '<path d="M7 3h10M7 21h10"></path><path d="M8 3c0 4.500 8 4.500 8 9s-8 4.500-8 9M16 3c0 4.500-8 4.500-8 9s8 4.500 8 9"></path>',
     "phone": '<rect x="7" y="2.500" width="10" height="19" rx="2"></rect><path d="M11 18.500h2"></path>',
     }


def svg(name: str, cls: str = "") -> str:
    c = f' class="{cls}"' if cls else ""
    return f'<svg{c} viewBox="0 0 24 24" aria-hidden="true">{P[name]}</svg>'


def esc(text: str) -> str:
    return html.escape(text, quote=True)


def money(v: float) -> str:
    return f"${v:,.0f}"


# --------------------------------------------------------------------------
# the write dialogs' shell (the same markup as mockup/write-dialogs)
# --------------------------------------------------------------------------
def wire(state: str) -> str:
    return (f'<span class="gw-w {state}" aria-hidden="true"><span class="a"></span><span class="ln"></span>'
            f'<span class="p"></span><span class="p"></span><span class="p"></span><span class="g">{svg("game")}</span></span>')


def verdict(state: str, text: str, meta: str = "") -> str:
    m = f'<span class="gw-meta">{meta}</span>' if meta else ""
    return f'<div class="gw-verdict" role="status">{wire(state)}<span>{text}</span>{m}</div>'


def dialog(kind: str, title: str, sub: str, verdict_html: str, body: str, foot: str, cls: str = "") -> str:
    return f"""<div class="gw-dlg {cls}" role="dialog" aria-label="{esc(title)}">
<div class="gw-head"><span class="gw-kind">{svg(kind)}</span><div><h2>{title}</h2>{sub}</div>
<button type="button" class="gw-x" aria-label="Close">{svg("close")}</button></div>
{verdict_html}
<div class="gw-body">{body}</div>
<div class="gw-foot">{foot}</div>
</div>"""


def btn(label: str, kind: str = "", icon: str = "", count: str = "", disabled: bool = False, attrs: str = "") -> str:
    lead = svg(icon) if icon in ("refresh", "plug", "undo") else ""
    tail = svg(icon, "go") if icon and not lead else ""
    cnt = f'<span class="n">{count}</span>' if count else ""
    dis = ' disabled="disabled"' if disabled else ""
    return f'<button type="button" class="gw-b {kind}"{dis} {attrs}>{lead}{label}{cnt}{tail}</button>'


def hint(text: str, cls: str = "") -> str:
    return f'<span class="gw-hint {cls}">{text}</span>'


def lock_hint(text: str) -> str:
    return hint(f'<span class="hr-lock">{svg("lock")}<span>{text}</span></span>')


def col(num: str, label: str, content: str, width: int = 480) -> str:
    return f'<div class="gw-col" style="width: {width}px;"><div class="gw-state"><b>{num}</b><span>{label}</span></div>{content}</div>'


def stage(cols: list[str]) -> str:
    return f'<div class="gw-stage">{"".join(cols)}</div>'


def top(title: str, sub: str) -> str:
    return f'<div class="gw-top"><h1>{title}</h1><p>{sub}</p></div>'


# --------------------------------------------------------------------------
# the company: every name invented
# --------------------------------------------------------------------------
COMPANY = "Halden"
# key: hood, business, street, kind, new, how its hours are planned
SITES = {
    "t5": ("MT", "Halden Tech", "5th Avenue 12", "Electronics store", False, "the board's plan"),
    "tb": ("SH", "Halden Tech", "Bleecker Street 40", "Electronics store", False, "the board's plan"),
    "t2": ("MH", "Halden Tech", "2nd Avenue 31", "Electronics store", True, "new: full cover, open 24/7"),
    "tw": ("FD", "Halden Tech", "Wall Street 9", "Electronics store", True, "new: full cover, open 24/7"),
    "w9": ("HK", "Halden Wear", "9th Avenue 18", "Clothing store", False, "the board's plan"),
    "t7": ("GD", "Halden Tech", "7th Avenue 3", "Electronics store", False, "the board's plan"),
    "f39": ("IC", "Halden Works", "39th Street 2", "Factory", False, "the board's plan"),
    "lp": ("MH", "Halden Law", "Park Avenue 88", "Law firm", True, "new: the office default"),
}
NEW_TAG = '<span class="hr-new" data-tip="Opened since the last save with staff: planned with the default">new</span>'


def site_tag(k: str, count: int | None = None, long: bool = False) -> str:
    hood, biz, street, kind, new, plan = SITES[k]
    c = f"<b>{count}</b>" if count is not None else ""
    name = f"{biz} · {street}" if long else street
    tip = f"{biz} · {street} · {kind} · hours from {plan}"
    return (f'<span class="hr-st" data-tip="{esc(tip)}"><span class="hood">{hood}</span>{name}'
            f'{NEW_TAG if new else ""}{c}</span>')


FIRST = ["Ada", "Bram", "Cleo", "Dario", "Edda", "Femi", "Greta", "Hollis", "Ines", "Jonas", "Kaia", "Lior", "Mara", "Nils",
         "Odile", "Paz", "Quinn", "Rosa", "Silas", "Tove", "Ulla", "Vito", "Wanda", "Xavi", "Yara", "Zeno", "Arlo", "Bea", "Cyrus",
         "Delia", "Emil", "Flora", "Gus", "Hana", "Ivo", "Juno", "Kofi", "Lotte", "Milo", "Nora"]
LAST = ["Achterberg", "Brandt", "Castell", "Duvall", "Engstrom", "Farrow", "Gallo", "Hartley", "Ilves", "Jansen", "Kestrel",
        "Lomax", "Marlow", "Nyberg", "Okafor", "Pell", "Quist", "Rourke", "Sandoval", "Thorne", "Ueda", "Varga", "Whitlock",
        "Yilmaz", "Zamora", "Alder", "Bishop", "Crane", "Dorsey", "Ekdahl"]

# demands: short key -> the game's own name, what the board says about it on these sites
DEMS = {
    "nw": ("No weekends", "ok", "Fits: the plan can give them weekdays only"),
    "pt": ("Part-time", "ok", "Fits: the plan can give them 30 hours or fewer"),
    "nn": ("No night shifts", "ok", "Fits: the plan keeps them off 22:00 to 04:00"),
    "fd": ("Four days week", "ok", "Fits: four days of up to 12 hours"),
    "cm": ("Coffee Machine", "ok", "Met at 5th Avenue 12 and Bleecker Street 40 only, so they go there"),
    "gh": ("Gold Health Insurance", "no", "Not met anywhere: no HR manager has a Gold partnership. Never picked by itself"),
    "hb": ("Happy boss", "ok", "Met: your happiness is 74%"),
    "cw": ("Clean work environment", "ok", "Met: every site they could go to is at 80% or cleaner"),
    "ne": ("No evening shifts", "ok", "Fits: the plan keeps them off 18:00 to 22:00"),
    "nm": ("No morning shifts", "ok", "Fits: the plan keeps them off 06:00 to 10:00"),
    "ft": ("Full-time", "ok", "Fits: the plan gives 30 to 50 hours"),
    "nc": ("No cleaning shifts", "ok", "Fits: Customer Service has no cleaning hours"),
}
# how many of the 412 Customer Service candidates hold each demand, in the filter's order
DEM_COUNTS = [("nw", 61), ("nn", 58), ("ft", 52), ("pt", 47), ("cw", 40), ("fd", 33), ("ne", 31), ("cm", 29), ("nm", 25),
              ("hb", 22), ("nc", 18), ("gh", 14)]
EXCLUDED = {"nw", "pt"}
MIN_SKILL, MAX_WAGE = 60, 32

random.seed(89)
_used: set = set()


def name() -> str:
    while True:
        n = f"{random.choice(FIRST)} {random.choice(LAST)}"
        if n not in _used:
            _used.add(n)
            return n


def cs_candidates() -> list[dict]:
    """Thirty Customer Service candidates, most skilled first: the top of the 412 found."""
    forced = {0: ["nw"], 2: ["pt", "cm"], 4: ["gh"], 6: ["cm"], 9: ["nn", "fd"], 12: ["cm", "hb"], 15: ["nw", "ne"]}
    rest = ["nn", "fd", "hb", "cw", "ne", "nm", "ft", "nc", "nw", "pt", "ft", "nn"]
    out, skill = [], 96.0
    for k in range(30):
        if k in forced:
            dem = forced[k]
        else:
            dem = random.sample(rest, random.choices([0, 1, 2, 3], [34, 36, 20, 10])[0])
            dem = list(dict.fromkeys(dem))
        s = round(skill)
        also = ""
        if random.random() < .28:
            also = f'{random.choice(["Cleaning", "Security Guard", "Cleaning"])} {random.randint(18, 58)}%'
        exp = random.choice([random.randint(3, 23), random.randint(24, 90), random.randint(60, 166), random.randint(30, 140)])
        out.append({"name": name(), "age": random.randint(19, 61), "skill": s, "wage": round(11 + s * .19 + random.uniform(-2.5, 2.5)),
                    "dem": dem, "also": also, "exp": exp, "breaks": "gh" in dem,
                    "only": ["t5", "tb"] if "cm" in dem else []})
        skill -= random.uniform(.9, 2.1)
    return out


CS_QUOTA = [("t5", 2), ("tb", 3), ("t2", 4), ("tw", 3), ("w9", 2)]


def pick(rows: list[dict], quotas: list[tuple], excluded: set, min_s: int, max_w: int) -> int:
    """The auto-pick, as the page's script does it: most skilled first, filters, then a place."""
    left = dict(quotas)
    need, picked = sum(left.values()), 0
    for r in rows:
        ok = not (set(r["dem"]) & excluded) and r["skill"] >= min_s and r["wage"] <= max_w
        r["out"], r["site"] = not ok, None
        if ok and not r["breaks"] and picked < need:
            for k, _ in quotas:
                if left[k] > 0 and (not r["only"] or k in r["only"]):
                    left[k] -= 1
                    r["site"] = k
                    picked += 1
                    break
    return picked


CS = cs_candidates()
CS_PICKED = pick(CS, CS_QUOTA, EXCLUDED, MIN_SKILL, MAX_WAGE)


def plain(role: str, n: int, lo: int, hi: int, wage: tuple) -> list[dict]:
    return [{"name": name(), "role": role, "skill": random.randint(lo, hi), "wage": random.randint(*wage)} for _ in range(n)]


CLEAN = plain("Cleaning", 6, 62, 90, (16, 20))
SECUR = plain("Security Guard", 3, 61, 84, (24, 28))
FACT = plain("Factory Worker", 8, 64, 93, (25, 30))
LAW = plain("Lawyer", 3, 70, 91, (48, 56))
MOVED_CS = [{"name": name(), "role": "Customer Service", "skill": 78, "wage": 22, "from": "t7"},
            {"name": name(), "role": "Customer Service", "skill": 74, "wage": 21, "from": "t7"}]
MOVED_CL = [{"name": name(), "role": "Cleaning", "skill": 81, "wage": 18, "from": "t7"}]

HOURS = {"Customer Service": 44, "Cleaning": 44, "Security Guard": 42, "Factory Worker": 48, "Lawyer": 40}


def per_day(p: dict) -> float:
    return p["wage"] * HOURS[p["role"]] / 7


# who goes where: the auto-pick's answer, site by site
def placements() -> dict:
    at = {k: [] for k in SITES}
    for r in CS:
        if r["site"]:
            at[r["site"]].append({**r, "role": "Customer Service"})
    for p, k in zip(CLEAN, ["t5", "t2", "t2", "tw", "f39", "f39"]):
        at[k].append(p)
    for p, k in zip(SECUR, ["t5", "t2", "t2"]):
        at[k].append(p)
    for p in FACT:
        at["f39"].append(p)
    for p in LAW:
        at["lp"].append(p)
    return at


AT = placements()
HIRES = sum(len(v) for v in AT.values())
MOVES = len(MOVED_CS) + len(MOVED_CL)
BILL = sum(per_day(p) for v in AT.values() for p in v)
ROLE_BILL = {}
for _v in AT.values():
    for _p in _v:
        ROLE_BILL[_p["role"]] = ROLE_BILL.get(_p["role"], 0) + per_day(_p)
HIRE_SITES = [k for k, v in AT.items() if v]

# --------------------------------------------------------------------------
# page chrome
# --------------------------------------------------------------------------
NAV = [("today", "Today"), ("supply", "Supply"), ("growth", "Growth"), ("building", "Company"), ("map", "Map"), ("wiki", "Wiki")]


def masthead() -> str:
    items = "".join(f'<a class="{"on" if k == "building" else ""}" href="#">{svg(k)}<span>{lab}</span></a>' for k, lab in NAV)
    return f"""
<header class="mast">
  <div class="brand"><span class="wordmark">{COMPANY}</span><span class="dot"></span></div>
  <nav class="nav" aria-label="Board pages">{items}</nav>
  <div class="clock tr" data-tip="Game time now, read from the game. Day 1 was a Monday."><b>Day 214<i>·</i>Tue 21:04</b><small>YEAR 3 · 19 SITES · 198 STAFF</small></div>
</header>"""


def subnav() -> str:
    views = [("Results", ""), ("Products", ""), ("Staff", "on"), ("Milestones", "")]
    return ('<div class="hr-sub"><nav class="seg" aria-label="Company views">'
            + "".join(f'<a class="{c}" href="#">{v}</a>' for v, c in views) + "</nav></div>")


def linked(on: bool = True) -> str:
    if on:
        return (f'<span class="hr-linked" data-tip="Big Copilot Link is on: candidates and staff are read from the running game, and hiring goes through it.">'
                f'{wire("ok")}<b>Game linked</b></span>')
    return (f'<span class="hr-linked off" data-tip="Reading a save file. Hiring needs the game running with the Big Copilot Link mod.">'
            f'{wire("busy")}<span>Save file · 3 h old</span></span>')


def page_head(sub: str, on: bool = True, extra: str = "") -> str:
    return f"""
<div class="hr-head">
  <div><h1>Staff</h1><p>{sub}</p></div>
  <div class="aside">{extra}{linked(on)}</div>
</div>"""


HEAD_SUB = ("What every planned site still needs, filled from your headhunters' candidates. "
            "Surplus people move first; the rest are hired, placed and given their hours in one go.")


def sechead(icon: str, title: str, why: str = "", quiet: str = "", aside: str = "", go: bool = False) -> str:
    return (f'<div class="sechead"><span class="hr-ico{" go" if go else ""}">{svg(icon)}</span><h2>{title}</h2>'
            + (f'<span class="why" data-tip="{esc(why)}"><i>?</i></span>' if why else "")
            + (f'<span class="quiet">{quiet}</span>' if quiet else "")
            + (f'<div class="aside">{aside}</div>' if aside else "") + "</div>")


def tiles(on: bool = True) -> str:
    exp = ('<span class="note warn">212 leave the list within a day</span>' if on
           else '<span class="note warn">as of the save, 3 h ago</span>')
    return f"""
<div class="sstats hr-tiles">
  <div class="sstat" data-tip="People to hire across every planned site, after moves"><span class="lab">To hire</span><div class="v">{HIRES}<small>of 36 needed</small></div><span class="note warn">2 Security Guard short: see below</span></div>
  <div class="sstat" data-tip="Surplus people moved to a site that needs their role, before anyone is hired"><span class="lab">To move</span><div class="v">{MOVES}<small>people</small></div><span class="note">from 7th Avenue 3, which plans fewer</span></div>
  <div class="sstat" data-tip="The picked candidates' hourly wage times the hours the plan gives them, over seven. Moves cost nothing new."><span class="lab">Wage bill added</span><div class="v">+{money(BILL)}<small>a day</small></div><span class="note">today {money(31_482)} a day</span></div>
  <div class="sstat" data-tip="Everyone your headhunters found and have not placed. A candidate leaves the list 168 hours after being found."><span class="lab">Candidates</span><div class="v">1,566<small>found</small></div>{exp}</div>
</div>"""


def person_pill(p: dict) -> str:
    code = "".join(w[0] for w in p["name"].split())
    return (f'<span class="person" data-tip="{esc(p["role"])} · {p["skill"]}% · ${p["wage"]}/h"><i>{code}</i>{esc(p["name"])}'
            f' <small>{p["skill"]}%</small></span>')


def moves_block() -> str:
    rows = [("Customer Service", MOVED_CS, "t7", "t2", "7th Avenue 3 plans 6 and has 8"),
            ("Cleaning", MOVED_CL, "t7", "tw", "7th Avenue 3 plans 2 and has 3")]
    out = ""
    for role, ppl, a, b, why in rows:
        out += f"""
<label class="hr-move">
  <input type="checkbox" class="hr-cb" checked="checked" data-move aria-label="Move {len(ppl)} {esc(role)}">
  <span class="what"><b>Move {len(ppl)} {role}</b><small>{why}</small></span>
  <span class="hr-route">{site_tag(a, long=True)}<span class="arr">{svg("right")}</span>{site_tag(b, long=True)}</span>
  <span class="crew">{"".join(person_pill(p) for p in ppl)}</span>
</label>"""
    return f"""
<section class="hr-block">
  {sechead("move", "Move first", "A site whose plan needs fewer people than it has gives the surplus to a site that needs the same role. Moving costs nothing and needs nobody new. Untick a move to hire instead.", f"{MOVES} people · 2 moves")}
  <div class="hr-moves">{out}</div>
</section>"""


def filters(scope: bool = False, rail: bool = False) -> str:
    chips = "".join(
        f'<button type="button" class="hr-dem" data-dem="{k}" aria-pressed="{"true" if k in EXCLUDED else "false"}" '
        f'data-tip="{esc(DEMS[k][0])}: {n} of the Customer Service candidates ask for it. Click to {"allow" if k in EXCLUDED else "leave them out"}.">'
        f'{svg("plus2", "p")}{svg("x2", "x")}<span class="t">{DEMS[k][0]}</span><small>{n}</small></button>'
        for k, n in (DEM_COUNTS[:8] if rail else DEM_COUNTS))
    more = '<a class="link" href="#">4 more</a>' if rail else ""
    sc = ""
    if scope:
        sc = ('<div class="hr-scope"><span class="seg"><a class="on" href="#">Every role</a><a href="#">Customer Service only</a></span>'
              '<span class="quiet">Filters are the company\'s unless a role sets its own</span></div>')
    return f"""
<div class="hr-filters">
  {sc}
  <div class="hr-frow"><span class="hr-flab">Leave out anyone who asks for</span>{chips}{more}</div>
  <div class="hr-frow">
    <span class="hr-flab">And keep</span>
    <label class="hr-range"><span>Skill at least</span><input type="range" min="0" max="100" step="5" value="{MIN_SKILL}" data-minskill aria-label="Lowest skill"><output data-minskill-out>{MIN_SKILL}%</output></label>
    <label class="hr-range"><span>Wage at most</span><input type="range" min="15" max="60" step="1" value="{MAX_WAGE}" data-maxwage aria-label="Highest hourly wage"><output data-maxwage-out>${MAX_WAGE}</output><span>/h</span></label>
    {"" if rail else '<span class="hr-fnote">Demands a site cannot meet are checked for you: those candidates are never picked by themselves.</span>'}
  </div>
</div>"""


def dem_chip(k: str) -> str:
    lab, tone, tip = DEMS[k]
    return f'<span class="hr-d {tone}" data-tip="{esc(tip)}">{svg("check2" if tone == "ok" else "x2")}{lab}</span>'


def cand_rows(rows: list[dict]) -> str:
    out = ""
    for r in rows:
        cls = " ".join(c for c in ["hr-out" if r["out"] else "", "hr-picked" if r["site"] else "", "hr-brk" if r["breaks"] else ""] if c)
        exp = f'{r["exp"]} h'
        to = site_tag(r["site"]) if r["site"] else ('<span class="hr-nop">no site meets a demand</span>' if r["breaks"] else "")
        out += (f'<tr data-cand class="{cls}" data-skill="{r["skill"]}" data-wage="{r["wage"]}" data-dem="{" ".join(r["dem"])}" '
                f'data-only="{" ".join(r["only"])}" data-breaks="{1 if r["breaks"] else 0}">'
                f'<td class="l"><input type="checkbox" class="hr-cb"{" checked" if r["site"] else ""} aria-label="Pick {esc(r["name"])}"></td>'
                f'<td class="l"><b>{esc(r["name"])}</b><span class="sub">{r["age"]}</span></td>'
                f'<td class="l"><span class="hr-sk" style="--w:{r["skill"]}%"><i></i></span>{r["skill"]}%</td>'
                f'<td class="l hr-also">{r["also"] or "–"}</td>'
                f'<td>${r["wage"]}</td>'
                f'<td class="l hr-dcell">{"".join(dem_chip(k) for k in r["dem"]) or "<span class=quiet>none</span>"}</td>'
                f'<td class="hr-exp{" warn" if r["exp"] < 24 else ""}">{exp}</td>'
                f'<td class="l hr-to">{to}</td></tr>')
    return out


def quota_attr(quotas: list[tuple]) -> str:
    return esc(json.dumps([[k, n, site_tag(k)] for k, n in quotas]))


def cand_table(rows: list[dict]) -> str:
    return f"""
<div class="hr-cands">
  <table>
    <thead><tr><th class="l" style="width:34px"></th><th class="l">Candidate</th><th class="l sorted">Customer Service</th><th class="l hr-also">Also</th><th>Wage/h</th><th class="l">Asks for</th><th data-tip="Hours until the candidate leaves the headhunter's list">Leaves in</th><th class="l">Goes to</th></tr></thead>
    <tbody>{cand_rows(rows)}</tbody>
  </table>
</div>"""


NEEDS = [
    # code, role, count, kinds, [(site, n)], picked, found, pass, short
    ("CS", "Customer Service", 14, "4 Electronics stores · 1 Clothing store", CS_QUOTA, CS_PICKED, 412, 158, 0),
    ("CL", "Cleaning", 6, "3 Electronics stores · 1 Factory", [("t5", 1), ("t2", 2), ("tw", 1), ("f39", 2)], 6, 188, 96, 0),
    ("SG", "Security Guard", 5, "3 Electronics stores", [("t5", 1), ("t2", 2), ("tw", 2)], 3, 41, 3, 2),
    ("FW", "Factory Worker", 8, "1 Factory", [("f39", 8)], 8, 233, 121, 0),
    ("LW", "Lawyer", 3, "1 Law firm", [("lp", 3)], 3, 57, 19, 0),
]


def need_line(n, open_: bool = False, pool: bool = False) -> str:
    code, role, count, kinds, quotas, picked, found, passing, short = n
    w = picked / count * 100
    sites = "".join(site_tag(k, c) for k, c in quotas)
    shortnote = f' · <span class="warn">{short} short</span>' if short else ""
    pk = f'<b data-n-picked>{picked}</b>' if pool else f"<b>{picked}</b>"
    bar = f'<i data-pick-bar style="--w:{w:.0f}%"></i>' + (f'<u style="--short:{short / count * 100:.0f}%"></u>' if short else "")
    return f"""
<div class="hr-need{" open" if open_ else ""}">
  <span class="hr-code" data-tip="{esc(role)}">{code}</span>
  <div class="hr-nm"><b>Hire <em>{count}</em> {role}</b><span class="kinds">{kinds}</span><div class="hr-sites">{sites}</div></div>
  <div class="hr-pool" data-tip="Picked against what the sites need. Hatched: places nobody who passes your filters can fill."><div class="tr">{bar}</div>
    <small>{pk} of {count} picked{shortnote}<br>{found} found · {f'<span data-n-pass>{passing}</span>' if pool else passing} pass</small></div>
  <div class="hr-cost">+{money(ROLE_BILL.get(role, 0))}<small>A DAY</small></div>
  <button type="button" class="hr-open" data-open aria-expanded="{"true" if open_ else "false"}">Candidates{svg("chev")}</button>
</div>"""


def drawer(open_: bool) -> str:
    return f"""
<div class="hr-drawer{" open" if open_ else ""}">
  <div class="hr-dnote"><span class="hr-count"><b data-n-picked>{CS_PICKED}</b> of 14 picked · <b data-n-pass>158</b> pass · <span data-n-out>254</span> left out by your filters</span>
    <span class="gw-hint">Most skilled first; a tie goes to the lower wage. Untick someone and the next best who passes takes the place.</span></div>
  {cand_table(CS)}
  <div class="hr-morerow"><a class="link" href="#">Show all 158 who pass</a><a class="link" href="#">Show the 254 left out</a><span>Sorted by skill · click a heading to sort by wage or by hours left</span></div>
</div>"""


def needs_block(open_cs: bool = False, with_filters: bool = True) -> str:
    lines = ""
    for k, n in enumerate(NEEDS):
        if k == 0:
            lines += need_line(n, open_cs, pool=True) + drawer(open_cs)
        else:
            lines += need_line(n) + '<div class="hr-drawer"></div>'
    return f"""
<section class="hr-block" data-pool data-quota="{quota_attr(CS_QUOTA)}" data-pass-base="158" data-out-base="254">
  {sechead("hire", "Hire", "Each line sums what every site with a staffing plan still needs in that role, after the moves above. A site opened without staff is planned with the default: full cover 24/7 for a shop, the office default for an office.", f"{HIRES} people · 5 roles · {len(HIRE_SITES)} sites", go=True)}
  {filters() if with_filters else ""}
  <div class="hr-needs">{lines}</div>
</section>"""


FOUND = [("HR Manager", "HQ", 18, 91, "34–52", 3), ("Headhunter", "HQ", 9, 84, "30–41", 1), ("Purchasing Agent", "HQ", 22, 88, "28–39", 4),
         ("Logistics Manager", "HQ", 7, 79, "33–44", 0), ("Delivery Driver", "2 warehouses", 31, 86, "19–25", 6)]


def found_block() -> str:
    rows = "".join(f'<tr><td class="l"><b>{r}</b></td><td class="l"><span class="quiet">{w}</span></td><td>{n}</td><td>{best}%</td><td>${wage}</td>'
                   f'<td class="{"warn" if soon else ""}">{soon or "–"}</td>'
                   f'<td><button type="button" class="gw-mini-b">Candidates{svg("chev")}</button></td></tr>' for r, w, n, best, wage, soon in FOUND)
    return f"""
<section class="hr-block">
  {sechead("hq", "Not planned", "The board plans no hours for headquarters or warehouses, so it proposes nobody there. This is what your headhunters found for those roles; pick by hand.", "headquarters and warehouses · what the headhunters found")}
  <table class="hr-found">
    <thead><tr><th class="l">Role</th><th class="l">Works at</th><th>Found</th><th>Best skill</th><th>Wage/h</th><th>Leave within a day</th><th></th></tr></thead>
    <tbody>{rows}</tbody>
  </table>
  <p class="quiet" style="margin:10px 0 0">548 more candidates are in roles no site of yours uses.</p>
</section>"""


def action_bar() -> str:
    return f"""
<div class="hr-bar">
  <div class="sum">
    <div><span>Hire</span><b>{HIRES}</b></div><div><span>Move</span><b>{MOVES}</b></div>
    <div><span>Sites</span><b>{len(HIRE_SITES)}</b></div><div><span>Wage bill</span><b>+{money(BILL)}</b></div>
  </div>
  {hint("Nothing changes until you confirm on the next step. The game is asked first.")}
  {btn("Review", "go", "right", str(HIRES + MOVES), attrs='data-tip="Opens who goes where, their hours and the wage bill, then one confirm"')}
</div>"""


PAY_ROLES = [("Customer Service", 64, 9_860), ("Factory Worker", 41, 7_320), ("Cleaning", 38, 4_190), ("Security Guard", 22, 3_390),
             ("Delivery Driver", 12, 1_880), ("Lawyer", 9, 2_760), ("HR Manager", 4, 1_010), ("Headhunter", 3, 520),
             ("Purchasing Agent", 3, 380), ("Logistics Manager", 2, 172)]


def payroll_block() -> str:
    rows = "".join(f'<div class="role"><span>{r}</span><span class="tr"><i style="width:{c / 64 * 100:.0f}%"></i></span>'
                   f'<span class="c"><span>{c}</span><b>${k:,}</b></span></div>' for r, c, k in PAY_ROLES)
    return f"""
<section class="hr-block" style="margin-top:56px">
  {sechead("coin", "Payroll", "What Payroll showed before, unchanged: headcount by role (hover a bar for its daily cost), the wage rate against what yesterday's statements booked, and who is unhappy, out or complaining.", "198 people · $31,482 a day at today's rates", '<span class="chip ok tr" data-tip="Average satisfaction across 198 staff">93%</span><span class="chip warn tr" data-tip="Satisfaction below 70%">4 unhappy</span><span class="chip warn tr" data-tip="Absent today">6 out</span><span class="chip warn tr" data-tip="With an open complaint">2 complaining</span>')}
  <div class="hr-pay">
    <div class="roles">{rows}</div>
    <div class="hr-rate">
      <div class="sstat" data-tip="Every hourly wage times its assigned weekly hours, over seven"><span class="lab">At today's rates</span><div class="v">$31,482<small>a day</small></div></div>
      <div class="sstat" data-tip="Wages on yesterday's statements, the Portfolio's total"><span class="lab">Booked yesterday</span><div class="v">$30,915<small>a day</small></div></div>
      <p>The two part where a site booked more or fewer hours than its people are set for. Hover the ? above for which.</p>
    </div>
  </div>
</section>"""


def overview() -> str:
    return (subnav() + page_head(HEAD_SUB) + tiles() + moves_block() + needs_block() + found_block()
            + action_bar() + payroll_block())


def drawer_page() -> str:
    return subnav() + page_head(HEAD_SUB) + moves_block() + needs_block(open_cs=True) + action_bar()


def rail_role(code, role, need, found, on=False, short=0, planned=True) -> str:
    n = (f'<span class="n{" warn" if short else ""}">{need - short}/{need}</span>' if planned else f'<span class="n dim">{found}</span>')
    sub = f"{found} found" + (f" · {short} short" if short else "") if planned else "not planned · pick by hand"
    return f'<button type="button" class="hr-rbtn" aria-pressed="{"true" if on else "false"}"><span>{role}</span>{n}<small>{sub}</small></button>'


def table_page() -> str:
    roles = "".join(rail_role(c, r, cnt, f, k == 0, s) for k, (c, r, cnt, _, _, _, f, _, s) in enumerate(NEEDS))
    hq = "".join(rail_role("", r, 0, n, planned=False) for r, _, n, _, _, _ in FOUND)
    return (subnav() + page_head(HEAD_SUB, extra='<span class="seg"><a href="#">Needs</a><a class="on" href="#">Candidates</a></span>') + f"""
<section class="hr-block hr-split" data-pool data-quota="{quota_attr(CS_QUOTA)}" data-pass-base="158" data-out-base="254">
  <aside class="hr-rail">
    <div class="hr-rlist"><span class="lab">Planned · picked / needed</span>{roles}<span class="lab">Not planned · found</span>{hq}</div>
    {filters(rail=True)}
  </aside>
  <div>
    <div class="hr-tbar"><h2>Customer Service</h2><span class="hr-count"><b data-n-picked>{CS_PICKED}</b> of 14 picked for 5 sites · <b data-n-pass>158</b> pass · <span data-n-out>254</span> left out</span>
      <label class="hr-search">{svg("search")}<input type="text" placeholder="Find a name" aria-label="Find a candidate by name"></label></div>
    <div class="hr-sites" style="margin:0 0 12px">{"".join(site_tag(k, c) for k, c in CS_QUOTA)}</div>
    {cand_table(CS)}
    <div class="hr-morerow"><a class="link" href="#">Show all 158 who pass</a><span>Most skilled first; a tie goes to the lower wage. Untick someone and the next best takes the place.</span></div>
  </div>
</section>""" + action_bar())


def not_linked() -> str:
    panel = f"""
<div class="hr-nolink">
  <span class="ic">{svg("plug")}</span>
  <div><h3>Hiring goes through the game</h3>
    <ol><li>Subscribe to <b>Big Copilot Link</b> on the Steam Workshop.</li>
      <li>Start Big Ambitions and load {COMPANY}.</li>
      <li>This page finds it. The game asks you once to allow this browser.</li></ol></div>
  <div class="acts"><a class="gw-b" href="#">Open the Workshop page</a>{btn("Review", "", "plug", str(HIRES + MOVES), disabled=True, attrs='data-tip="Needs the game linked"')}</div>
</div>"""
    return (subnav() + page_head("Everything below is read from your save: the plan, the moves and the picks work the same. "
                                 "Hiring, moving and setting hours need the game linked.", on=False)
            + tiles(on=False) + panel + moves_block() + needs_block() )


# --------------------------------------------------------------------------
# the dialog: review and confirm
# --------------------------------------------------------------------------
WEEKS = [[1, 1, 1, 1, 0, 0, 0], [0, 0, 0, 1, 1, 1, 1], [1, 1, 0, 0, 0, 1, 1], [0, 1, 1, 1, 1, 0, 0], [1, 0, 0, 0, 1, 1, 1]]
DAYS = "MTWTFSS"
HOURS_TXT = ["Mon–Thu 08–20", "Thu–Sun 20–08", "Sat–Tue 08–20", "Tue–Fri 20–08", "Fri–Mon 20–08"]


def week(k: int, gap: bool = False) -> str:
    w = WEEKS[k % len(WEEKS)]
    return f'<span class="hr-wk{" gap" if gap else ""}" data-tip="{HOURS_TXT[k % len(HOURS_TXT)]}">' + "".join(
        f'<i class="{"on" if d else ""}"></i>' for d in w) + "</span>"


def dperson(p: dict, k: int, moved: bool = False) -> str:
    sub = (f'<small class="mv">moved from {SITES[p["from"]][2]}</small>' if moved else f'<small>{p.get("age", 30 + k)} · hired</small>')
    return (f'<div class="hr-dp"><span class="who"><b>{esc(p["name"])}</b>{sub}</span><span class="r">{p["role"]}</span>'
            f'<span class="m">{p["skill"]}%</span><span class="m">${p["wage"]}</span>{week(k)}<span class="m">{HOURS[p["role"]]} h</span></div>')


def gap_row(role: str, k: int) -> str:
    return (f'<div class="hr-dp gap"><span class="who"><b>Nobody</b><small>no {role} passes your filters</small></span><span class="r">{role}</span>'
            f'<span class="m">–</span><span class="m">–</span>{week(k, gap=True)}<span class="m">42 h</span></div>')


def dsite(k: str, open_: bool = False, state: str = "ready") -> str:
    hood, biz, street, kind, new, plan = SITES[k]
    ppl = AT[k]
    moved = [p for p in MOVED_CS + MOVED_CL if (k == "t2" and p in MOVED_CS) or (k == "tw" and p in MOVED_CL)]
    gaps = 2 if k == "tw" else 0
    cost = sum(per_day(p) for p in ppl)
    n = 0

    def dot(cls):
        nonlocal n
        n += 1
        return f'<i class="{cls}" style="--k:{n}"></i>'
    if state == "ready":
        dots = "".join(dot("") for _ in ppl) + "".join(dot("mv") for _ in moved) + "".join(dot("gap") for _ in range(gaps))
    else:
        dots = "".join(dot("done" if state == "done" else "wait") for _ in ppl + moved)
    counts = f"{len(ppl)} hired" + (f'<span class="mvc">+{len(moved)} moved</span>' if moved else "")
    people = ""
    if open_:
        people = ('<div class="hr-dpeople"><div class="hr-dp hd"><span>Person</span><span>Role</span><span style="text-align:right">Skill</span>'
                  '<span style="text-align:right">$/h</span><span class="hr-wkd">' + "".join(f"<span>{d}</span>" for d in DAYS)
                  + '</span><span style="text-align:right">Week</span></div>'
                  + "".join(dperson(p, j) for j, p in enumerate(ppl)) + "".join(dperson(p, j + 3, True) for j, p in enumerate(moved))
                  + "".join(gap_row("Security Guard", j) for j in range(gaps)) + "</div>")
    return f"""
<div class="hr-dsite{" open" if open_ else ""}">
  <button type="button" class="hr-dhead" aria-expanded="{"true" if open_ else "false"}">
    <span><span class="nm"><span class="hood">{hood}</span><span class="s">{biz} · {street}</span>{NEW_TAG if new else ""}</span><span class="plan">{kind} · hours from {plan}</span></span>
    <span class="hr-dots">{dots}</span>
    <span class="c">{counts}<span class="cst">+{money(cost)}</span></span>
    {svg("chev")}
  </button>{people}
</div>"""


ORDER = ["t2", "tw", "t5", "tb", "w9", "f39", "lp"]


def review_ready() -> str:
    tl = (f'<div class="gw-tiles"><div class="gw-tile"><span class="gw-lab">Hire</span><div class="v">{HIRES}<small class="hr-u">of 36</small></div></div>'
          f'<div class="gw-tile"><span class="gw-lab">Move</span><div class="v">{MOVES}</div></div>'
          f'<div class="gw-tile"><span class="gw-lab">Wage bill</span><div class="v">+{money(BILL)}<small class="hr-u">a day</small></div></div></div>')
    sites = "".join(dsite(k, k == "t2") for k in ORDER)
    call = (f'<div class="gw-call warn"><span class="hr-i">{svg("alert")}</span><span><b>Wall Street 9: 2 Security Guard places stay empty</b>, '
            f'84 hours a week. Only 3 security guards pass your filters and 5 were needed. Loosen a filter, or hire them when the headhunter finds more.</span></div>')
    body = f"""{tl}
<p class="gw-lead">Filled dots are hires, hollow ones people moved in, dashed ones places nobody fills. Open a site for each person's days and hours.</p>
<div class="hr-dsites">{sites}</div>
{call}"""
    foot = lock_hint("Hires cannot be undone. Moves and hours can be changed in the game later.") + btn("Back", "ghost") + btn(f"Hire {HIRES}, move {MOVES}", "go", "right")
    return dialog("hire", f"Hire {HIRES}, move {MOVES}", f'<div class="gw-where"><span>{len(HIRE_SITES)} sites · hours from each site\'s plan</span></div>',
                  verdict("ok", "<b>The game can take all of them</b>", "checked 21:04"), body, foot, "hr-wide")


def review_asking() -> str:
    body = '<div class="gw-skel"><i></i><i></i><i></i></div>'
    foot = hint("Nothing is hired while the game is asked.") + btn("Back", "ghost") + btn(f"Hire {HIRES}, move {MOVES}", "go", "right", disabled=True)
    return dialog("hire", f"Hire {HIRES}, move {MOVES}", f'<div class="gw-where"><span>{len(HIRE_SITES)} sites</span></div>',
                  verdict("ask", "Asking the game whether it can take them", "dry run"), body, foot)


def review() -> str:
    return (top("Review and confirm", "“Review” on the Staff page opens this. The game is asked first (a dry run, as every write does), then one confirm hires, "
                "assigns and sets the hours of everyone at once. Hiring has no undo, in the game or here, so the button says exactly what it does.")
            + stage([col("01", "Ready · one site open, one place nobody fills", review_ready(), 640),
                     col("02", "The game is still being asked", review_asking())]))


def small_sites(state: str) -> str:
    return '<div class="hr-dsites">' + "".join(dsite(k, False, state) for k in ORDER[:4]) + "</div>"


def after_applying() -> str:
    body = f'<div class="hr-prog"><i></i></div>{small_sites("wait")}<p class="quiet" style="margin:0">and 3 more sites</p>'
    return dialog("hire", f"Hire {HIRES}, move {MOVES}", f'<div class="gw-where"><span>{len(HIRE_SITES)} sites</span></div>',
                  verdict("busy", "Hiring, moving and setting hours", "in the game"), body,
                  hint("Keep the game running for a moment.") + btn("Working", "go busy", disabled=True))


def after_done() -> str:
    tl = (f'<div class="gw-tiles"><div class="gw-tile"><span class="gw-lab">Hired</span><div class="v">{HIRES}</div></div>'
          f'<div class="gw-tile"><span class="gw-lab">Moved</span><div class="v">{MOVES}</div></div>'
          f'<div class="gw-tile"><span class="gw-lab">Hours set</span><div class="v">{len(HIRE_SITES)}<small class="hr-u">sites</small></div></div></div>')
    body = f"""{tl}
<p class="gw-lead">Everyone starts on their hours from the next hour in the game. The wage bill is <b>+{money(BILL)} a day</b>.</p>
{small_sites("done")}
<div class="gw-call warn"><span class="hr-i">{svg("alert")}</span><span><b>Wall Street 9 still needs 2 Security Guard.</b> The line stays on the Staff page until someone passes your filters.</span></div>
<div class="gw-reread"><span>Reading the game again</span><div class="gw-prog"><i></i></div></div>"""
    return dialog("hire", "Done in the game", f'<div class="gw-where"><span>{len(HIRE_SITES)} sites</span></div>',
                  verdict("ok", f"<b>{HIRES} hired, {MOVES} moved</b>", "21:05"), body,
                  lock_hint("No undo. Let someone go in MyEmployees.") + btn("Close", "go"))


def after_partial() -> str:
    gone = [r for r in CS if r["site"] == "tb"][:2]
    nxt = [r for r in CS if not r["out"] and not r["site"] and not r["breaks"]][:2]
    chips = "".join(f'<span class="gw-chip warn"><span class="hr-struck">{esc(r["name"])}</span> · {r["skill"]}%</span>' for r in gone)
    body = f"""<p class="gw-said warn">2 candidates left the headhunter's list before the game reached them.</p>
<div class="gw-chips">{chips}</div>
<div class="gw-call info"><span class="hr-i">{svg("info")}</span><span>Everyone else is hired, moved and on their hours. <b>Bleecker Street 40 still has 2 Customer Service places open</b>; their hours wait, unfilled.</span></div>
<div class="gw-call"><span class="hr-i">{svg("person")}</span><span>Next best who pass your filters: <b>{esc(nxt[0]["name"])}</b> {nxt[0]["skill"]}% and <b>{esc(nxt[1]["name"])}</b> {nxt[1]["skill"]}%.</span></div>"""
    return dialog("hire", f"{HIRES - 2} of {HIRES} hired", f'<div class="gw-where"><span>{len(HIRE_SITES)} sites</span></div>',
                  verdict("moved", f"<b>{HIRES - 2} hired, {MOVES} moved</b>", "2 had left"), body,
                  hint("Opens the review for the two places only.") + btn("Close", "ghost") + btn("Pick 2 more", "go", "right"))


def after_refused() -> str:
    body = f"""<div class="gw-no"><span class="ic">{svg("phone")}</span><span class="rule">MyEmployees is open in the game</span>
<span class="fix">{svg("right")}Close the MyEmployees app on your phone in the game, then try again.</span></div>
<p class="gw-lead">Nothing was hired or moved. Your picks are kept.</p>"""
    return dialog("hire", f"Hire {HIRES}, move {MOVES}", f'<div class="gw-where"><span>{len(HIRE_SITES)} sites</span></div>',
                  verdict("no", "<b>The game said no</b>", "screen_open"), body,
                  hint("The game cannot hire while you are in that app.") + btn("Close", "ghost") + btn("Try again", "go", "refresh"))


def after() -> str:
    return (top("After the confirm", "What the dialog shows once Peter has confirmed: while the game works, the success summary (no Undo, unlike every other write), "
                "a partial result when candidates left the list in the meantime, and the refusal while the MyEmployees app is open.")
            + stage([col("01", "Working", after_applying()), col("02", "Done", after_done()),
                     col("03", "Partial · 2 candidates had left", after_partial()), col("04", "Refused · MyEmployees open", after_refused())]))


# --------------------------------------------------------------------------
# phone
# --------------------------------------------------------------------------
def phone() -> str:
    cards = ""
    for code, role, count, kinds, quotas, picked, found, passing, short in NEEDS[:3]:
        bar = f'<i style="--w:{picked / count * 100:.0f}%"></i>' + (f'<u style="--short:{short / count * 100:.0f}%"></u>' if short else "")
        cards += f"""
<div class="hr-pcard">
  <div class="top"><span class="hr-code">{code}</span><b>Hire <em>{count}</em> {role}</b><span class="hr-cost">+{money(ROLE_BILL.get(role, 0))}</span></div>
  <div class="hr-sites" style="margin:0">{"".join(site_tag(k, c) for k, c in quotas)}</div>
  <div class="bot"><div class="hr-pool"><div class="tr">{bar}</div><small><b>{picked}</b> of {count} picked{f' · <span class="warn">{short} short</span>' if short else ""} · {passing} pass</small></div>
    <button type="button" class="hr-open">Candidates{svg("chev")}</button></div>
</div>"""
    mv = "".join(f'<div class="hr-pmove"><b>Move {n} {r}</b><span class="hr-route">{site_tag("t7")}<span class="arr">{svg("right")}</span>{site_tag(b)}</span></div>'
                 for n, r, b in [(2, "Customer Service", "t2"), (1, "Cleaning", "tw")])
    return f"""
<div class="hr-phone">
<div class="pin">
  <div class="hr-pm"><span class="wm">{COMPANY}<i></i></span><span class="clk">Day 214 · Tue 21:04<small>COMPANY</small></span></div>
  {subnav()}
  <div class="hr-head"><div><h1>Staff</h1></div><div class="aside">{linked()}</div></div>
  <div class="sstats hr-tiles">
    <div class="sstat"><span class="lab">To hire</span><div class="v">{HIRES}</div></div>
    <div class="sstat"><span class="lab">To move</span><div class="v">{MOVES}</div></div>
    <div class="sstat"><span class="lab">Wage bill</span><div class="v">+{money(BILL)}</div></div>
    <div class="sstat"><span class="lab">Candidates</span><div class="v">1,566</div></div>
  </div>
  <section class="hr-block">{sechead("move", "Move first", quiet=f"{MOVES} people")}{mv}</section>
  <section class="hr-block">{sechead("hire", "Hire", quiet="5 roles", go=True, aside='<button type="button" class="gw-mini-b">' + svg("filter") + 'Filters · 2</button>')}{cards}</section>
</div>
<div class="hr-fade"></div>
<div class="hr-pbar">
  <div class="row"><div><b>{HIRES} hires · {MOVES} moves</b><small>+{money(BILL)} a day · {len(HIRE_SITES)} sites</small></div>{btn("Review", "go", "right")}</div>
  {hint("Nothing changes until you confirm on the next step.")}
</div>
</div>"""


# --------------------------------------------------------------------------
# behaviour every artboard carries; each part does nothing where its elements are absent
# --------------------------------------------------------------------------
WIRE = r"""
    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    document.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a && (a.getAttribute('href') || '#').charAt(0) === '#') e.preventDefault(); });

    // a role's candidates open under its line
    $$('[data-open]').forEach(b => b.addEventListener('click', () => {
      const row = b.closest('.hr-need'); const d = row.nextElementSibling; if (!d) return;
      const on = !row.classList.contains('open');
      row.classList.toggle('open', on); d.classList.toggle('open', on && d.children.length > 0); b.setAttribute('aria-expanded', on ? 'true' : 'false');
    }));
    // a site in the review opens for its people
    $$('.hr-dhead').forEach(b => b.addEventListener('click', () => {
      const s = b.closest('.hr-dsite'); if (!$('.hr-dpeople', s)) return;
      const on = !s.classList.contains('open'); s.classList.toggle('open', on); b.setAttribute('aria-expanded', on ? 'true' : 'false');
    }));
    // a move unticked: those people stay, and the role is hired instead
    $$('[data-move]').forEach(cb => cb.addEventListener('change', () => cb.closest('.hr-move').classList.toggle('off', !cb.checked)));
    // option B: the role list
    $$('.hr-rbtn').forEach(b => b.addEventListener('click', () => {
      $$('.hr-rbtn', b.closest('.hr-rlist')).forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    }));

    // the auto-pick: most skilled first; filters; a candidate goes only where a place is left
    // and the site meets their demands; unticking one lets the next best in
    const pick = (pool) => {
      const ex = new Set($$('.hr-dem[aria-pressed="true"]', pool).map(b => b.dataset.dem));
      const ms = $('[data-minskill]', pool), mw = $('[data-maxwage]', pool);
      const minS = ms ? +ms.value : 0, maxW = mw ? +mw.value : 1e9;
      if (ms) $('[data-minskill-out]', pool).textContent = minS + '%';
      if (mw) $('[data-maxwage-out]', pool).textContent = '$' + maxW;
      const quotas = JSON.parse(pool.dataset.quota || '[]').map(q => ({ k: q[0], left: q[1], tag: q[2] }));
      const need = quotas.reduce((a, q) => a + q.left, 0);
      let picked = 0, pass = 0, out = 0;
      $$('tr[data-cand]', pool).forEach(r => {
        const dem = (r.dataset.dem || '').split(' ').filter(Boolean);
        const ok = dem.every(d => !ex.has(d)) && +r.dataset.skill >= minS && +r.dataset.wage <= maxW;
        r.classList.toggle('hr-out', !ok);
        let site = null, over = false;
        if (ok) {
          pass++;
          const forced = r.dataset.force === '1';
          if (forced || (r.dataset.skip !== '1' && r.dataset.breaks !== '1' && picked < need)) {
            const only = r.dataset.only ? r.dataset.only.split(' ') : null;
            site = quotas.find(q => q.left > 0 && (!only || only.includes(q.k))) || null;
            if (site) { site.left--; picked++; } else if (forced) { over = true; picked++; }
          }
        } else out++;
        r.classList.toggle('hr-picked', !!site || over);
        const cb = $('.hr-cb', r); if (cb) cb.checked = !!site || over;
        const to = $('.hr-to', r);
        if (to) to.innerHTML = site ? site.tag : over ? '<span class="hr-over">over the plan: pick a site</span>'
          : r.dataset.breaks === '1' ? '<span class="hr-nop">no site meets a demand</span>'
          : (ok && r.dataset.only && r.dataset.skip !== '1' && picked < need) ? '<span class="hr-over">sites with a Coffee Machine are full</span>' : '';
      });
      if (pool.dataset.base0 === undefined) { pool.dataset.base0 = pass; pool.dataset.out0 = out; }
      $$('[data-n-picked]', pool).forEach(e => { e.textContent = picked; });
      $$('[data-n-pass]', pool).forEach(e => { e.textContent = +pool.dataset.passBase + pass - +pool.dataset.base0; });
      $$('[data-n-out]', pool).forEach(e => { e.textContent = +pool.dataset.outBase + out - +pool.dataset.out0; });
      $$('[data-pick-bar]', pool).forEach(e => { e.style.setProperty('--w', Math.min(100, picked / need * 100) + '%'); });
    };
    $$('[data-pool]').forEach(pool => {
      $$('.hr-dem', pool).forEach(b => b.addEventListener('click', () => {
        b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); pick(pool);
      }));
      $$('[data-minskill],[data-maxwage]', pool).forEach(i => i.addEventListener('input', () => pick(pool)));
      $$('tr[data-cand] .hr-cb', pool).forEach(cb => cb.addEventListener('click', () => {
        const r = cb.closest('tr'); const was = r.classList.contains('hr-picked');
        if (was) { if (r.dataset.force === '1') delete r.dataset.force; else r.dataset.skip = '1'; }
        else { if (r.dataset.skip === '1') delete r.dataset.skip; else r.dataset.force = '1'; }
        pick(pool);
      }));
      pick(pool);
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
<div class="board __KIND__ {{theme}}" style="width: __W__px; height: __H__px;">
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
<body><div class="board __KIND__ __THEME__" style="width: __W__px;">
__BODY__
</div>
<script>window.addEventListener('load', function () {__WIRE__});</script></body></html>
"""


def page(builder):
    return lambda: f'<div class="wrap">{masthead()}{builder()}</div>'


def cols_w(widths: list[int]) -> int:
    return 64 * 2 + sum(widths) + (len(widths) - 1) * 56


W = 1440
# file, title, builder, kind, width, height, x, y
BOARDS = [
    ("Main.dc.html", "1 · Staff page · needs and moves", page(overview), "hr-page", W, 2300),
    ("CandidatesDrawer.dc.html", "2A · Candidates in a drawer under the role", page(drawer_page), "hr-page", W, 2580),
    ("CandidatesTable.dc.html", "2B · Candidates as a full table", page(table_page), "hr-page", W, 1700),
    ("Review.dc.html", "3 · Review and confirm", review, "gw-board", cols_w([640, 480]), 1580),
    ("After.dc.html", "4 · After the confirm", after, "gw-board", cols_w([480] * 4), 1000),
    ("NotLinked.dc.html", "5 · Game not linked", page(not_linked), "hr-page", W, 1640),
    ("Phone.dc.html", "6 · Phone", phone, "hr-page", 390, 844),
]

TIPS = {
    "Main.dc.html": "Company › Staff replaces Payroll. Top to bottom: what hiring would do (tiles), moves first, one line a role summed over every planned site, the roles the board does not plan, the action bar, and Payroll as it was. Untick a move; hover a site chip, a tile or a count.",
    "CandidatesDrawer.dc.html": "OPTION A (recommended). Click “Candidates” on a line: its people open under it. Play with the demand chips and the two sliders: the picks, the counts and the bar above re-run. Untick a picked person and the next best steps in; tick an unpicked one to add them. Hover a demand: green tick = the site meets it, red = no site does.",
    "CandidatesTable.dc.html": "OPTION B. The same pool as a view of its own: roles down the left (planned first, then what the headhunters found for HQ and warehouses), filters under them, one big table. Same picking rules and controls as A.",
    "Review.dc.html": "Click a site row to open or close its people. Filled dot = hire, hollow = moved in, dashed = a place nobody fills. The week strip is which days each person works; hover it for the hours.",
    "After.dc.html": "No Undo in 02: hiring cannot be undone, so the dialog says where to let someone go instead. 03 is the partial answer when candidates expired between the dry run and the hire.",
    "NotLinked.dc.html": "Read from a save file: the plan, the moves and the picks still work, so Peter can prepare the list; Review is disabled until the game is linked. Candidates' hours left are as of the save.",
    "Phone.dc.html": "At phone width each role is a card; the action bar sits at the bottom. Candidates opens the role as a full-screen list (not drawn).",
}


def css(theme: str) -> str:
    base = BOARD_CSS.replace("@import url('" + FONTS + "');", "")
    base = base.replace("body{margin:0;background:#0d100f}", "body{margin:0;background:" + ("#eef0ea" if theme == "light" else "#0d100f") + "}")
    return base + GW_CSS + HR_CSS


def build(preview: bool = False) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    boards, order, notes = {}, [], {}
    # layout: the page on its own row, the two options side by side, then the dialogs, then not linked; the phone beside the page
    pos = {"Main.dc.html": (0, 0), "Phone.dc.html": (W + 160, 0),
           "CandidatesDrawer.dc.html": (0, 2300 + 400), "CandidatesTable.dc.html": (W + 160, 2300 + 400)}
    y = 2300 + 400 + 2580 + 400
    for name_, title, builder, kind, w, h in BOARDS:
        body = builder()
        props = {"dark": {"editor": "boolean", "default": True, "section": "Theme"}, "$preview": {"width": w, "height": h}}
        page_ = (PAGE.replace("__TITLE__", "Staff: " + title).replace("__FONTS__", FONTS.replace("&", "&amp;"))
                 .replace("__CSS__", css("dark")).replace("__KIND__", kind).replace("__W__", str(w)).replace("__H__", str(h))
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
                    .replace("__KIND__", kind).replace("__THEME__", theme).replace("__W__", str(w)).replace("__BODY__", body).replace("__WIRE__", WIRE),
                    encoding="utf-8", newline="\n")
        if name_ in pos:
            bx, by = pos[name_]
        else:
            bx, by = 0, y
            y += h + 400
        boards[name_] = {"x": bx, "y": by, "w": w, "h": h, "title": title, "is_interactive": True}
        order.append(name_)
        notes["try-" + name_.split(".")[0].lower()] = {"x": bx, "y": by - 250, "w": 560 if w > 390 else 390, "maxH": 190, "text": TIPS[name_]}
    index = {"v": 3, "createdOnFiles": {"v": 1, "at": CREATED_AT}, "title": "Big Copilot Staff Hire", "launch": {"view": "canvas"},
             "pages": [], "boards": boards, "order": order, "notes": notes, "designSystems": []}
    (ROOT / "canvas.json").write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8", newline="\n")
    print("wrote", len(order), "artboards;", HIRES, "hires,", MOVES, "moves, bill", money(BILL), "cs picked", CS_PICKED)


if __name__ == "__main__":
    build("--preview" in sys.argv)
