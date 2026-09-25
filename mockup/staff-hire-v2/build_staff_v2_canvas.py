"""Generates the Staff page canvas, second version: project/*.dc.html and project/canvas.json.

Issue #89 / PR #121. Peter could not read the first built Staff page: too many pills, too much
text, "?" hovers that said little, and the one action at the foot of the page. This canvas
redraws the same capability with one path (what is open, who fills it, one button), plain
wording, information set apart from actions, and a single filter control. Decisions, the
wording table and open questions are NOTES.md beside this file.

The board's stylesheet comes from mockup/revamp/build_canvas.py and the write dialog shell from
mockup/write-dialogs/build_write_canvas.py, so they never drift. Every class added here carries
the hs- prefix (unused on the board today; the shipped page's hr- classes are what it replaces).

Never hand-edit project/: change this and rerun. `--preview` also writes plain HTML copies into
_preview/ (both themes) for screenshots; do not commit _preview/.

The canvas is published at https://claude.ai/artifact/5oAjDxydxpEWJPs3GCHsS7.
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

CREATED_AT = "2026-09-25T15:00:00Z"
FONTS = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"

# --------------------------------------------------------------------------
# the page's own stylesheet, all under hs-
# --------------------------------------------------------------------------
HS_CSS = r"""
.board{--gw-on:#08130d}
.board.light{--gw-on:#ffffff}
.board.hs-page{min-width:0;min-height:0;overflow:hidden}
.hs-i{display:inline-grid;place-items:center}
.hs-i svg{width:15px;height:15px}

/* page head --------------------------------------------------------------------- */
.hs-sub{display:flex;align-items:center;gap:12px;margin-top:26px}
.hs-head{display:flex;align-items:flex-end;gap:24px;margin-top:22px}
.hs-head h1{margin:0;font-size:28px;font-weight:600;letter-spacing:-.02em}
.hs-head p{margin:6px 0 0;color:var(--ink-2);font-size:14px;max-width:640px;text-wrap:pretty}
.hs-head .aside{margin-left:auto}
.hs-link{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink-2);white-space:nowrap}
.hs-link i{width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--accent-soft)}
.hs-link.off i{background:var(--ink-3);box-shadow:0 0 0 4px color-mix(in srgb,var(--ink-3) 20%,transparent)}
.hs-link.old i{background:var(--warn);box-shadow:0 0 0 4px color-mix(in srgb,var(--warn) 20%,transparent)}

/* buttons: only where you act ------------------------------------------------------ */
.hs-cta{display:inline-flex;align-items:center;justify-content:center;gap:10px;height:48px;padding:0 22px;border-radius:12px;border:1px solid var(--accent);background:var(--accent);color:var(--gw-on);font:600 15px/1 Archivo,sans-serif;text-decoration:none;cursor:pointer;white-space:nowrap;transition:filter .15s,transform .2s cubic-bezier(.34,1.56,.64,1)}
.hs-cta:hover{filter:brightness(1.08);transform:translateY(-1px);color:var(--gw-on)}
.hs-cta svg{width:17px;height:17px}
.hs-cta.wide{width:100%}
.hs-cta[aria-disabled="true"]{background:transparent;border:1px dashed var(--rule);color:var(--ink-3);cursor:not-allowed;filter:none;transform:none}
.hs-btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);font:500 12.5px/1 Archivo,sans-serif;text-decoration:none;cursor:pointer;white-space:nowrap;transition:border-color .15s,transform .2s}
.hs-btn:hover{border-color:var(--ink-3);color:var(--ink);transform:translateY(-1px)}
.hs-btn svg{width:13px;height:13px}
.hs-btn.quiet{border-color:transparent;background:none;color:var(--ink-2)}
.hs-btn.quiet:hover{border-color:var(--rule)}
.hs-note{font-size:12.5px;line-height:1.45;color:var(--ink-3);text-wrap:pretty}
.hs-note b{color:var(--ink-2);font-weight:600}

/* option A: the summary at the top ------------------------------------------------- */
.hs-hero{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:40px;align-items:center;margin-top:26px;padding:24px 26px;border-radius:14px;background:var(--surface);border:1px solid var(--rule)}
.hs-hero h2{margin:0 0 14px;font-size:20px;font-weight:600;letter-spacing:-.01em}
.hs-plan{display:flex;flex-direction:column;gap:9px;margin:0;padding:0;list-style:none}
.hs-plan li{display:grid;grid-template-columns:52px minmax(0,1fr);gap:12px;align-items:baseline;font-size:14px;color:var(--ink-2)}
.hs-plan li b{font:500 18px/1 "IBM Plex Mono",monospace;color:var(--ink);text-align:right}
.hs-plan li strong{color:var(--ink);font-weight:600}
.hs-plan li.short b,.hs-plan li.short strong{color:var(--warn)}
.hs-act{display:flex;flex-direction:column;gap:10px}
.hs-facts{display:flex;gap:40px;margin-top:18px;padding:0 4px}
.hs-fact{display:flex;flex-direction:column;gap:4px}
.hs-fact span{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.hs-fact b{font:500 18px/1.1 "IBM Plex Mono",monospace;letter-spacing:-.01em}
.hs-fact small{font-size:12px;color:var(--ink-3)}
.hs-fact small.warn{color:var(--warn)}

/* steps ------------------------------------------------------------------------------- */
.hs-step{margin-top:44px}
.hs-shead{display:flex;align-items:center;gap:12px}
.hs-shead h2{margin:0;font-size:18px;font-weight:600;letter-spacing:-.01em}
.hs-shead .n{width:26px;height:26px;border-radius:50%;background:var(--raised);border:1px solid var(--rule);display:grid;place-items:center;font:600 12px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.hs-shead .n.go{background:var(--accent-soft);border-color:transparent;color:var(--accent)}
.hs-shead .count{font:500 13px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.hs-shead .aside{margin-left:auto;display:flex;gap:8px;align-items:center}
.hs-lead{margin:8px 0 14px 38px;font-size:13.5px;line-height:1.5;color:var(--ink-2);max-width:780px;text-wrap:pretty}
.hs-lead b{color:var(--ink);font-weight:600}
.hs-body{margin-left:38px}

/* tables ------------------------------------------------------------------------------- */
.hs-t{width:100%}
.hs-t th,.hs-t td{padding:12px 12px;vertical-align:middle}
.hs-t th.l,.hs-t td.l{text-align:left}
.hs-t tbody td{color:var(--ink-2)}
.hs-t tbody tr:hover td{background:color-mix(in srgb,var(--surface) 70%,transparent)}
.hs-t td.hs-rn{font-family:Archivo,sans-serif;white-space:normal}
.hs-t td.hs-rn b{display:block;color:var(--ink);font-weight:600;font-size:14px}
.hs-t td.hs-rn small{display:block;margin-top:3px;font-size:12px;color:var(--ink-3);line-height:1.45}
.hs-t td.num{color:var(--ink)}
.hs-t td.num small{color:var(--ink-3);font-size:11.5px;margin-left:3px}
.hs-t td.num small.ln{display:block;margin:4px 0 0}
.hs-t td.warn,.hs-t td .warn{color:var(--warn)}
.hs-t td.dim{color:var(--ink-3)}
.hs-t td.act{width:1%;padding-right:4px}
.hs-t td.txt{font-family:Archivo,sans-serif;white-space:normal;font-size:13px}
.hs-t tr.off td{opacity:.45}
.hs-t tr.hs-subrow td{padding-top:0;border-bottom:1px solid var(--rule-soft)}
.hs-t tr.has-sub td{border-bottom:0}
.hs-t tfoot td{font-size:13px}
.hs-t tfoot td.l{font-family:Archivo,sans-serif;font-weight:600}
.hs-where{font-size:12px;color:var(--ink-3);line-height:1.5}
.hs-where em{font-style:normal;color:var(--ink-2)}
.hs-tag{font:600 9.5px/1 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--info);margin-left:6px}

/* the reassign line under a role (option B) and the reassign table (option A) ------------ */
.hs-re{display:flex;align-items:center;gap:14px;padding:10px 14px;border-radius:10px;background:var(--raised);font-size:13px;color:var(--ink-2);text-wrap:pretty}
.hs-re .hs-i{color:var(--accent)}
.hs-re b{color:var(--ink);font-weight:600}
.hs-re label{margin-left:auto;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;color:var(--ink);font-weight:500;cursor:pointer}

/* the checkbox -------------------------------------------------------------------------- */
.hs-cb{appearance:none;-webkit-appearance:none;margin:0;width:18px;height:18px;border-radius:5px;border:1.5px solid var(--ink-3);background:transparent;display:inline-grid;place-items:center;cursor:pointer;vertical-align:middle;flex:none;transition:background .15s,border-color .15s}
.hs-cb::after{content:"";width:9px;height:5px;border-left:2px solid var(--gw-on);border-bottom:2px solid var(--gw-on);transform:rotate(-45deg) scale(0);margin-top:-3px;transition:transform .2s cubic-bezier(.34,1.56,.64,1)}
.hs-cb:checked{background:var(--accent);border-color:var(--accent)}
.hs-cb:checked::after{transform:rotate(-45deg) scale(1)}
.hs-cb:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.hs-radio{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--ink-2);cursor:pointer}
.hs-radio input{accent-color:var(--accent);margin:0}

/* the one filter control -------------------------------------------------------------------- */
.hs-fbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px}
.hs-fbar .lab{font-size:13px;color:var(--ink-2);margin-right:4px}
.hs-sel{position:relative;display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 10px 0 12px;border-radius:9px;border:1px solid var(--rule);background:var(--surface);color:var(--ink-2);font:500 13px/1 Archivo,sans-serif;cursor:pointer;white-space:nowrap;transition:border-color .15s}
.hs-sel:hover,.hs-sel[aria-expanded="true"]{border-color:var(--ink-3)}
.hs-sel b{color:var(--ink);font-weight:600}
.hs-sel b.set{color:var(--accent)}
.hs-sel svg{width:12px;height:12px;color:var(--ink-3);transform:rotate(90deg)}
.hs-popw{position:relative;display:inline-flex}
.hs-pop{display:none;position:absolute;left:0;top:calc(100% + 6px);z-index:20;width:330px;padding:8px;border-radius:12px;background:var(--surface);border:1px solid var(--rule);box-shadow:0 24px 50px -20px #000c}
.light .hs-pop{box-shadow:0 24px 50px -24px #1a1f1c66}
.hs-pop.open{display:block}
.hs-pop .ph{padding:6px 8px 8px;font-size:12px;color:var(--ink-3);line-height:1.4}
.hs-opt{display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:10px;align-items:center;padding:7px 8px;border-radius:7px;font-size:13px;color:var(--ink);cursor:pointer}
.hs-opt:hover{background:var(--raised)}
.hs-opt small{font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.hs-pop .pf{display:flex;justify-content:space-between;align-items:center;padding:8px 8px 2px;border-top:1px solid var(--rule-soft);margin-top:6px}
.hs-fsum{font-size:12.5px;color:var(--ink-3);margin-left:auto}
.hs-fsum b{color:var(--ink-2);font-weight:500;font-family:"IBM Plex Mono",monospace}

/* option B: the order panel on the right ---------------------------------------------------- */
.hs-split{display:grid;grid-template-columns:minmax(0,1fr) 332px;gap:36px;align-items:start;margin-top:28px}
.hs-order{position:sticky;top:20px;display:flex;flex-direction:column;gap:16px;padding:20px;border-radius:14px;background:var(--surface);border:1px solid var(--rule)}
.hs-order h3{margin:0;font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
.hs-ol{display:flex;flex-direction:column;gap:12px;margin:0;padding:0;list-style:none}
.hs-ol li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;align-items:baseline}
.hs-ol li span{font-size:14px;font-weight:600;color:var(--ink)}
.hs-ol li b{font:500 20px/1 "IBM Plex Mono",monospace}
.hs-ol li small{grid-column:1/-1;font-size:12px;color:var(--ink-3);line-height:1.4}
.hs-ol li.short span,.hs-ol li.short b{color:var(--warn)}
.hs-sum{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;padding-top:14px;border-top:1px solid var(--rule-soft);font-size:13px;color:var(--ink-2)}
.hs-sum b{font:500 14px/1.2 "IBM Plex Mono",monospace;color:var(--ink);text-align:right}
.hs-sum b.big{font-size:18px}
.hs-cand{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:22px}
.hs-cand>div{padding:12px 14px;border-radius:10px;border:1px solid var(--rule-soft);background:var(--surface)}
.hs-cand span{display:block;font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.hs-cand b{display:block;margin-top:8px;font:500 18px/1 "IBM Plex Mono",monospace}
.hs-cand small{display:block;margin-top:5px;font-size:12px;color:var(--ink-3)}

/* not linked / mod too old ------------------------------------------------------------------ */
.hs-gate{display:flex;flex-direction:column;gap:8px;padding:14px;border-radius:10px;border:1px dashed var(--rule);font-size:13px;color:var(--ink-2);line-height:1.5}
.hs-gate b{color:var(--ink);font-weight:600}
.hs-gate ol{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px}
.hs-gate.warn{border-color:color-mix(in srgb,var(--warn) 55%,transparent);border-style:solid;background:color-mix(in srgb,var(--warn) 7%,transparent)}
.hs-gate.warn b{color:var(--warn)}
.hs-state{display:flex;align-items:baseline;gap:12px;margin:0 0 12px}
.hs-state b{font:600 11px/1 "IBM Plex Mono",monospace;letter-spacing:.14em;color:var(--accent)}
.hs-state span{font-size:13px;color:var(--ink-2)}
.hs-clip{position:relative;overflow:hidden;border-radius:14px;border:1px solid var(--rule-soft)}
.hs-clip::after{content:"";position:absolute;left:0;right:0;bottom:0;height:120px;background:linear-gradient(transparent,var(--ground))}
.hs-clip .wrap{padding-bottom:0}

/* payroll, set apart ---------------------------------------------------------------------- */
.hs-apart{margin-top:64px;padding-top:28px;border-top:1px solid var(--rule)}
.hs-apart .kick{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
.hs-pay{display:grid;grid-template-columns:1.3fr 1fr;gap:48px;align-items:start;margin-top:14px}
.hs-pay h2{margin:0 0 4px;font-size:17px;font-weight:600}
.hs-pay .facts{display:flex;flex-direction:column;gap:14px}
.hs-pay .facts div{display:flex;justify-content:space-between;align-items:baseline;padding-bottom:10px;border-bottom:1px solid var(--rule-soft);font-size:13px;color:var(--ink-2)}
.hs-pay .facts b{font:500 15px/1 "IBM Plex Mono",monospace;color:var(--ink)}
.hs-pay .facts b.warn{color:var(--warn)}
.hs-pay .roles{margin-top:12px}
.hs-pay .role{grid-template-columns:150px 1fr 44px}

/* change picks: the sheet ---------------------------------------------------------------- */
.hs-scrim{position:absolute;inset:0;background:color-mix(in srgb,var(--ground) 72%,#000 28%);opacity:.82;z-index:6}
.light .hs-scrim{background:#1a1f1c;opacity:.35}
.hs-sheet{position:absolute;top:0;right:0;bottom:0;width:940px;z-index:7;display:flex;flex-direction:column;background:var(--ground);border-left:1px solid var(--rule);box-shadow:-30px 0 80px -30px #000c}
.hs-sh{display:flex;align-items:flex-start;gap:16px;padding:26px 32px 18px;border-bottom:1px solid var(--rule-soft)}
.hs-sh h2{margin:0;font-size:22px;font-weight:600;letter-spacing:-.015em}
.hs-sh p{margin:6px 0 0;font-size:13.5px;color:var(--ink-2)}
.hs-sh .gw-x{margin-left:auto}
.hs-sb{flex:1;overflow:hidden;padding:18px 32px 0}
.hs-sb .hs-lead{margin:0 0 16px}
.hs-grp{display:flex;align-items:baseline;gap:10px;margin:18px 0 6px}
.hs-grp b{font-size:13.5px;font-weight:600}
.hs-grp span{font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.hs-c th,.hs-c td{padding:9px 10px}
.hs-c tbody td{color:var(--ink-2)}
.hs-c tbody tr.on td{color:var(--ink)}
.hs-c tbody tr.on{background:color-mix(in srgb,var(--accent) 6%,transparent)}
.hs-c td.nm{font-family:Archivo,sans-serif;text-align:left}
.hs-c td.nm b{font-weight:600}
.hs-c td.dem{font-family:Archivo,sans-serif;text-align:left;white-space:normal;font-size:12.5px;min-width:220px}
.hs-c td.dem .warn{color:var(--warn)}
.hs-c td.to{font-family:Archivo,sans-serif;text-align:left;font-size:12.5px}
.hs-c td.exp.warn{color:var(--warn)}
.hs-sk{display:inline-block;vertical-align:middle;width:46px;height:4px;border-radius:2px;background:var(--rule);margin-right:8px;overflow:hidden}
.hs-sk i{display:block;height:100%;width:var(--w);background:var(--accent)}
.hs-more{display:flex;gap:18px;align-items:center;margin-top:10px;font-size:12.5px;color:var(--ink-3)}
.hs-sf{display:flex;align-items:center;gap:16px;padding:16px 32px 22px;border-top:1px solid var(--rule);background:var(--surface)}
.hs-sf .tot{display:flex;gap:28px}
.hs-sf .tot div{display:flex;flex-direction:column;gap:5px}
.hs-sf .tot span{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.hs-sf .tot b{font:500 17px/1 "IBM Plex Mono",monospace}
.hs-sf .end{margin-left:auto;display:flex;gap:10px;align-items:center}
.hs-sf .hs-cta{height:42px;font-size:14px}

/* the dialog ------------------------------------------------------------------------------- */
.gw-dlg.hs-wide{width:640px}
.hs-ds{display:flex;flex-direction:column;border-top:1px solid var(--rule-soft)}
.hs-dsite{border-bottom:1px solid var(--rule-soft)}
.hs-dh{display:grid;grid-template-columns:minmax(0,1fr) auto 76px 14px;gap:14px;align-items:center;width:100%;padding:10px 4px;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;border-radius:8px;transition:background .15s}
.hs-dh:hover{background:var(--ground)}
.hs-dh .nm{display:block;font-size:13.5px;font-weight:600}
.hs-dh .pl{display:block;margin-top:2px;font-size:12px;color:var(--ink-3)}
.hs-dh .what{font-size:12.5px;color:var(--ink-2);text-align:right;white-space:nowrap}
.hs-dh .what .warn{color:var(--warn)}
.hs-dh .cst{font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink-3);text-align:right}
.hs-dh>svg{width:13px;height:13px;color:var(--ink-3);transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.hs-dsite.open .hs-dh>svg{transform:rotate(90deg)}
.hs-dp{display:none;padding:2px 4px 12px}
.hs-dsite.open .hs-dp{display:block}
.hs-pr{display:grid;grid-template-columns:minmax(0,1fr) 110px 40px 44px 118px 38px;gap:10px;align-items:center;padding:5px 4px;font-size:12.5px;border-radius:6px}
.hs-pr.hd{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}
.hs-pr .who b{font-weight:500}
.hs-pr .who small{display:block;font-size:11px;color:var(--ink-3)}
.hs-pr .who small.re{color:var(--accent)}
.hs-pr .m{font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-2);text-align:right}
.hs-wk{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}
.hs-wk i{height:10px;border-radius:2px;background:var(--rule-soft)}
.hs-wk i.on{background:var(--accent)}
.hs-wkd{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;text-align:center}
.hs-struck{text-decoration:line-through;text-decoration-color:var(--warn)}
.hs-lock{display:flex;align-items:center;gap:8px;margin:0;font-size:12.5px;color:var(--ink-2)}
.hs-lock svg{width:14px;height:14px;color:var(--warn);flex:none}
.hs-u{font-size:12px;color:var(--ink-3);font-family:Archivo,sans-serif}

/* phone ------------------------------------------------------------------------------------ */
.hs-phone{position:relative;width:390px;height:100%;overflow:hidden;background:var(--ground)}
.hs-phone .pm{display:flex;align-items:center;gap:10px;height:56px;padding:0 16px;border-bottom:1px solid var(--rule)}
.hs-phone .pm .wordmark{font-size:22px}
.hs-phone .pm .dot{width:8px;height:8px}
.hs-phone .pm .sp{margin-left:auto;font-size:12.5px;color:var(--ink-2)}
.hs-phone .pc{padding:16px 16px 120px;display:flex;flex-direction:column;gap:18px}
.hs-phone h1{margin:0;font-size:24px;font-weight:600;letter-spacing:-.02em}
.hs-phone .intro{margin:4px 0 0;font-size:13.5px;color:var(--ink-2)}
.hs-pcard{padding:16px;border-radius:14px;background:var(--surface);border:1px solid var(--rule)}
.hs-pcard .hs-plan li{grid-template-columns:40px minmax(0,1fr);font-size:13.5px}
.hs-pcard .hs-plan li b{font-size:16px}
.hs-plist{display:flex;flex-direction:column;border-top:1px solid var(--rule)}
.hs-prow{display:grid;grid-template-columns:minmax(0,1fr) auto 14px;gap:12px;align-items:center;min-height:64px;padding:10px 2px;border-bottom:1px solid var(--rule-soft);color:inherit;text-decoration:none}
.hs-prow b{display:block;font-size:14.5px;font-weight:600}
.hs-prow small{display:block;margin-top:2px;font-size:12px;color:var(--ink-3)}
.hs-prow .v{font:500 14px/1.2 "IBM Plex Mono",monospace;text-align:right}
.hs-prow .v small{font-family:Archivo,sans-serif}
.hs-prow .v.warn{color:var(--warn)}
.hs-prow>svg{width:13px;height:13px;color:var(--ink-3)}
.hs-phone h2{margin:0;font-size:16px;font-weight:600}
.hs-pbar{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;gap:6px;padding:12px 16px 20px;background:var(--surface);border-top:1px solid var(--rule)}
.hs-pbar .hs-note{text-align:center}

/* round 2: less copy, quick hire ------------------------------------------------------ */
.hs-head{align-items:center}
.hs-right{display:flex;flex-direction:column;gap:18px;position:sticky;top:20px}
.hs-right .hs-order{position:static}
.hs-shops{margin:-6px 0 12px}
.hs-facts2{margin:14px 0 0;font-size:13px;color:var(--ink-3)}
.hs-facts2 b{font:500 13.5px/1 "IBM Plex Mono",monospace;color:var(--ink)}
.hs-facts2 b.warn{color:var(--warn)}
.hs-scope{display:flex;gap:18px;align-items:center;margin:-2px 0 6px;font-size:12.5px;color:var(--ink-3)}
.hs-legend{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font:400 12px/1 Archivo,sans-serif!important;color:var(--warn)!important}
.hs-legend i{width:8px;height:8px;border-radius:2px;background:var(--warn)}
.hs-sel.empty b{color:var(--ink-3);font-weight:500}
.hs-quick{display:flex;flex-direction:column;gap:14px;padding:18px 20px 20px;border-radius:14px;background:var(--surface);border:1px solid var(--rule-soft)}
.hs-quick .qh{display:flex;align-items:center;gap:10px}
.hs-quick .qh .hs-i{width:28px;height:28px;border-radius:8px;background:var(--raised);color:var(--ink-2)}
.hs-quick .qh h3{margin:0;font-size:15px;font-weight:600}
.hs-quick .qh .sub{margin-left:auto;font-size:12px;color:var(--ink-3)}
.hs-quick .qf{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.hs-quick .fld{display:flex;flex-direction:column;gap:5px;min-width:0}
.hs-quick .fld.wide{grid-column:1/-1}
.hs-quick .fld>span:first-child{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.hs-quick .hs-sel{width:100%;justify-content:space-between;background:var(--ground)}
.hs-quick .hs-sel b{overflow:hidden;text-overflow:ellipsis}
.hs-popw.full{display:flex;width:100%}
.hs-popw.full .hs-pop{width:100%}
.hs-num{display:grid;grid-template-columns:34px minmax(0,1fr) 34px;height:34px;border-radius:9px;border:1px solid var(--rule);background:var(--ground);overflow:hidden}
.hs-num button{border:0;background:none;color:var(--ink-2);font:500 16px/1 Archivo,sans-serif;cursor:pointer}
.hs-num button:hover{background:var(--raised);color:var(--ink)}
.hs-num b{display:grid;place-items:center;font:500 14px/1 "IBM Plex Mono",monospace}
.hs-match{font-size:13px;color:var(--ink-2)}
.hs-match.none{margin:0;color:var(--ink-3)}
.hs-match summary{display:flex;align-items:center;gap:6px;cursor:pointer;list-style:none}
.hs-match summary::-webkit-details-marker{display:none}
.hs-match summary b{font:500 15px/1 "IBM Plex Mono",monospace;color:var(--accent)}
.hs-match summary svg{width:12px;height:12px;color:var(--ink-3);margin-left:auto;transition:transform .2s}
.hs-match[open] summary svg{transform:rotate(90deg)}
.hs-match ul,.hs-qlist{margin:8px 0 0;padding:0;list-style:none;display:flex;flex-direction:column}
.hs-match li,.hs-qlist li{display:grid;grid-template-columns:minmax(0,1fr) 44px 64px;gap:8px;padding:6px 0;border-bottom:1px solid var(--rule-soft);font-size:12.5px;color:var(--ink)}
.hs-match .m,.hs-qlist .m{font:500 12px/1.4 "IBM Plex Mono",monospace;color:var(--ink-2);text-align:right}
.hs-quick.ph{border:0;background:none;padding:0}
.hs-pcard .hs-ol li b{font-size:18px}
"""

# --------------------------------------------------------------------------
# icons: the site panel's and the write dialogs', plus a few
# --------------------------------------------------------------------------
P = {**SP_P, **GW_P,
     "move": '<path d="M4 8h13M13 4l4 4-4 4"></path><path d="M20 16H7M11 12l-4 4 4 4"></path>',
     "map": '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"></path><path d="M9 4v14M15 6v14"></path>',
     "wiki": '<path d="M5 4.500A1.500 1.500 0 0 1 6.500 3H19v15H6.500A1.500 1.500 0 0 0 5 19.500z"></path><path d="M5 19.500A1.500 1.500 0 0 0 6.500 21H19"></path>',
     "phone": '<rect x="7" y="2.500" width="10" height="19" rx="2"></rect><path d="M11 18.500h2"></path>',
     "chev": '<path d="M9 6l6 6-6 6"></path>',
     "back": '<path d="M19 12H5M11 6l-6 6 6 6"></path>',
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


def dialog(title: str, sub: str, verdict_html: str, body: str, foot: str, cls: str = "") -> str:
    return f"""<div class="gw-dlg {cls}" role="dialog" aria-label="{esc(title)}">
<div class="gw-head"><span class="gw-kind">{svg("hire")}</span><div><h2>{title}</h2>{sub}</div>
<button type="button" class="gw-x" aria-label="Close">{svg("close")}</button></div>
{verdict_html}
<div class="gw-body">{body}</div>
<div class="gw-foot">{foot}</div>
</div>"""


def gbtn(label: str, kind: str = "", icon: str = "", disabled: bool = False) -> str:
    lead = svg(icon) if icon in ("refresh", "plug") else ""
    tail = svg(icon, "go") if icon and not lead else ""
    dis = ' disabled="disabled"' if disabled else ""
    return f'<button type="button" class="gw-b {kind}"{dis}>{lead}{label}{tail}</button>'


def hint(text: str) -> str:
    return f'<span class="gw-hint">{text}</span>'


def lock(text: str) -> str:
    return f'<p class="hs-lock">{svg("lock")}<span>{text}</span></p>'


def col(num: str, label: str, content: str, width: int = 480) -> str:
    return f'<div class="gw-col" style="width: {width}px;"><div class="gw-state"><b>{num}</b><span>{label}</span></div>{content}</div>'


def stage(cols: list[str]) -> str:
    return f'<div class="gw-stage">{"".join(cols)}</div>'


def top(title: str, sub: str) -> str:
    return f'<div class="gw-top"><h1>{title}</h1><p>{sub}</p></div>'


# --------------------------------------------------------------------------
# the company: every name invented. The shape follows Peter's save on 25 Sep 2026:
# 22 Lawyers for one law firm, 20 Security Guards over 4 clothing stores, 1 Gym Trainer
# with no candidates, 2 Security Guards with no hours reassigned, 1,542 candidates.
# --------------------------------------------------------------------------
COMPANY = "Halden"
SITES = {  # key: business, street, kind, how its hours are planned
    "law": ("Halden Legal", "Park Avenue 88", "Law firm", "new office: the default office hours"),
    "w5": ("Halden Wear", "5th Avenue 12", "Clothing store", "hours from the staffing plan"),
    "wb": ("Halden Wear", "Bleecker Street 40", "Clothing store", "hours from the staffing plan"),
    "w2": ("Halden Wear", "2nd Avenue 31", "Clothing store", "new shop: open 24/7, full cover"),
    "ww": ("Halden Wear", "Wall Street 9", "Clothing store", "hours from the staffing plan"),
    "w7": ("Halden Wear", "7th Avenue 3", "Clothing store", "hours from the staffing plan"),
    "gym": ("Halden Fit", "Canal Street 5", "Gym", "hours from the staffing plan"),
}
SEC_AT = [("w5", 6), ("wb", 5), ("w2", 5), ("ww", 4)]
HIRE, REASSIGN, SHORT, OPEN_ = 42, 2, 1, 45
BILL, BILL_LAW, BILL_SEC, TODAY = 11_178, 7_842, 3_336, 96_410
CANDS, EXPIRING, OTHER_ROLES = 1_542, 249, 344
SITE_COUNT = 7  # sites with an open place: law, 4 hire shops, gym... and 7th Avenue loses two
HIRE_SITES = 6  # sites people are hired or reassigned into, gym excluded

PAYROLL = [("Customer Service", 214, 26_310), ("Cleaning", 118, 9_480), ("Security Guard", 96, 13_020), ("Lawyer", 58, 21_870),
           ("Delivery Driver", 41, 6_150), ("Factory Worker", 38, 7_210), ("Gym Trainer", 27, 5_060), ("Headhunter", 12, 3_190),
           ("HR Manager", 9, 1_880), ("Logistics Manager", 8, 1_310), ("Programmer", 8, 1_240), ("Purchasing Agent", 6, 650)]

# demands (the game's own names) and how many of all 1,542 candidates ask for each
DEMANDS = [("Full-time", 301), ("Silver Health Insurance", 47), ("Clean work environment", 45), ("Part-time", 44),
           ("No weekends", 41), ("No night shifts", 38), ("Four days week", 33), ("Coffee Machine", 31),
           ("Gold Health Insurance", 27), ("No evening shifts", 24), ("No morning shifts", 22), ("Five days week", 19),
           ("Bronze Health Insurance", 17), ("Water Cooler", 14), ("Printer", 12), ("No cleaning shifts", 11),
           ("Office Phone", 9), ("Peaceful work environment", 8), ("Sofa", 6), ("Desk Globe", 3)]

random.seed(121)
FIRST = ["Ada", "Bram", "Cleo", "Dario", "Edda", "Femi", "Greta", "Hollis", "Ines", "Jonas", "Kaia", "Lior", "Mara", "Nils",
         "Odile", "Pavel", "Quinn", "Rosa", "Soren", "Tamsin", "Ugo", "Vera", "Wim", "Xenia", "Yusuf", "Zora", "Anouk", "Basil",
         "Carys", "Dmitri", "Elif", "Fritz", "Gwen", "Hamid", "Isolde", "Joss", "Kofi", "Lena", "Milo", "Nadia"]
LAST = ["Achterberg", "Brandt", "Castell", "Duvall", "Engstrom", "Farrow", "Gallo", "Hartley", "Ilves", "Jansen", "Kestrel",
        "Lindqvist", "Moreau", "Novak", "Okafor", "Petrov", "Quist", "Rasmussen", "Sato", "Thorne", "Ueda", "Varga", "Wexler",
        "Yilmaz", "Zeller", "Aalto", "Bexley", "Cordero", "Dahl", "Eriksen"]
_used: set = set()


def name() -> str:
    while True:
        n = f"{random.choice(FIRST)} {random.choice(LAST)}"
        if n not in _used:
            _used.add(n)
            return n


def guards() -> list[dict]:
    """The Security Guard pool as the sheet shows it: 20 picked, then the next best."""
    rows, skill = [], 93
    sites = [k for k, n in SEC_AT for _ in range(n)]
    for i in range(26):
        skill -= random.choice([0, 1, 1, 2])
        wage = random.choice([24, 25, 26, 27, 28, 29, 30, 31])
        dem = random.sample(["Full-time", "Full-time", "Full-time", "No night shifts", "Clean work environment",
                             "Silver Health Insurance", "Four days week", "Coffee Machine", "Five days week"], random.choice([0, 1, 1, 2]))
        dem = list(dict.fromkeys(dem))
        rows.append({"name": name(), "skill": skill, "wage": wage, "dem": dem,
                     "site": sites[i] if i < 20 else None, "left": random.choice([5, 11, 19, 30, 52, 70, 96, 120, 141, 160])})
    # the marks the sheet explains: a demand the site lacks, and one the planned hours break
    rows[3]["dem"] = ["Full-time", "Coffee Machine"]
    rows[3]["miss"] = "Coffee Machine (none at Wall Street 9)"
    rows[3]["site"] = "ww"
    rows[7]["dem"] = ["No night shifts"]
    rows[7]["miss"] = "No night shifts (the plan gives them 22:00–04:00 on Fri)"
    rows[1]["left"] = 5
    rows[12]["left"] = 17
    return rows


GUARDS = guards()
MOVERS = [{"name": name(), "skill": 81, "wage": 27}, {"name": name(), "skill": 74, "wage": 25}]
HRM = [{"name": name(), "skill": 100, "wage": w} for w in (52, 54, 55, 57, 61, 58, 60)]  # quick hire: HR Managers at 100%

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
  <div class="clock tr"><b>Day 214<i>·</i>Tue 21:04</b><small>YEAR 3 · 23 SITES · 639 STAFF</small></div>
</header>"""


def subnav() -> str:
    views = [("Results", ""), ("Products", ""), ("Staff", "on"), ("Milestones", "")]
    return ('<div class="hs-sub"><nav class="seg" aria-label="Company views">'
            + "".join(f'<a class="{c}" href="#">{v}</a>' for v, c in views) + "</nav></div>")


def link_state(state: str) -> str:
    return {"on": '<span class="hs-link"><i></i>Game linked</span>',
            "off": '<span class="hs-link off"><i></i>Save file · game not linked</span>',
            "old": '<span class="hs-link old"><i></i>Mod 0.2.0 · too old to hire</span>'}[state]


def page_head(state: str = "on") -> str:
    return f"""{subnav()}
<div class="hs-head"><h1>Staff</h1><div class="aside">{link_state(state)}</div></div>"""


def cta(label: str = f"Review and hire {HIRE}", state: str = "on", wide: bool = False, href: str = "Review.dc.html") -> str:
    w = " wide" if wide else ""
    if state != "on":
        return f'<a class="hs-cta{w}" aria-disabled="true" href="#">{svg("plug")}<span>{label}</span></a>'
    return f'<a class="hs-cta{w}" href="{href}"><span>{label}</span>{svg("right")}</a>'


CTA_NOTE = "Picked for you. You confirm next."


# --------------------------------------------------------------------------
# shared blocks
# --------------------------------------------------------------------------
def dem_pop(chosen: set, open_: bool = False, cls: str = "") -> str:
    """The compact demand control: the chosen demands' names, or how many; a list in a popover."""
    opts = "".join(
        f'<label class="hs-opt"><input type="checkbox" class="hs-cb" data-dem{" checked" if d in chosen else ""}><span>{d}</span><small>{n}</small></label>'
        for d, n in DEMANDS[:10])
    shown = ", ".join(d for d, _ in DEMANDS if d in chosen) if 0 < len(chosen) <= 2 else f"{len(chosen)} demands" if chosen else "nobody"
    label = f'<b class="{"set" if chosen else ""}" data-dem-n>{shown}</b>'
    return f"""<span class="hs-popw{cls}"><button type="button" class="hs-sel" data-pop aria-expanded="{"true" if open_ else "false"}">Leave out who asks for: {label}{svg("chev")}</button>
<div class="hs-pop{" open" if open_ else ""}" data-popover>
  <div class="ph">Leave out anyone asking for:</div>
  {opts}
  <div class="pf"><a class="link" href="#">All 20 demands</a><a class="link" href="#">Clear</a></div>
</div></span>"""


def filter_bar(chosen: set = frozenset(), open_: bool = False, count: str = "", skill: str = "any", wage: str = "any") -> str:
    return f"""<div class="hs-fbar">
  {dem_pop(set(chosen), open_)}
  <button type="button" class="hs-sel">Skill at least: <b{' class="set"' if skill != "any" else ""}>{skill}</b>{svg("chev")}</button>
  <button type="button" class="hs-sel">Wage at most: <b{' class="set"' if wage != "any" else ""}>{wage}</b>{svg("chev")}</button>
  {f'<span class="hs-fsum">{count}</span>' if count else ""}
</div>"""


def sec_where() -> str:
    return ", ".join(f'{SITES[k][1]} ({n})' for k, n in SEC_AT)


def payroll() -> str:
    mx = max(n for _, n, _ in PAYROLL)
    roles = "".join(f'<div class="role"><span>{r}</span><span class="tr"><i style="width:{n / mx * 100:.0f}%"></i></span><span class="c">{n}</span></div>'
                    for r, n, _ in PAYROLL)
    return f"""
<section class="hs-apart">
  <span class="kick">Current staff</span>
  <div class="hs-pay">
    <div><h2>Payroll</h2><div class="roles">{roles}</div></div>
    <div class="facts">
      <div><span>People</span><b>639</b></div>
      <div><span>Wages a day</span><b>{money(TODAY)}</b></div>
      <div><span>Booked yesterday</span><b>$95,870</b></div>
      <div><span>Satisfaction</span><b>81%</b></div>
      <div><span>Unhappy</span><b class="warn">14</b></div>
      <div><span>Absent today</span><b class="warn">3</b></div>
    </div>
  </div>
</section>"""


# --------------------------------------------------------------------------
# the overview: one table, the order and its button in a panel on the right,
# quick hire under it
# --------------------------------------------------------------------------
def order_panel(state: str = "on") -> str:
    gate = gate_box(state) if state != "on" else f'<span class="hs-note">{CTA_NOTE}</span>'
    return f"""
<aside class="hs-order" aria-label="When you hire">
  <h3>When you hire</h3>
  <ul class="hs-ol">
    <li><span>Reassign</span><b>{REASSIGN}</b><small>7th Avenue 3 → Wall Street 9</small></li>
    <li><span>Hire</span><b>{HIRE}</b><small>22 Lawyers · 20 Security Guards</small></li>
    <li class="short"><span>Stays open</span><b>{SHORT}</b><small>Gym Trainer: no candidates</small></li>
  </ul>
  <div class="hs-sum"><span>Added wages</span><b class="big">+{money(BILL)}/day</b></div>
  {cta(state=state, wide=True)}
  {gate}
</aside>"""


def roles_table() -> str:
    return f"""
<table class="hs-t"><thead><tr><th class="l">Role</th><th>Open</th><th>Own staff</th><th>New hires</th><th>Stays open</th><th>Wages/day</th><th></th></tr></thead>
<tbody>
  <tr><td class="l hs-rn"><b>Lawyer</b><small>Park Avenue 88 <span class="hs-tag">new</span></small></td>
    <td class="num">22</td><td class="dim">–</td><td class="num">22<small class="ln">84% · $62/h</small></td><td class="dim">–</td><td class="num">+{money(BILL_LAW)}</td>
    <td class="act"><a class="hs-btn" href="ChangePicks.dc.html">Change picks{svg("chev")}</a></td></tr>
  <tr class="has-sub"><td class="l hs-rn"><b>Security Guard</b><small>4 shops</small></td>
    <td class="num">22</td><td class="num">2</td><td class="num">20<small class="ln">81% · $28/h</small></td><td class="dim">–</td><td class="num">+{money(BILL_SEC)}</td>
    <td class="act"><a class="hs-btn" href="ChangePicks.dc.html">Change picks{svg("chev")}</a></td></tr>
  <tr class="hs-subrow" data-re-row><td class="l" colspan="7"><div class="hs-re"><span class="hs-i">{svg("move")}</span>
    <span><b>Reassign 2</b> · 7th Avenue 3 (no hours) → Wall Street 9</span>
    <label><input type="checkbox" class="hs-cb" data-reassign checked>Reassign</label></div></td></tr>
  <tr><td class="l hs-rn"><b>Gym Trainer</b><small>Canal Street 5</small></td>
    <td class="num">1</td><td class="dim">–</td><td class="warn">0</td><td class="warn">1</td><td class="dim">–</td>
    <td class="act l txt warn">No candidates</td></tr>
</tbody>
<tfoot><tr><td class="l">Total</td><td>45</td><td>2</td><td>42</td><td>1</td><td>+{money(BILL)}</td><td></td></tr></tfoot></table>"""


def left(state: str = "on") -> str:
    exp = f'<b class="warn">{EXPIRING}</b> expire within 24 h' + (" (as of the save)" if state == "off" else "")
    return f"""
<div>
  <div class="hs-shead"><h2>Open places</h2></div>
  {filter_bar({"Part-time"}, count="<b>1,198</b> match")}
  <p class="hs-note hs-shops">Part-time is left out for shop roles only.</p>
  {roles_table()}
  <p class="hs-facts2"><b>{CANDS:,}</b> candidates · {exp}</p>
</div>"""


def quick_card(step: str = "empty", phone_: bool = False) -> str:
    """Quick hire: any role, any site, how many, skill, demands; the best matches, one button."""
    f = step != "empty"
    role = "HR Manager" if f else "Choose a role"
    site = "Halden HQ, Madison Avenue 200" if f else "Choose a site"
    ex = {"Gold Health Insurance"} if f else set()
    match = ""
    if f:
        rows = "".join(f'<li><span>{esc(c["name"])}</span><span class="m">{c["skill"]}%</span><span class="m">${c["wage"]}/h</span></li>' for c in HRM[:5])
        match = (f'<details class="hs-match"{" open" if step == "open" else ""}><summary><b>{len(HRM)}</b> match · the best 5 are picked{svg("chev")}</summary>'
                 f'<ul>{rows}</ul></details>')
    else:
        match = '<p class="hs-match none">Pick a role and a site to see who matches.</p>'
    btn = (f'<a class="hs-cta wide" href="QuickHire.dc.html"><span>Hire 5</span>{svg("right")}</a>' if f
           else '<a class="hs-cta wide" aria-disabled="true" href="#"><span>Hire</span></a>')
    return f"""
<section class="hs-quick{" ph" if phone_ else ""}" aria-label="Quick hire">
  <div class="qh"><span class="hs-i">{svg("hire")}</span><h3>Quick hire</h3><span class="sub">any site</span></div>
  <div class="qf">
    <div class="fld wide"><span>Role</span><button type="button" class="hs-sel{" empty" if not f else ""}"><b>{role}</b>{svg("chev")}</button></div>
    <div class="fld wide"><span>At</span><button type="button" class="hs-sel{" empty" if not f else ""}"><b>{site}</b>{svg("chev")}</button></div>
    <div class="fld"><span>How many</span><span class="hs-num"><button type="button" aria-label="Fewer">−</button><b>{5 if f else 1}</b><button type="button" aria-label="More">+</button></span></div>
    <div class="fld"><span>Skill at least</span><button type="button" class="hs-sel"><b{' class="set"' if f else ""}>{"100%" if f else "any"}</b>{svg("chev")}</button></div>
    <div class="fld wide"><span>Leave out who asks for</span>{dem_pop(ex, cls=" full").replace("Leave out who asks for: ", "")}</div>
  </div>
  {match}
  {btn}
</section>"""


def overview(state: str = "on") -> str:
    return f"""{page_head(state)}
<div class="hs-split">{left(state)}<div class="hs-right">{order_panel(state)}{quick_card()}</div></div>
{payroll()}"""


# --------------------------------------------------------------------------
# not linked, mod too old
# --------------------------------------------------------------------------
def gate_box(state: str) -> str:
    if state == "off":
        return """<div class="hs-gate"><b>Link the game to hire</b><ol>
<li>Subscribe to Big Copilot Link (Steam Workshop)</li><li>Load this company in the game</li><li>Link from the start screen</li></ol></div>"""
    return """<div class="hs-gate warn"><b>Update Big Copilot Link to 0.3.0</b><span>You have 0.2.0. Restart the game, then link again.</span></div>"""


def gates() -> str:
    def clip(state: str, label: str, sub: str) -> str:
        return (f'<div class="hs-state"><b>{label}</b><span>{sub}</span></div>'
                f'<div class="hs-clip" style="height: 820px;"><div class="wrap">{page_head(state)}<div class="hs-split">{left(state)}<div class="hs-right">{order_panel(state)}</div></div></div></div>')
    return (f'<div style="padding:36px 40px 0">'
            + clip("off", "D1 · GAME NOT LINKED", "Picks still work from the save; only the button is off.")
            + '<div style="height:56px"></div>'
            + clip("old", "D2 · MOD TOO OLD", "Linked, but the mod predates hiring.")
            + "</div>")


# --------------------------------------------------------------------------
# change picks: one role's candidates in a sheet
# --------------------------------------------------------------------------
def cand_row(r: dict, on: bool) -> str:
    dem = []
    for d in r["dem"]:
        if r.get("miss", "").startswith(d):
            dem.append(f'<span class="warn">{esc(r["miss"])}</span>')
        else:
            dem.append(esc(d))
    to = SITES[r["site"]][1] if r["site"] else '<span class="dim">–</span>'
    left_ = r["left"]
    exp = f"{left_} h" if left_ < 24 else ("1 day" if left_ < 48 else f"{left_ // 24} days")
    none = '<span class="dim">–</span>'
    return (f'<tr class="{"on" if on else ""}" data-cand><td class="l"><input type="checkbox" class="hs-cb" data-pick{" checked" if on else ""} aria-label="Pick {esc(r["name"])}"></td>'
            f'<td class="nm"><b>{esc(r["name"])}</b></td><td class="l"><span class="hs-sk" style="--w:{r["skill"]}%"><i></i></span>{r["skill"]}%</td>'
            f'<td>${r["wage"]}</td><td class="to">{to}</td><td class="dem">{", ".join(dem) or none}</td>'
            f'<td class="exp{" warn" if left_ < 24 else ""}">{exp}</td></tr>')


def sheet() -> str:
    picked = GUARDS[:10]
    nxt = GUARDS[20:25]
    head = ('<thead><tr><th class="l" style="width:34px"><span class="gw-sr">Pick</span></th><th class="l">Candidate</th><th class="l">Skill</th>'
            '<th>Wage/h</th><th class="l">Goes to</th><th class="l">Asks for</th><th>Expires in</th></tr></thead>')
    body = "".join(cand_row(r, True) for r in picked)
    more = "".join(cand_row(r, False) for r in nxt)
    return f"""
<div class="hs-scrim"></div>
<aside class="hs-sheet" role="dialog" aria-label="Change picks: Security Guard">
  <div class="hs-sh"><div><h2>Security Guard</h2><p>20 new hires · {sec_where()}</p></div>
    <button type="button" class="gw-x" aria-label="Close">{svg("close")}</button></div>
  <div class="hs-sb">
    {filter_bar({"Part-time"}, open_=True, count="<b>389</b> match · <b>42</b> left out", skill="60%")}
    <div class="hs-scope"><span>Filters for</span>
      <label class="hs-radio"><input type="radio" name="scope" checked>all shop roles</label><label class="hs-radio"><input type="radio" name="scope">Security Guard only</label></div>
    <div class="hs-grp"><b>Picked</b><span data-picked-n>20 of 20</span><span class="hs-legend"><i></i>site lacks it</span></div>
    <table class="hs-t hs-c">{head}<tbody>{body}
      <tr><td></td><td class="l txt" colspan="6"><a class="link" href="#">10 more picked</a></td></tr></tbody></table>
    <div class="hs-grp"><b>Next best</b><span>369 more</span></div>
    <table class="hs-t hs-c">{head}<tbody>{more}</tbody></table>
    <div class="hs-more"><a class="link" href="#">Show all</a><a class="link" href="#">Show the 42 left out</a></div>
  </div>
  <div class="hs-sf">
    <div class="tot"><div><span>Picked</span><b data-picked-n2>20 of 20</b></div><div><span>Added wages</span><b>+{money(BILL_SEC)}/day</b></div></div>
    <div class="end"><a class="link" href="#">Reset to automatic</a><a class="hs-cta" href="Main.dc.html">Done</a></div>
  </div>
</aside>"""


def change_picks() -> str:
    return f'<div class="wrap" style="opacity:.9">{masthead()}{overview()}</div>{sheet()}'


# --------------------------------------------------------------------------
# quick hire: the card's states, its confirm and done
# --------------------------------------------------------------------------
def quick_confirm() -> str:
    rows = "".join(f'<li><span>{esc(c["name"])}</span><span class="m">{c["skill"]}%</span><span class="m">${c["wage"]}/h</span></li>' for c in HRM[:5])
    body = f"""{tiles(("Hire", "5"), ("Role", '<span class="hs-u" style="font-size:14px;color:var(--ink)">HR Manager</span>'), ("Wages", '$52–61<small class="hs-u">/h</small>'))}
<ul class="hs-qlist">{rows}</ul>
<div class="gw-call"><span class="hs-i">{svg("clock")}</span><span>No hours yet: set them in the game.</span></div>
{lock("No undo.")}"""
    return dialog("Hire 5 HR Managers", '<div class="gw-where"><span>Halden HQ · Madison Avenue 200</span></div>',
                  verdict("ok", "<b>The game can take all 5</b>", "checked 21:06"), body, gbtn("Back", "ghost") + gbtn("Hire 5", "go", "right"))


def quick_done() -> str:
    body = f"""<p class="gw-lead"><b>5 HR Managers</b> now work at Halden HQ, with no hours.</p>
{lock("No undo. To let someone go, use MyEmployees in the game.")}"""
    return dialog("Done", '<div class="gw-where"><span>Halden HQ · Madison Avenue 200</span></div>',
                  verdict("ok", "<b>5 hired</b>", "21:06"), body, gbtn("Hire more", "ghost") + gbtn("Close", "go"))


def quick() -> str:
    return (top("Quick hire", "Any role, any site: HQ, warehouse, office, factory or shop. The best matches are picked; one confirm hires them.")
            + stage([col("Q1", "Empty", quick_card(), 340), col("Q2", "Filled · 7 match", quick_card("filled"), 340),
                     col("Q3", "Filled · matches opened", quick_card("open"), 340),
                     col("Q4", "Confirm", quick_confirm()), col("Q5", "Done", quick_done())]))


# --------------------------------------------------------------------------
# review and confirm
# --------------------------------------------------------------------------
WEEKS = [(1, 1, 1, 1, 0, 0, 0), (0, 0, 0, 1, 1, 1, 1), (1, 1, 0, 0, 0, 1, 1), (0, 1, 1, 1, 1, 0, 0), (1, 0, 0, 0, 1, 1, 1)]


def wk(k: int) -> str:
    return '<span class="hs-wk">' + "".join(f'<i class="{"on" if d else ""}"></i>' for d in WEEKS[k % len(WEEKS)]) + "</span>"


def dsite(k: str, what: str, cost: str, open_: bool = False, people: str = "") -> str:
    biz, street, kind, plan = SITES[k]
    body = f'<div class="hs-dp">{people}</div>' if open_ else ""
    return f"""<div class="hs-dsite{" open" if open_ else ""}"><button type="button" class="hs-dh" aria-expanded="{"true" if open_ else "false"}">
<span><span class="nm">{street}</span><span class="pl">{biz} · {kind} · {plan}</span></span><span class="what">{what}</span><span class="cst">{cost}</span>{svg("chev")}</button>{body}</div>"""


def ww_people() -> str:
    hd = ('<div class="hs-pr hd"><span>Person</span><span>Role</span><span class="m">Skill</span><span class="m">$/h</span>'
          '<span class="hs-wkd"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></span><span class="m">h/wk</span></div>')
    new = [r for r in GUARDS[:20] if r["site"] == "ww"][:4]
    rows = "".join(f'<div class="hs-pr"><span class="who"><b>{esc(r["name"])}</b><small>new hire</small></span><span>Security Guard</span>'
                   f'<span class="m">{r["skill"]}%</span><span class="m">${r["wage"]}</span>{wk(i)}<span class="m">42</span></div>' for i, r in enumerate(new))
    rows += "".join(f'<div class="hs-pr"><span class="who"><b>{esc(p["name"])}</b><small class="re">reassigned from 7th Avenue 3</small></span><span>Security Guard</span>'
                    f'<span class="m">{p["skill"]}%</span><span class="m">${p["wage"]}</span>{wk(i + 3)}<span class="m">42</span></div>' for i, p in enumerate(MOVERS))
    return hd + rows


def sites_list(done: bool = False, gone: bool = False) -> str:
    n = "hired" if done else "new"
    return '<div class="hs-ds">' + "".join([
        dsite("law", f"22 {n}", "+$7,842"),
        dsite("ww", f"4 {n} · 2 reassigned in", "+$667", open_=not done, people=ww_people()),
        dsite("w5", f"6 {n}", "+$1,001"),
        dsite("wb", f'<span class="warn">3 of 5 {n}</span>' if gone else f"5 {n}", "+$834" if not gone else "+$500"),
        dsite("w2", f"5 {n}", "+$834"),
        dsite("w7", "2 reassigned out", "–"),
        dsite("gym", '<span class="warn">1 place stays open</span>', "–"),
    ]) + "</div>"


def tiles(a: tuple, b: tuple, c: tuple) -> str:
    return '<div class="gw-tiles">' + "".join(
        f'<div class="gw-tile"><span class="gw-lab">{lab}</span><div class="v">{v}</div></div>' for lab, v in (a, b, c)) + "</div>"


def review_ready() -> str:
    body = f"""{tiles(("Hire", f"{HIRE}"), ("Reassign", f"{REASSIGN}"), ("Added wages", f'+{money(BILL)}<small class="hs-u">/day</small>'))}
<p class="gw-lead">Who goes where. Open a site to see each person and the days they work.</p>
{sites_list()}
<div class="gw-call warn"><span class="hs-i">{svg("alert")}</span><span><b>Canal Street 5 keeps 1 Gym Trainer place open</b> (40 hours a week): your headhunters have found no Gym Trainers.</span></div>
<div class="gw-call"><span class="hs-i">{svg("info")}</span><span>2 people ask for something their site does not meet (marked orange in Change picks). They are hired anyway.</span></div>
{lock("Hiring cannot be undone. To let someone go later, fire them in the MyEmployees app in the game.")}"""
    foot = hint("Nothing happens until you click the green button.") + gbtn("Back", "ghost") + gbtn(f"Hire {HIRE} and reassign {REASSIGN}", "go", "right")
    return dialog(f"Hire {HIRE} and reassign {REASSIGN}", f'<div class="gw-where"><span>{HIRE_SITES} sites · everyone gets hours from their site\'s plan</span></div>',
                  verdict("ok", "<b>The game can take all of them</b>", "checked 21:04"), body, foot, "hs-wide")


def review_done() -> str:
    body = f"""{tiles(("Hired", f"{HIRE}"), ("Reassigned", f"{REASSIGN}"), ("Added wages", f'+{money(BILL)}<small class="hs-u">/day</small>'))}
<p class="gw-lead">Everyone starts on their hours from the next hour in the game.</p>
<div class="gw-call warn"><span class="hs-i">{svg("alert")}</span><span><b>Canal Street 5 still needs a Gym Trainer.</b> It stays on the Staff page until your headhunters find one.</span></div>
{lock("No undo. To let someone go, fire them in MyEmployees in the game.")}"""
    return dialog("Done", f'<div class="gw-where"><span>{HIRE_SITES} sites</span></div>', verdict("ok", f"<b>{HIRE} hired, {REASSIGN} reassigned</b>", "21:05"),
                  body, gbtn("Close", "go"))


def review_partial() -> str:
    gone = GUARDS[5:7]
    body = f"""<p class="gw-said warn">2 applications expired before the game reached them.</p>
<div class="gw-chips">{"".join(f'<span class="gw-chip warn"><span class="hs-struck">{esc(r["name"])}</span> · {r["skill"]}%</span>' for r in gone)}</div>
<div class="gw-call"><span class="hs-i">{svg("info")}</span><span>Everyone else is hired and on their hours. <b>Bleecker Street 40 still has 2 Security Guard places open.</b></span></div>
<div class="gw-call"><span class="hs-i">{svg("person")}</span><span>Next best who pass your filters: <b>{esc(GUARDS[20]["name"])}</b> {GUARDS[20]["skill"]}% and <b>{esc(GUARDS[21]["name"])}</b> {GUARDS[21]["skill"]}%.</span></div>
{lock("No undo for the 40 hired.")}"""
    return dialog(f"{HIRE - 2} of {HIRE} hired", f'<div class="gw-where"><span>{HIRE_SITES} sites</span></div>',
                  verdict("moved", f"<b>{HIRE - 2} hired, {REASSIGN} reassigned</b>", "2 expired"), body,
                  hint("Opens the review for those 2 places only.") + gbtn("Close", "ghost") + gbtn("Pick 2 more", "go", "right"))


def review_refused() -> str:
    body = f"""<div class="gw-no"><span class="ic">{svg("phone")}</span><span class="rule">MyEmployees is open in the game</span>
<span class="fix">{svg("right")}Close the MyEmployees app on your in-game phone, then try again.</span></div>
<p class="gw-lead">Nobody was hired or reassigned. Your picks are kept.</p>"""
    return dialog(f"Hire {HIRE} and reassign {REASSIGN}", f'<div class="gw-where"><span>{HIRE_SITES} sites</span></div>',
                  verdict("no", "<b>The game said no</b>", "app open"), body,
                  hint("The game cannot hire while that app is open.") + gbtn("Close", "ghost") + gbtn("Try again", "go", "refresh"))


def review() -> str:
    return (top("Review and confirm", "“Review and hire 42” opens this. The game is asked first; one confirm then hires, reassigns and sets everyone's hours. "
                "The button says exactly what it does, and the footer says plainly that hiring cannot be undone.")
            + stage([col("C1", "Ready · one site opened", review_ready(), 640), col("C2", "Done", review_done()),
                     col("C3", "Partial · 2 applications expired meanwhile", review_partial()), col("C4", "Refused · MyEmployees open", review_refused())]))


# --------------------------------------------------------------------------
# phone
# --------------------------------------------------------------------------
def phone_top() -> str:
    return f'<div class="pm"><span class="wordmark">{COMPANY}</span><span class="dot"></span><span class="sp">Company · Staff</span></div>'


def phone() -> str:
    return f"""
<div class="hs-phone">
  {phone_top()}
  <div class="pc">
    <h1>Staff</h1>
    <div class="hs-pcard"><ul class="hs-ol">
      <li><span>Reassign</span><b>{REASSIGN}</b><small>7th Avenue 3 → Wall Street 9</small></li>
      <li><span>Hire</span><b>{HIRE}</b><small>22 Lawyers · 20 Security Guards</small></li>
      <li class="short"><span>Stays open</span><b>{SHORT}</b><small>Gym Trainer: no candidates</small></li></ul>
      <div class="hs-sum" style="margin-top:14px"><span>Added wages</span><b>+{money(BILL)}/day</b></div></div>
    <div class="hs-plist">
      <a class="hs-prow" href="ChangePicks.dc.html"><span><b>Lawyer</b><small>Park Avenue 88</small></span><span class="v">22</span>{svg("chev")}</a>
      <a class="hs-prow" href="ChangePicks.dc.html"><span><b>Security Guard</b><small>4 shops · 2 reassigned</small></span><span class="v">20</span>{svg("chev")}</a>
      <div class="hs-prow"><span><b>Gym Trainer</b><small>Canal Street 5 · no candidates</small></span><span class="v warn">0/1</span><span></span></div>
    </div>
    <a class="hs-btn" href="PhoneQuick.dc.html" style="height:44px;justify-content:center">{svg("hire")}Quick hire for any site</a>
    <div class="hs-plist"><a class="hs-prow" href="#"><span><b>Payroll</b><small>Current staff</small></span><span class="v">639</span>{svg("chev")}</a></div>
  </div>
  <div class="hs-pbar">{cta(wide=True)}<span class="hs-note">{CTA_NOTE}</span></div>
</div>"""


def phone_quick() -> str:
    return f"""
<div class="hs-phone">
  {phone_top()}
  <div class="pc">
    <a class="hs-btn quiet" href="Phone.dc.html" style="align-self:flex-start;padding-left:0">{svg("back")}Staff</a>
    {quick_card("open", phone_=True).replace('href="QuickHire.dc.html"', 'href="#"')}
  </div>
</div>"""


# --------------------------------------------------------------------------
# wiring: popovers, ticks, the review's sites
# --------------------------------------------------------------------------
WIRE = r"""
    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    document.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a && (a.getAttribute('href') || '#').charAt(0) === '#') e.preventDefault(); });
    // the demand list opens under its control
    $$('[data-pop]').forEach(b => b.addEventListener('click', () => {
      const p = b.parentElement.querySelector('[data-popover]'); const on = !p.classList.contains('open');
      p.classList.toggle('open', on); b.setAttribute('aria-expanded', on ? 'true' : 'false');
    }));
    $$('[data-popover]').forEach(p => $$('[data-dem]', p).forEach(cb => cb.addEventListener('change', () => {
      const n = $$('[data-dem]', p).filter(x => x.checked).length; const out = $('[data-dem-n]', p.parentElement);
      out.textContent = n ? n + ' selected' : 'nobody'; out.classList.toggle('set', n > 0);
    })));
    // a reassign unticked: that row fades, and its place is hired instead
    $$('[data-reassign]').forEach(cb => cb.addEventListener('change', () => {
      const row = cb.closest('tr'); if (row) row.classList.toggle('off', !cb.checked);
    }));
    // change picks: ticking and unticking
    $$('[data-pick]').forEach(cb => cb.addEventListener('change', () => {
      cb.closest('tr').classList.toggle('on', cb.checked);
      const n = 10 + $$('[data-pick]').filter(x => x.checked).length;
      const txt = n + ' of 20' + (n > 20 ? ' · ' + (n - 20) + ' over the plan' : n < 20 ? ' · ' + (20 - n) + ' open' : '');
      $$('[data-picked-n],[data-picked-n2]').forEach(e => { e.textContent = txt; });
    }));
    // a site in the review opens for its people
    $$('.hs-dh').forEach(b => b.addEventListener('click', () => {
      const s = b.closest('.hs-dsite'); if (!$('.hs-dp', s)) return;
      const on = !s.classList.contains('open'); s.classList.toggle('open', on); b.setAttribute('aria-expanded', on ? 'true' : 'false');
    }));
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
<body><div class="board __KIND__ __THEME__" style="width: __W__px; height: __H__px;">
__BODY__
</div>
<script>window.addEventListener('load', function () {__WIRE__});</script></body></html>
"""


def page(builder):
    return lambda: f'<div class="wrap">{masthead()}{builder()}</div>'


def cols_w(widths: list[int]) -> int:
    return 64 * 2 + sum(widths) + (len(widths) - 1) * 56


W = 1440
# file, title, builder, kind, width, height
BOARDS = [
    ("Main.dc.html", "A · Overview", page(overview), "hs-page", W, 1720),
    ("ChangePicks.dc.html", "B · Change picks for one role", change_picks, "hs-page", W, 1500),
    ("QuickHire.dc.html", "Q · Quick hire", quick, "gw-board", cols_w([340, 340, 340, 480, 480]), 760),
    ("Review.dc.html", "C · Review and confirm", review, "gw-board", cols_w([640, 480, 480, 480]), 1440),
    ("Gates.dc.html", "D · Game not linked, mod too old", gates, "hs-page", W, 1860),
    ("Phone.dc.html", "E · Phone", phone, "hs-page", 390, 1000),
    ("PhoneQuick.dc.html", "E2 · Phone · quick hire", phone_quick, "hs-page", 390, 700),
]

TIPS = {
    "Main.dc.html": "Left: one row a role. Right: what the button does, the button, and Quick hire for any site. Click a “Leave out who asks for” control to open the demand list.",
    "ChangePicks.dc.html": "“Change picks” opens one role over the page. Tick or untick someone: the count updates. Part-time is left out by default for shop roles.",
    "QuickHire.dc.html": "Quick hire: role, site, how many, skill, demands to leave out. The best matches are picked; one confirm hires them. Replaces the HQ and warehouse table.",
    "Review.dc.html": "Click a site row to open or close its people.",
    "Gates.dc.html": "Picks still work from the save; only the button is disabled, with the fix beside it.",
    "Phone.dc.html": "Summary card, roles as rows, Quick hire as a button, the main button in a bar at the bottom.",
    "PhoneQuick.dc.html": "Quick hire at phone width: the same card as a page.",
}


def css(theme: str) -> str:
    base = BOARD_CSS.replace("@import url('" + FONTS + "');", "")
    base = base.replace("body{margin:0;background:#0d100f}", "body{margin:0;background:" + ("#eef0ea" if theme == "light" else "#0d100f") + "}")
    return base + GW_CSS + HS_CSS


def build(preview: bool = False) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    boards, order, notes = {}, [], {}
    gap = 160
    pos = {"Main.dc.html": (0, 0), "Phone.dc.html": (W + gap, 0), "PhoneQuick.dc.html": (W + gap + 390 + gap, 0),
           "ChangePicks.dc.html": (0, 1900 + 400), "Gates.dc.html": (W + gap, 1900 + 400),
           "QuickHire.dc.html": (0, 1900 + 400 + 1900 + 400), "Review.dc.html": (0, 1900 + 400 + 1900 + 400 + 760 + 400)}
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
                    .replace("__KIND__", kind).replace("__THEME__", theme).replace("__W__", str(w)).replace("__H__", str(h))
                    .replace("__BODY__", body).replace("__WIRE__", WIRE),
                    encoding="utf-8", newline="\n")
        bx, by = pos[name_]
        boards[name_] = {"x": bx, "y": by, "w": w, "h": h, "title": title, "is_interactive": True}
        order.append(name_)
        notes["try-" + name_.split(".")[0].lower()] = {"x": bx, "y": by - 250, "w": 560 if w > 390 else 390, "maxH": 190, "text": TIPS[name_]}
    index = {"v": 3, "createdOnFiles": {"v": 1, "at": CREATED_AT}, "title": "Big Copilot Staff v2", "launch": {"view": "canvas"},
             "pages": [], "boards": boards, "order": order, "notes": notes, "designSystems": []}
    (ROOT / "canvas.json").write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8", newline="\n")
    print("wrote", len(order), "artboards")


if __name__ == "__main__":
    build("--preview" in sys.argv)
