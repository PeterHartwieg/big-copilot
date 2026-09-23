"""Generates the write-dialogs canvas: project/*.dc.html and project/canvas.json.

The dialogs through which the board changes the running game over the Big Copilot Link
mod: uniforms, imports, the schedule, the approve-in-game permission, and the states every
write shares. What they do is docs/mod-write-back-scope.md (sections 2 to 5 and 9) and
docs/game-link-api.md ("Writes"); the code they replace is the gw* block of the board script
in ba_dashboard.py. Design decisions and the porting note are NOTES.md beside this file.

The board's own stylesheet is borrowed from mockup/revamp/build_canvas.py so the two never
drift; every class added here carries the gw- prefix the port needs anyway.

The canvas is published at https://claude.ai/artifact/XjoW7vDDP15Kzm8bBCFUkD.
Never hand-edit project/: change this and rerun. `--preview` also writes plain HTML copies
into _preview/ (both themes) for screenshots in a browser.
"""
from __future__ import annotations

import html
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE / "project"
sys.path.insert(0, str(HERE.parent / "revamp"))
from build_canvas import CSS as BOARD_CSS  # noqa: E402

CREATED_AT = "2026-09-23T15:00:00Z"
FONTS = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"

# --------------------------------------------------------------------------
# the dialogs' own stylesheet, all under gw-
# --------------------------------------------------------------------------
GW_CSS = r"""
.board.gw-board{min-width:0;min-height:0;padding:0;overflow:hidden;--gw-on:#08130d;--gw-scrim:#080a09;background:var(--gw-scrim)}
.board.gw-board.light{--gw-on:#ffffff;--gw-scrim:#dde0d7}
.gw-off{display:none!important}
.board svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none}

/* the artboard: a row of dialogs, each under the state it shows -------------- */
.gw-top{padding:44px 64px 0}
.gw-top h1{margin:0;font-size:24px;font-weight:600;letter-spacing:-.02em}
.gw-top p{margin:6px 0 0;max-width:760px;font-size:13.5px;line-height:1.5;color:var(--ink-2)}
.gw-stage{display:flex;gap:56px;align-items:flex-start;padding:36px 64px 64px}
.gw-stage.gw-wrap{flex-wrap:wrap;row-gap:48px}
.gw-col{display:flex;flex-direction:column;gap:14px;width:480px;flex:none}
.gw-state{display:flex;align-items:baseline;gap:10px;min-height:18px}
.gw-state b{font:600 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.14em;color:var(--accent)}
.gw-state span{font-size:12.5px;color:var(--ink-2)}

/* the dialog ----------------------------------------------------------------- */
.gw-dlg{position:relative;width:480px;max-width:100%;border-radius:16px;background:var(--surface);border:1px solid var(--rule);box-shadow:0 34px 80px -28px #000c;display:flex;flex-direction:column}
.light .gw-dlg{box-shadow:0 30px 70px -30px #1a1f1c66}
.gw-head{display:grid;grid-template-columns:40px minmax(0,1fr) 32px;gap:14px;align-items:center;padding:18px 16px 14px 20px}
.gw-kind{width:40px;height:40px;border-radius:12px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;transition:transform .35s cubic-bezier(.34,1.56,.64,1)}
.gw-kind svg{width:21px;height:21px}
.gw-dlg:hover .gw-kind{transform:rotate(-8deg) scale(1.06)}
.gw-head h2{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;line-height:1.25}
.gw-where{display:flex;align-items:center;gap:7px;margin-top:4px;font-size:12.5px;color:var(--ink-2);min-width:0;white-space:nowrap}
.gw-where>span{overflow:hidden;text-overflow:ellipsis}
.gw-where .hood{height:18px;min-width:22px;font-size:9.5px}
.gw-x{width:32px;height:32px;border-radius:8px;border:0;background:none;color:var(--ink-3);display:grid;place-items:center;cursor:pointer;transition:color .15s,background .15s,transform .25s cubic-bezier(.34,1.56,.64,1)}
.gw-x:hover{color:var(--ink);background:var(--raised);transform:rotate(90deg)}

/* the verdict: the board's dot, a wire, the game; what the game said ---------- */
.gw-verdict{display:flex;align-items:center;gap:12px;margin:0 20px;padding:10px 12px;min-height:42px;border-radius:10px;background:var(--ground);font-size:13px;color:var(--ink-2);transition:background .3s}
.gw-verdict b{color:var(--ink);font-weight:600}
.gw-verdict .gw-meta{margin-left:auto;font:500 11px/1.3 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap;text-align:right}
.gw-w{position:relative;flex:none;width:58px;height:16px;color:var(--info)}
.gw-w .a{position:absolute;left:0;top:3px;width:10px;height:10px;border-radius:50%;background:var(--accent)}
.gw-w .g{position:absolute;right:0;top:0;width:17px;height:17px;display:grid;place-items:center}
.gw-w .g svg{width:17px;height:17px}
.gw-w .ln{position:absolute;left:13px;right:21px;top:7.5px;height:1.5px;background:repeating-linear-gradient(90deg,currentColor 0 3px,transparent 3px 6px);opacity:.6}
.gw-w .p{position:absolute;left:12px;top:6px;width:4px;height:4px;border-radius:50%;background:currentColor;opacity:0}
.gw-w.ask .p{animation:gw-pk 1.2s linear infinite}
.gw-w.ask .p:nth-of-type(2){animation-delay:.4s}.gw-w.ask .p:nth-of-type(3){animation-delay:.8s}
@keyframes gw-pk{0%{transform:translateX(0);opacity:0}20%{opacity:1}80%{opacity:1}100%{transform:translateX(22px);opacity:0}}
.gw-w.ok{color:var(--accent)}.gw-w.ok .ln{background:currentColor;opacity:1}
.gw-w.ok .g{animation:gw-nod .6s cubic-bezier(.34,1.56,.64,1)}
@keyframes gw-nod{40%{transform:translateY(-3px) scale(1.12)}}
.gw-w.no{color:var(--neg)}.gw-w.no .ln{background:linear-gradient(90deg,currentColor 0 34%,transparent 34% 66%,currentColor 66%);opacity:1}
.gw-w.no .g{animation:gw-shake 2.6s ease-in-out infinite}
@keyframes gw-shake{0%,84%,100%{transform:none}88%{transform:translateX(-2px)}92%{transform:translateX(2px)}96%{transform:translateX(-1px)}}
.gw-w.wait{color:var(--warn)}.gw-w.wait .p:first-of-type{left:22px;opacity:1;animation:gw-blink 1.1s ease-in-out infinite}
.gw-w.wait .g{animation:gw-ring 1.6s ease-in-out infinite}
@keyframes gw-blink{50%{opacity:.2;transform:scale(.6)}}
@keyframes gw-ring{0%,70%,100%{transform:none}76%{transform:rotate(-10deg)}82%{transform:rotate(10deg)}88%{transform:rotate(-6deg)}}
.gw-w.busy{color:var(--ink-3)}.gw-w.busy .p:first-of-type{opacity:1;animation:gw-bounce .9s ease-in-out infinite alternate}
@keyframes gw-bounce{from{transform:translateX(0)}to{transform:translateX(20px)}}
.gw-w.moved{color:var(--warn)}.gw-w.moved .ln{background:currentColor;opacity:.8}
.gw-w.moved .g svg{animation:gw-tick 2s steps(8) infinite}
@keyframes gw-tick{to{transform:rotate(360deg)}}

/* body and foot ---------------------------------------------------------------- */
.gw-body{display:flex;flex-direction:column;gap:14px;padding:16px 20px 2px}
.gw-lead{margin:0;font-size:13.5px;line-height:1.5;color:var(--ink-2);text-wrap:pretty}
.gw-lead b{color:var(--ink);font-weight:600}
.gw-lab{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.gw-foot{display:flex;align-items:center;gap:8px;padding:18px 20px 18px}
.gw-hint{margin-right:auto;font-size:12px;line-height:1.4;color:var(--ink-3);max-width:230px;text-wrap:pretty}
.gw-hint.warn{color:var(--warn)}
.gw-b{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 16px;border-radius:10px;border:1px solid var(--rule);background:transparent;color:var(--ink);font:600 13.5px/1 Archivo,sans-serif;cursor:pointer;white-space:nowrap;transition:transform .2s cubic-bezier(.34,1.56,.64,1),border-color .15s,filter .15s}
.gw-b:hover{border-color:var(--ink-3);transform:translateY(-1px)}
.gw-b:active{transform:scale(.97)}
.gw-b:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.gw-b svg{width:16px;height:16px}
.gw-b.go{background:var(--accent);border-color:var(--accent);color:var(--gw-on)}
.gw-b.go:hover{filter:brightness(1.08)}
.gw-b.go .n{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:color-mix(in srgb,var(--gw-on) 16%,transparent);font:600 11.5px/1 "IBM Plex Mono",monospace}
.gw-b.go:hover svg.go{animation:gw-nudge .5s ease-in-out}
@keyframes gw-nudge{50%{transform:translateX(3px)}}
.gw-b[disabled]{opacity:.38;cursor:not-allowed;transform:none;filter:none}
.gw-b.undo:hover svg{animation:gw-back .55s cubic-bezier(.34,1.56,.64,1)}
@keyframes gw-back{40%{transform:rotate(-70deg)}}
.gw-b.ghost{border-color:transparent;color:var(--ink-2)}
.gw-b.ghost:hover{border-color:var(--rule);color:var(--ink)}
.gw-b.busy{pointer-events:none}
.gw-spin{width:15px;height:15px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:gw-rot .8s linear infinite;flex:none}
@keyframes gw-rot{to{transform:rotate(360deg)}}

/* the board reads the game again after an apply ----------------------------------- */
.gw-reread{display:flex;align-items:center;gap:10px;font:500 11.5px/1.3 "IBM Plex Mono",monospace;color:var(--ink-3)}
.gw-reread .gw-prog{flex:1;max-width:120px}
.gw-reread.done{color:var(--accent)}
.gw-prog{position:relative;height:3px;border-radius:2px;background:var(--rule);overflow:hidden}
.gw-prog i{position:absolute;top:0;bottom:0;width:40%;border-radius:2px;background:var(--info);animation:slide 1.2s ease-in-out infinite}
.gw-prog.warn i{background:var(--warn)}

/* uniforms: one card a role ---------------------------------------------------- */
.gw-roles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.gw-role{display:flex;align-items:center;gap:12px;min-height:62px;padding:10px 12px;border-radius:12px;background:var(--ground);border:1px solid var(--rule-soft);cursor:default;transition:border-color .15s,transform .25s cubic-bezier(.34,1.56,.64,1)}
.gw-role:hover{border-color:var(--rule);transform:translateY(-2px)}
.gw-role b{display:block;font-size:13.5px;font-weight:600;line-height:1.2}
.gw-role small{display:flex;align-items:center;gap:5px;margin-top:5px;font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap}
.gw-role small svg{width:11px;height:11px}
.gw-role small em{font-style:normal;color:var(--accent)}
.gw-role small>span{display:inline-flex;align-items:center;gap:5px}
.gw-role small .gw-now,.is-done .gw-role small .gw-was{display:none}
.is-done .gw-role small .gw-now{display:inline-flex;color:var(--accent)}
.gw-shirt{position:relative;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;flex:none;color:var(--ink-3);border:1.5px dashed var(--ink-3);transition:background .3s,color .3s,border-color .3s}
.gw-shirt svg{width:19px;height:19px}
.gw-role.to:hover .gw-shirt svg{animation:gw-don .55s cubic-bezier(.34,1.56,.64,1)}
@keyframes gw-don{0%{transform:translateY(-7px) scale(.7);opacity:.3}60%{transform:translateY(1px) scale(1.08);opacity:1}}
.gw-role.to:hover .gw-shirt{border-color:var(--accent);color:var(--accent)}
.gw-role.kept{background:transparent;border-style:dashed}
.gw-role.kept .gw-shirt{border:0;background:var(--raised);color:var(--ink-2)}
.gw-role.kept b{color:var(--ink-2);font-weight:500}
.gw-badge{position:absolute;right:-4px;bottom:-4px;width:17px;height:17px;border-radius:50%;display:grid;place-items:center;background:var(--surface);color:var(--ink-3);box-shadow:0 0 0 1px var(--rule)}
.gw-badge svg{width:10px;height:10px;stroke-width:2.2}
.gw-role .gw-tk{display:none}
.gw-role.done .gw-shirt,.is-done .gw-role.to .gw-shirt{border:0;background:var(--accent-soft);color:var(--accent)}
.gw-role.done .gw-tk,.is-done .gw-role.to .gw-tk{display:grid;background:var(--accent);color:var(--gw-on);box-shadow:none;animation:pop .4s cubic-bezier(.34,1.56,.64,1)}
.is-applying .gw-role.to .gw-shirt{border-style:solid;border-color:var(--info);color:var(--info);animation:gw-pulse 1s ease-in-out infinite}
@keyframes gw-pulse{50%{transform:scale(.92)}}
.gw-pick{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.gw-presets{display:inline-flex;gap:6px;flex-wrap:wrap}
.gw-preset{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 13px 0 6px;border-radius:18px;border:1px solid var(--rule);background:transparent;color:var(--ink-2);font:500 13px/1 Archivo,sans-serif;cursor:pointer;transition:border-color .15s,color .15s,background .15s,transform .25s cubic-bezier(.34,1.56,.64,1)}
.gw-preset:hover{color:var(--ink);transform:translateY(-1px)}
.gw-preset .ic{width:24px;height:24px;border-radius:50%;background:var(--raised);display:grid;place-items:center;transition:background .2s,color .2s}
.gw-preset .ic svg{width:14px;height:14px}
.gw-preset:hover .ic svg{animation:sp-wiggle .5s ease-in-out}
.gw-preset[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-soft);color:var(--ink)}
.gw-preset[aria-pressed="true"] .ic{background:var(--accent);color:var(--gw-on)}
.gw-preset.only{cursor:default}
.gw-only{font-size:12px;color:var(--ink-3)}
@keyframes sp-wiggle{25%{transform:rotate(-12deg)}75%{transform:rotate(12deg)}}

/* uniforms at many shops ---------------------------------------------------------- */
.gw-tally{display:flex;align-items:flex-end;gap:26px}
.gw-tally div{display:flex;flex-direction:column;gap:6px}
.gw-big{font:500 30px/1 "IBM Plex Mono",monospace;letter-spacing:-.03em;display:flex;align-items:center;gap:8px}
.gw-big svg{width:20px;height:20px;color:var(--accent)}
.gw-big.dim{color:var(--ink-2)}.gw-big.dim svg{color:var(--ink-3)}
.gw-shops{display:flex;flex-direction:column;border-top:1px solid var(--rule-soft)}
.gw-shop{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:6px 12px;min-height:46px;padding:7px 2px;border-bottom:1px solid var(--rule-soft);cursor:default;transition:background .15s,opacity .3s}
.gw-shop:hover{background:var(--ground)}
.gw-shop .nm{display:flex;align-items:center;gap:8px;min-width:0;font-size:13.5px;font-weight:500}
.gw-shop .nm span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gw-shop .nm .hood{height:18px;min-width:22px;font-size:9.5px}
.gw-minis{display:flex;gap:2px;align-items:center}
.gw-minis i{width:18px;height:18px;display:grid;place-items:center;color:var(--accent)}
.gw-minis i svg{width:15px;height:15px}
.gw-minis i.k{color:var(--ink-3);opacity:.6}
.gw-minis i.k svg{fill:currentColor;stroke:none}
.gw-shop:hover .gw-minis i{animation:sp-hop .45s ease-in-out;animation-delay:calc(var(--k)*40ms)}
@keyframes sp-hop{40%{transform:translateY(-4px)}}
.gw-shop .c{font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3);min-width:24px;text-align:right}
.gw-shop.bad .nm{color:var(--neg)}
.gw-shop.bad .nm .hood{border-color:color-mix(in srgb,var(--neg) 50%,transparent);color:var(--neg)}
.gw-shop .gw-why{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;padding:0 0 4px 30px;font-size:12.5px;line-height:1.45;color:var(--ink-2)}
.gw-shop .gw-why b{color:var(--ink);font-weight:600}
.gw-shop.out{opacity:.45}
.gw-shop.out .nm span:last-child{text-decoration:line-through}
.gw-mini-b{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);font:500 12px/1 Archivo,sans-serif;cursor:pointer;transition:border-color .15s,transform .2s}
.gw-mini-b:hover{border-color:var(--ink-3);transform:translateY(-1px)}
.gw-mini-b svg{width:13px;height:13px}
.gw-read{min-height:18px;font:500 12px/1.5 "IBM Plex Mono",monospace;color:var(--ink-3)}
.gw-read b{color:var(--ink);font-weight:500}
.gw-read em{font-style:normal;color:var(--accent)}

/* imports: a card a material, grouped by depot --------------------------------------- */
.gw-legend{display:flex;gap:8px 18px;flex-wrap:wrap;font-size:12.5px;color:var(--ink-2)}
.gw-legend span{display:inline-flex;align-items:center;gap:7px}
.gw-legend svg{width:15px;height:15px}
.gw-legend .sm svg{color:var(--info)}
.gw-depot{display:flex;align-items:center;gap:8px;margin:4px 0 -4px;font:500 11px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;color:var(--ink-3)}
.gw-depot .hood{height:18px;min-width:22px;font-size:9.5px}
.gw-line{display:flex;flex-direction:column;gap:10px;padding:12px 14px 13px;border-radius:12px;background:var(--ground);border:1px solid var(--rule-soft);transition:border-color .15s}
.gw-line:hover{border-color:var(--rule)}
.gw-lt{display:flex;align-items:center;gap:10px;min-width:0}
.gw-mat{width:30px;height:30px;border-radius:9px;background:var(--raised);display:grid;place-items:center;color:var(--ink-2);flex:none;transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
.gw-mat svg{width:16px;height:16px}
.gw-line:hover .gw-mat{transform:rotate(-8deg)}
.gw-lt>b{font-size:14px;font-weight:600;white-space:nowrap}
.gw-mode{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:7px;background:var(--raised);color:var(--ink-2);flex:none}
.gw-mode svg{width:14px;height:14px}
.gw-mode.smart{color:var(--info);background:color-mix(in srgb,var(--info) 15%,transparent)}
.gw-num{margin-left:auto;display:flex;align-items:baseline;gap:7px;font:500 15px/1 "IBM Plex Mono",monospace;white-space:nowrap}
.gw-num s{font-size:12.5px;color:var(--ink-3);text-decoration-thickness:1px}
.gw-num svg{width:12px;height:12px;color:var(--ink-3);align-self:center}
.gw-num small{font-size:11px;color:var(--ink-3)}
.gw-lvl{position:relative;height:10px;border-radius:5px;background:var(--rule-soft);margin:2px 0 14px}
.gw-lvl i{position:absolute;top:0;bottom:0;display:block}
.gw-lvl .base{left:0;border-radius:5px 0 0 5px;background:color-mix(in srgb,var(--ink) 30%,transparent)}
.gw-lvl .add{background:var(--accent);border-radius:0 5px 5px 0;transform-origin:left;animation:gw-grow .9s cubic-bezier(.2,.7,.2,1) both .2s}
.gw-lvl .cut{background:repeating-linear-gradient(135deg,var(--ink-3) 0 3px,transparent 3px 6px);opacity:.7}
.gw-lvl .short{background:repeating-linear-gradient(135deg,var(--neg) 0 3px,transparent 3px 6px);box-shadow:inset 0 0 0 1px var(--neg);border-radius:0 5px 5px 0}
.gw-lvl .base.stopped{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--ink) 30%,transparent) 0 3px,transparent 3px 6px)}
.gw-lvl .base.full{border-radius:5px}
.gw-lvl u{position:absolute;top:-4px;bottom:-4px;width:0;border-left:1.5px solid var(--ink-2);text-decoration:none}
.gw-lvl u span{position:absolute;top:calc(100% + 3px);left:0;transform:translateX(-50%);font:500 10px/1 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap}
.gw-lvl u.cap{border-left-color:var(--neg)}
.gw-lvl u.cap span{color:var(--neg)}
.gw-line:hover .gw-lvl .add{animation:gw-grow .6s cubic-bezier(.2,.7,.2,1)}
@keyframes gw-grow{from{transform:scaleX(0)}}
.gw-imps{display:flex;flex-wrap:wrap;gap:6px}
.gw-imp{display:inline-flex;align-items:center;gap:7px;height:26px;padding:0 10px 0 4px;border-radius:13px;border:1px solid var(--rule-soft);background:var(--surface);font-size:12px;color:var(--ink);cursor:default}
.gw-imp i{width:18px;height:18px;border-radius:50%;background:var(--raised);display:grid;place-items:center;font:600 10px/1 "IBM Plex Mono",monospace;font-style:normal;color:var(--ink-2)}
.gw-imp small{font:500 10.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.gw-imp.stopped{border-style:dashed;border-color:var(--warn)}
.gw-imp.stopped i{background:none;color:var(--warn)}
.gw-imp.stopped i svg{width:11px;height:11px;stroke-width:2.4}
.gw-call{display:grid;grid-template-columns:18px minmax(0,1fr);gap:8px;align-items:start;font-size:12.5px;line-height:1.45;color:var(--ink-2);text-wrap:pretty}
.gw-call>.sp-i{padding-top:1px}
.gw-call>.sp-i svg{width:15px;height:15px}
.gw-call b{color:var(--ink);font-weight:600}
.gw-call.warn>.sp-i{color:var(--warn)}.gw-call.neg>.sp-i{color:var(--neg)}.gw-call.info>.sp-i{color:var(--info)}.gw-call.ok>.sp-i{color:var(--accent)}
.gw-call.neg b{color:var(--neg)}
.sp-i{display:inline-grid;place-items:center;flex:none}
.gw-cash{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 10px;align-items:center;margin-top:7px}
.gw-cash .tr{position:relative;height:6px;border-radius:3px;background:var(--rule-soft);overflow:hidden}
.gw-cash .tr i{position:absolute;left:0;top:0;bottom:0;width:var(--w);background:var(--warn);border-radius:3px}
.gw-cash span{font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap}
.gw-cash span b{font-weight:500}
.gw-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
.gw-chip{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 9px;border-radius:6px;background:var(--raised);font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-2);white-space:nowrap}
.gw-chip svg{width:12px;height:12px}
.gw-chip b{color:var(--ink);font-weight:500}
.gw-chip.neg{background:color-mix(in srgb,var(--neg) 13%,transparent);color:var(--neg)}
.gw-chip.ok{background:var(--accent-soft);color:var(--accent)}
.gw-chip.warn{background:color-mix(in srgb,var(--warn) 14%,transparent);color:var(--warn)}
.gw-line.dim{opacity:.5}
.gw-line.dim .gw-lvl{display:none}
.gw-line.ticked .gw-mat{background:var(--accent-soft);color:var(--accent)}

/* a refusal: the rule, the objects, the fix --------------------------------------------- */
.gw-no{display:grid;grid-template-columns:34px minmax(0,1fr);gap:4px 12px;padding:13px 14px 14px;border-radius:12px;background:color-mix(in srgb,var(--neg) 9%,var(--surface));border:1px solid color-mix(in srgb,var(--neg) 35%,transparent)}
.gw-no>.ic{grid-row:1/span 3;width:34px;height:34px;border-radius:50%;background:color-mix(in srgb,var(--neg) 18%,transparent);color:var(--neg);display:grid;place-items:center}
.gw-no>.ic svg{width:17px;height:17px}
.gw-no:hover>.ic svg{animation:sp-wiggle .5s ease-in-out}
.gw-no .rule{font-size:13.5px;font-weight:600;line-height:1.4;color:var(--ink);text-wrap:pretty}
.gw-no .fix{display:flex;gap:7px;align-items:flex-start;font-size:12.5px;line-height:1.45;color:var(--ink-2)}
.gw-no .fix svg{width:13px;height:13px;margin-top:2px;color:var(--ink-3)}
.gw-no .gw-chips{margin-top:2px}
.gw-lock{grid-column:2;margin-top:8px}
.gw-lock .cells{display:grid;grid-template-columns:repeat(18,minmax(0,1fr));gap:2px}
.gw-lock .cells i{height:14px;border-radius:2px;background:var(--rule-soft);position:relative}
.gw-lock .cells i.x{background:repeating-linear-gradient(135deg,var(--neg) 0 2px,transparent 2px 5px);opacity:.75}
.gw-lock .cells i.now{outline:2px solid var(--ink);outline-offset:1px;opacity:1;z-index:1;animation:gw-now 1.6s ease-in-out infinite}
@keyframes gw-now{50%{outline-color:transparent}}
.gw-lock .labs{display:grid;grid-template-columns:repeat(18,minmax(0,1fr));gap:2px;margin-top:6px;font:500 10px/1.2 "IBM Plex Mono",monospace;color:var(--ink-3)}
.gw-lock .labs span{white-space:nowrap}
.gw-lock .labs .n{color:var(--ink)}
.gw-lock .labs .r{color:var(--accent)}

/* the schedule: the week as bars ------------------------------------------------------ */
.gw-plan{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 8px;border-radius:6px;background:var(--raised);font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.gw-plan svg{width:12px;height:12px}
.gw-plan.full{background:color-mix(in srgb,var(--info) 15%,transparent);color:var(--info)}
.gw-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.gw-tile{padding:10px 12px 11px;border-radius:10px;background:var(--ground);border:1px solid var(--rule-soft);cursor:default}
.gw-tile .v{display:flex;align-items:baseline;gap:6px;margin-top:8px;font:500 17px/1 "IBM Plex Mono",monospace;letter-spacing:-.01em;white-space:nowrap}
.gw-tile .v s{font-size:12px;color:var(--ink-3);text-decoration-thickness:1px}
.gw-tile .v svg{width:11px;height:11px;color:var(--ink-3);align-self:center}
.gw-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;align-items:end}
.gw-wd{display:flex;flex-direction:column;align-items:center;gap:6px;cursor:default;padding:6px 0 4px;border-radius:8px;transition:background .15s}
.gw-wd:hover{background:var(--ground)}
.gw-wd .dl{font:500 10.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3);min-height:11px}
.gw-wd .dl.gw-up{color:var(--accent)}.gw-wd .dl.gw-dn{color:var(--warn)}
.gw-wd .bars{display:flex;gap:3px;align-items:flex-end;height:64px}
.gw-wd .bars i{display:block;width:10px;border-radius:3px 3px 1px 1px;height:var(--h)}
.gw-wd .bars i.n{background:color-mix(in srgb,var(--ink) 20%,transparent)}
.gw-wd .bars i.a{background:var(--accent);transform-origin:bottom;transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
.gw-wd:hover .bars i.a{transform:scaleY(1.08)}
.gw-wd.same .bars i.a{background:color-mix(in srgb,var(--accent) 45%,transparent)}
.gw-wd .d{font:600 10px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;color:var(--ink-3)}
.gw-key{display:flex;gap:14px;font:500 10.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.gw-key span{display:inline-flex;align-items:center;gap:6px}
.gw-key i{width:8px;height:8px;border-radius:2px;background:color-mix(in srgb,var(--ink) 20%,transparent)}
.gw-key i.a{background:var(--accent)}
.gw-box{display:flex;flex-direction:column;gap:9px;padding:12px 14px;border-radius:12px;background:var(--ground);border:1px solid var(--rule-soft)}
.gw-box.warn{border-color:color-mix(in srgb,var(--warn) 40%,transparent);background:color-mix(in srgb,var(--warn) 6%,var(--ground))}
.gw-box .gw-call{font-size:13px}
.gw-pills{display:flex;flex-wrap:wrap;gap:6px}
.gw-pills .person{font-size:12px;padding:4px 10px 4px 4px;background:var(--surface)}
.gw-pills .person .sp-i{color:var(--warn)}
.gw-pills .person .sp-i svg{width:12px;height:12px}
.gw-pills .person.hire{border:1px dashed var(--warn);background:none;color:var(--warn)}
.gw-pills .person.hire i{background:none;color:var(--warn);border:1px dashed var(--warn)}
.gw-pills .person.bench i{box-shadow:inset 0 0 0 1.5px var(--ink-2);background:none}
.gw-cover{display:flex;height:8px;gap:2px;border-radius:4px;overflow:hidden}
.gw-cover i{display:block;height:100%}
.gw-cover .c{background:var(--accent)}
.gw-cover .e{background:repeating-linear-gradient(135deg,var(--warn) 0 3px,transparent 3px 6px);box-shadow:inset 0 0 0 1px var(--warn)}
.gw-coverk{display:flex;justify-content:space-between;font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.gw-coverk b{color:var(--ink);font-weight:500}.gw-coverk .w{color:var(--warn)}
.gw-toggle{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px 14px;align-items:start;padding:12px 14px;border-radius:12px;background:var(--ground);border:1px solid var(--rule-soft)}
.gw-toggle b{display:block;font-size:13.5px;font-weight:600}
.gw-toggle small{display:block;margin-top:3px;font-size:12px;line-height:1.4;color:var(--ink-3)}
.gw-toggle .sw{border:0;padding:0;margin-top:2px}
.gw-hrs{grid-column:1/-1;display:grid;grid-template-columns:44px minmax(0,1fr);gap:5px 8px;align-items:center;font:500 10px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.gw-hrs .h{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:2px}
.gw-hrs .h i{height:8px;border-radius:2px;background:var(--rule-soft);transition:background .3s}
.gw-hrs .h i.o{background:var(--ink-2)}
.gw-hrs .h i.o.new{background:var(--accent)}
.gw-toggle.off .gw-hrs .h i.o.new{background:var(--rule-soft)}
.gw-steps{display:inline-flex;align-items:center;gap:5px}
.gw-steps i{width:9px;height:9px;border-radius:50%;background:var(--rule)}
.gw-steps i.d{background:var(--accent)}
.gw-steps i.s{background:none;box-shadow:inset 0 0 0 1.5px var(--ink-3)}
.gw-steps i.c{background:var(--ink);box-shadow:0 0 0 3px var(--accent-soft);animation:gw-cur 1.6s ease-in-out infinite}
@keyframes gw-cur{50%{box-shadow:0 0 0 5px var(--accent-soft)}}
.gw-run{display:flex;flex-direction:column;border-top:1px solid var(--rule-soft)}
.gw-run>div{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:10px;align-items:center;min-height:42px;border-bottom:1px solid var(--rule-soft);font-size:13.5px}
.gw-run .m{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:var(--gw-on)}
.gw-run .m svg{width:11px;height:11px;stroke-width:2.6}
.gw-run .m.s{background:none;box-shadow:inset 0 0 0 1.5px var(--ink-3);color:var(--ink-3)}
.gw-run small{font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.gw-run .skip{color:var(--ink-3)}

/* permission, asked in the game ------------------------------------------------------ */
.gw-scene{position:relative;height:156px;border-radius:12px;background:var(--ground);border:1px solid var(--rule-soft);overflow:hidden}
.gw-scene .gw-sbar{position:absolute;left:0;right:0;top:0;height:22px;border-bottom:1px solid var(--rule-soft);display:flex;align-items:center;gap:5px;padding:0 10px;font:500 9.5px/1 "IBM Plex Mono",monospace;letter-spacing:.08em;color:var(--ink-3)}
.gw-scene .gw-sbar i{width:6px;height:6px;border-radius:50%;background:var(--rule)}
.gw-scene .gw-sbar span{margin-left:6px}
.gw-scene .city{position:absolute;left:0;right:0;bottom:0;height:54px;display:flex;align-items:flex-end;gap:6px;padding:0 14px;opacity:.5}
.gw-scene .city i{display:block;flex:1;background:var(--raised);border-radius:2px 2px 0 0}
.gw-pop{position:absolute;left:50%;top:40px;width:250px;transform:translateX(-50%);padding:12px 14px;border-radius:10px;background:var(--surface);border:1px solid var(--rule);box-shadow:0 14px 34px -12px #000a;animation:gw-popin .6s cubic-bezier(.34,1.56,.64,1) both}
@keyframes gw-popin{from{transform:translateX(-50%) translateY(12px) scale(.9);opacity:0}}
.gw-pop b{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;line-height:1.3}
.gw-pop b i{width:8px;height:8px;border-radius:50%;background:var(--accent);flex:none}
.gw-pop .bt{display:flex;justify-content:flex-end;gap:6px;margin-top:10px}
.gw-pop .bt span{height:22px;padding:0 10px;border-radius:6px;display:grid;place-items:center;font:600 11px/1 Archivo,sans-serif;border:1px solid var(--rule);color:var(--ink-2)}
.gw-pop .bt span.y{background:var(--accent);border-color:var(--accent);color:var(--gw-on);animation:gw-halo 1.6s ease-out infinite}
@keyframes gw-halo{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--accent) 60%,transparent)}100%{box-shadow:0 0 0 9px transparent}}
.gw-cursor{position:absolute;left:62%;top:120px;width:18px!important;height:18px!important;color:var(--ink);fill:var(--surface)!important;stroke-width:1.5!important;animation:gw-aim 2.4s ease-in-out infinite}
@keyframes gw-aim{0%{transform:translate(40px,30px)}45%,70%{transform:translate(38px,-26px)}55%{transform:translate(38px,-26px) scale(.85)}100%{transform:translate(40px,30px)}}
.gw-ok{display:grid;grid-template-columns:44px minmax(0,1fr);gap:12px;align-items:center}
.gw-ok .ic{width:44px;height:44px;border-radius:50%;background:var(--accent);color:var(--gw-on);display:grid;place-items:center;animation:pop .5s cubic-bezier(.34,1.56,.64,1)}
.gw-ok .ic svg{width:22px;height:22px;stroke-width:2.4}
.gw-ok.no .ic{background:color-mix(in srgb,var(--neg) 16%,transparent);color:var(--neg)}
.gw-ok p{margin:0;font-size:13.5px;line-height:1.5;color:var(--ink-2)}
.gw-ok p b{color:var(--ink);font-weight:600}
/* the game's own popup, sketched: the mod draws it with the game's UI */
.gw-game{width:480px;padding:26px 26px 22px;border-radius:6px;background:#1f2533;color:#eef1f7;box-shadow:0 30px 70px -20px #000c;font-family:Archivo,sans-serif;position:relative;border:1px solid #394257}
.gw-game .t{display:flex;align-items:center;gap:10px;font:600 11px/1 "IBM Plex Mono",monospace;letter-spacing:.14em;color:#9aa6c0}
.gw-game .t i{width:10px;height:10px;border-radius:50%;background:#43c07a}
.gw-game h3{margin:14px 0 0;font-size:21px;font-weight:600;letter-spacing:-.01em;line-height:1.25}
.gw-game p{margin:10px 0 0;font-size:13.5px;line-height:1.55;color:#c3cad8}
.gw-game ul{margin:12px 0 0;padding:0;list-style:none;display:flex;gap:8px;flex-wrap:wrap}
.gw-game li{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:13px;background:#2b3345;font-size:12px;color:#dfe4ee}
.gw-game li svg{width:13px;height:13px}
.gw-game .bt{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}
.gw-game .bt button{height:40px;padding:0 22px;border-radius:4px;border:1px solid #4a5570;background:#2b3345;color:#eef1f7;font:600 14px/1 Archivo,sans-serif;cursor:pointer}
.gw-game .bt button.y{background:#2f7df6;border-color:#2f7df6;color:#fff}
.gw-game small{display:block;margin-top:14px;font-size:11.5px;color:#8b95ab}
.gw-sketch{font:500 10.5px/1.4 "IBM Plex Mono",monospace;letter-spacing:.06em;color:var(--ink-3)}

/* shared states --------------------------------------------------------------------- */
.gw-skel{display:flex;flex-direction:column;gap:8px}
.gw-skel i{display:block;height:58px;border-radius:12px;background:linear-gradient(90deg,var(--ground) 0,var(--raised) 40%,var(--ground) 80%);background-size:300% 100%;animation:gw-shim 1.4s ease-in-out infinite}
.gw-skel i:nth-child(2){animation-delay:.12s}.gw-skel i:nth-child(3){animation-delay:.24s;width:62%}
@keyframes gw-shim{from{background-position:100% 0}to{background-position:0 0}}
.gw-drift{display:grid;grid-template-columns:minmax(0,1fr) 34px minmax(0,1fr);gap:8px;align-items:center}
.gw-drift>div{padding:10px 12px;border-radius:10px;background:var(--ground);border:1px solid var(--rule-soft)}
.gw-drift b{display:block;margin-top:6px;font:500 15px/1 "IBM Plex Mono",monospace}
.gw-drift>div.now{border-color:color-mix(in srgb,var(--warn) 45%,transparent)}
.gw-drift>div.now b{color:var(--warn)}
.gw-drift .ar{height:0;border-top:1.5px dashed var(--ink-3);position:relative}
.gw-drift .ar::after{content:"";position:absolute;right:-1px;top:-5px;width:7px;height:7px;border-top:1.5px solid var(--ink-3);border-right:1.5px solid var(--ink-3);transform:rotate(45deg)}
.gw-tries{display:inline-flex;gap:4px;vertical-align:middle;margin-right:4px}
.gw-tries i{width:8px;height:8px;border-radius:50%;background:var(--ink-3)}
.gw-said{margin:0;font-size:14px;font-weight:600;line-height:1.45;color:var(--ink);text-wrap:pretty}
.gw-said.neg{color:var(--neg)}.gw-said.warn{color:var(--warn)}.gw-said.ok{color:var(--accent)}
.gw-sub{margin:-6px 0 0;font-size:13px;line-height:1.5;color:var(--ink-2)}
/* the undo strip at the foot of the window once the dialog is closed */
.gw-toast{display:flex;align-items:center;gap:12px;padding:8px 8px 8px 12px;border-radius:14px;background:var(--raised);border:1px solid var(--rule);box-shadow:0 16px 44px -12px #000b;font-size:13px;width:max-content;max-width:100%}
.light .gw-toast{box-shadow:0 16px 40px -16px #1a1f1c55}
.gw-toast .ic{width:28px;height:28px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;flex:none}
.gw-toast .ic svg{width:15px;height:15px;stroke-width:2.2}
.gw-toast .t{min-width:0;line-height:1.35}
.gw-toast .t small{display:block;font-size:11.5px;color:var(--ink-3)}
.gw-toast .gw-b{height:34px;padding:0 12px;font-size:13px}
.gw-toast .gw-x{width:30px;height:30px}

/* the write buttons where they sit on the board ---------------------------------------- */
.gw-btn{display:inline-flex;align-items:center;gap:9px;height:32px;padding:0 12px 0 10px;border-radius:9px;border:1px solid color-mix(in srgb,var(--accent) 45%,transparent);background:var(--accent-soft);color:var(--ink);font:500 12.5px/1 Archivo,sans-serif;cursor:pointer;white-space:nowrap;transition:transform .25s cubic-bezier(.34,1.56,.64,1),border-color .15s,background .15s;position:relative}
.gw-btn:hover{border-color:var(--accent);transform:translateY(-1px)}
.gw-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.gw-btn.alt{background:transparent;border-color:var(--rule)}
.gw-btn.alt:hover{border-color:var(--accent)}
.gw-btn .n{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--accent);color:var(--gw-on);font:600 10.5px/1 "IBM Plex Mono",monospace}
.gw-mw{position:relative;width:24px;height:10px;flex:none}
.gw-mw::before{content:"";position:absolute;left:0;top:1.5px;width:7px;height:7px;border-radius:50%;background:var(--accent)}
.gw-mw::after{content:"";position:absolute;right:0;top:0;width:8px;height:8px;border-radius:2.5px;border:1.5px solid currentColor;box-sizing:border-box;width:10px;height:10px}
.gw-mw i{position:absolute;left:8px;right:11px;top:4.5px;height:1.5px;background:repeating-linear-gradient(90deg,currentColor 0 2px,transparent 2px 4px);opacity:.55}
.gw-mw b{position:absolute;left:7px;top:3.5px;width:3.5px;height:3.5px;border-radius:50%;background:var(--accent);opacity:0}
.gw-btn:hover .gw-mw b,.gw-btn.hov .gw-mw b{animation:gw-hop .8s ease-in-out infinite}
@keyframes gw-hop{0%{transform:translateX(0);opacity:0}25%{opacity:1}75%{opacity:1}100%{transform:translateX(7px);opacity:0}}
.gw-btn.hov{border-color:var(--accent);transform:translateY(-1px)}
.gw-btn.asking{pointer-events:none;color:var(--ink-2)}
.gw-btn.asking .gw-spin{width:12px;height:12px;border-width:1.5px;color:var(--info)}
.gw-btn.off{border-style:dashed;border-color:var(--rule);background:transparent;color:var(--ink-3);cursor:not-allowed}
.gw-btn.off:hover{transform:none}
.gw-btn.off svg{width:14px;height:14px}
.gw-btn.off .n{background:var(--rule);color:var(--ink-2)}
.gw-tipshow{display:block;margin-top:8px;width:max-content;max-width:260px;padding:7px 10px;border-radius:5px;background:var(--tip-bg);color:var(--tip-ink);font:400 12px/1.4 Archivo,sans-serif;position:relative}
.gw-tipshow::before{content:"";position:absolute;left:16px;top:-4px;width:8px;height:8px;background:var(--tip-bg);transform:rotate(45deg)}
.gw-acts{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.gw-acts .gw-note{font-size:12px;color:var(--warn);display:inline-flex;align-items:center;gap:6px}
.gw-acts .gw-note svg{width:13px;height:13px}
.gw-frag{width:100%;padding:22px 26px 24px;border-radius:14px;background:var(--ground);border:1px solid var(--rule-soft)}
.gw-frag .sechead{margin-bottom:12px}
.gw-frag .sechead h2{font-size:16px}
.gw-frag .find{grid-template-columns:22px 150px 1fr auto;padding-right:10px}
.gw-frag .find .acts{grid-column:3/5;margin-top:10px}
.gw-frag table{font-size:13px}
.gw-frag td,.gw-frag th{padding:9px 10px}
.gw-setto{display:inline-flex;align-items:center;gap:8px}
.gw-setto input{width:84px;height:30px;padding:0 8px;border-radius:7px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);font:500 13px "IBM Plex Mono",monospace;text-align:right}
.gw-setto.ch input{border-color:var(--accent)}
.gw-setto .dotc{width:7px;height:7px;border-radius:50%;background:var(--accent)}
.gw-setto:not(.ch) .dotc{background:transparent}
.gw-sbtns{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:18px;align-items:start}
.gw-sbtns>div{display:flex;flex-direction:column;align-items:flex-start;gap:10px}

/* phone: the dialog becomes a sheet -------------------------------------------------- */
.gw-phone{position:relative;width:390px;height:844px;overflow:hidden;background:var(--ground)}
.gw-phone .ph-board{padding:18px 16px;filter:blur(1px);opacity:.55}
.gw-phone .ph-mast{display:flex;align-items:center;justify-content:space-between;height:52px;border-bottom:1px solid var(--rule)}
.gw-phone .ph-mast b{font-size:22px;font-weight:800;letter-spacing:-.04em}
.gw-phone .ph-mast b i{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);margin-left:2px}
.gw-phone .ph-row{height:54px;border-bottom:1px solid var(--rule-soft);display:flex;align-items:center;gap:10px}
.gw-phone .ph-row i{width:8px;height:8px;border-radius:50%;background:var(--warn)}
.gw-phone .ph-row span{height:9px;border-radius:4px;background:var(--raised);flex:1}
.gw-phone .ph-row span.s{flex:.4}
.gw-phone .ph-scrim{position:absolute;inset:0;background:#000a}
.light .gw-phone .ph-scrim{background:#1a1f1c66}
.gw-dlg.gw-sheet{position:absolute;left:0;right:0;bottom:0;width:auto;border-radius:20px 20px 0 0;border-bottom:0;max-height:calc(100% - 48px);overflow:hidden}
.gw-sheet .gw-grab{width:38px;height:4px;border-radius:2px;background:var(--rule);margin:8px auto -6px}
.gw-sheet .gw-head{padding:16px 12px 12px 16px}
.gw-sheet .gw-verdict{margin:0 16px}
.gw-sheet .gw-body{padding:14px 16px 2px;overflow:hidden}
.gw-sheet .gw-foot{flex-wrap:wrap;padding:14px 16px 26px;border-top:1px solid var(--rule-soft);margin-top:12px;background:var(--surface)}
.gw-sheet .gw-foot .gw-hint{flex-basis:100%;max-width:none;margin:0 0 4px}
.gw-sheet .gw-foot .gw-b{flex:1;height:46px}
.gw-sheet .gw-roles{gap:6px}
.gw-sheet .gw-role{min-height:56px;padding:8px 10px;gap:10px}
.gw-sheet .gw-shirt{width:34px;height:34px}
.gw-phone .gw-toast{position:absolute;left:12px;right:12px;bottom:18px;width:auto}
.gw-fade{position:relative}
.gw-fade::after{content:"";position:absolute;left:0;right:0;bottom:0;height:60px;background:linear-gradient(transparent,var(--surface));pointer-events:none}
@media (prefers-reduced-motion:reduce){.board *{animation:none!important;transition:none!important}}
"""

# --------------------------------------------------------------------------
# icons (stroke, 24 grid)
# --------------------------------------------------------------------------
P = {
    "shirt": '<path d="M8 4L3 7l2 4 2-1v10h10V10l2 1 2-4-5-3a4 4 0 0 1-8 0z"></path>',
    "crate": '<path d="M3.5 8.5 12 4l8.5 4.5v8L12 21l-8.5-4.5z"></path><path d="M3.5 8.5 12 13l8.5-4.5M12 13v8"></path>',
    "roster": '<path d="M4 7h9M4 12h16M4 17h6"></path><path d="M16 5v4M13 15v4"></path>',
    "game": '<path d="M7 8.5h10a4.5 4.5 0 0 1 4.4 5.4l-.6 2.900a2.200 2.200 0 0 1-3.800 1L15 15.500H9l-2 2.300a2.200 2.200 0 0 1-3.800-1l-.6-2.900A4.500 4.500 0 0 1 7 8.500z"></path><path d="M8.500 11.500v3M7 13h3M15.500 12.300v.01M17.300 13.800v.01"></path>',
    "tank": '<ellipse cx="12" cy="5.500" rx="7" ry="2.500"></ellipse><path d="M5 5.500v13c0 1.400 3.100 2.500 7 2.500s7-1.100 7-2.500v-13"></path><path d="M5 12c0 1.400 3.100 2.500 7 2.500s7-1.100 7-2.500"></path>',
    "truck": '<path d="M2 7h11v9H2zM13 10h4l3 3v3h-7z"></path><circle cx="6.500" cy="17.500" r="1.800"></circle><circle cx="16.500" cy="17.500" r="1.800"></circle>',
    "lock": '<rect x="5" y="10.500" width="14" height="10" rx="2"></rect><path d="M8 10.500V7.500a4 4 0 0 1 8 0v3"></path>',
    "tick": '<path d="M5 12.500l4.500 4.500L19 7"></path>',
    "close": '<path d="M6 6l12 12M18 6L6 18"></path>',
    "right": '<path d="M5 12h14M13 6l6 6-6 6"></path>',
    "undo": '<path d="M9 14L4 9l5-5"></path><path d="M4 9h10.500a5.500 5.500 0 0 1 0 11H11"></path>',
    "refresh": '<path d="M20 12a8 8 0 1 1-2.300-5.700"></path><path d="M20 4v5h-5"></path>',
    "alert": '<path d="M12 4l9 16H3z"></path><path d="M12 10v4.500M12 17.500v.01"></path>',
    "info": '<circle cx="12" cy="12" r="8.500"></circle><path d="M12 11v5M12 8v.01"></path>',
    "play": '<path d="M8 5.500v13l10.500-6.500z"></path>',
    "pause": '<path d="M9 6v12M15 6v12"></path>',
    "coin": '<circle cx="12" cy="12" r="8.500"></circle><path d="M14.500 9.500c-.500-1-1.500-1.500-2.500-1.500-1.500 0-2.500.800-2.500 2s1 1.700 2.500 2 2.500.800 2.500 2-1 2-2.500 2c-1.200 0-2.200-.600-2.600-1.600M12 6.500V8M12 16v1.500"></path>',
    "cap": '<path d="M4 20V8M4 8h16M20 8v12"></path><path d="M8 14h8"></path>',
    "exit": '<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H8"></path>',
    "person": '<circle cx="12" cy="8" r="3.500"></circle><path d="M5 20a7 7 0 0 1 14 0"></path>',
    "plus": '<path d="M12 5v14M5 12h14"></path>',
    "clock": '<circle cx="12" cy="12" r="8.500"></circle><path d="M12 7v5l3.500 2"></path>',
    "flame": '<path d="M12 21c-3.900 0-6.500-2.600-6.500-6.200 0-3.100 2.100-5.100 3.600-7.300.500 1.700 1.500 2.800 2.600 3.300C11.700 7.300 13 4.600 15.200 3c-.300 2.900 3.300 5.700 3.300 10.600 0 4.300-2.800 7.400-6.500 7.400z"></path>',
    "key": '<circle cx="8" cy="14" r="4"></circle><path d="M11 11l9-8M16 6.500l3 3"></path>',
    "plug": '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"></path>',
    "calendar": '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path>',
    "sun": '<circle cx="12" cy="12" r="4"></circle><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600l1.400 1.400M17 17l1.400 1.400M5.600 18.400 7 17M17 7l1.400-1.400"></path>',
    "cursor": '<path d="M5 3l14 7-6 2-2 6z"></path>',
    "sofa": '<path d="M6 11V8a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v3"></path><path d="M4 13a2 2 0 0 1 4 0v2h8v-2a2 2 0 0 1 4 0v5H4zM7 18v2M17 18v2"></path>',
    "save": '<path d="M5 4h11l3 3v13H5z"></path><path d="M8 4v5h7V4M8 20v-6h8v6"></path>',
    "skip": '<path d="M6 5.500v13l9-6.500zM18 5v14"></path>',
    "shield": '<path d="M12 3l7 3v6c0 4.500-3 7.500-7 9-4-1.500-7-4.500-7-9V6z"></path>',
    "hire": '<circle cx="10" cy="8" r="3.500"></circle><path d="M3.500 20a6.500 6.500 0 0 1 13 0M19 8v6M16 11h6"></path>',
}


def svg(name: str, cls: str = "") -> str:
    c = f' class="{cls}"' if cls else ""
    return f'<svg{c} viewBox="0 0 24 24" aria-hidden="true">{P[name]}</svg>'


def i(name: str) -> str:
    return f'<span class="sp-i">{svg(name)}</span>'


def esc(text: str) -> str:
    return html.escape(text, quote=True)


def n(v: float) -> str:
    return f"{v:,.0f}"


# --------------------------------------------------------------------------
# the dialog's parts
# --------------------------------------------------------------------------
def wire(state: str) -> str:
    return (f'<span class="gw-w {state}" aria-hidden="true"><span class="a"></span><span class="ln"></span>'
            f'<span class="p"></span><span class="p"></span><span class="p"></span><span class="g">{svg("game")}</span></span>')


def verdict(state: str, text: str, meta: str = "", attrs: str = "") -> str:
    m = f'<span class="gw-meta">{meta}</span>' if meta else ""
    return f'<div class="gw-verdict" role="status" {attrs}>{wire(state)}<span>{text}</span>{m}</div>'


def where(hood: str, name: str, extra: str = "") -> str:
    h = f'<span class="hood">{hood}</span>' if hood else ""
    return f'<div class="gw-where">{h}<span>{name}</span>{extra}</div>'


def dialog(kind: str, title: str, sub: str, verdict_html: str, body: str, foot: str,
           cls: str = "", attrs: str = "", sheet: bool = False) -> str:
    grab = '<div class="gw-grab"></div>' if sheet else ""
    return f"""<div class="gw-dlg{' gw-sheet' if sheet else ''} {cls}" role="dialog" aria-label="{esc(title)}" {attrs}>{grab}
<div class="gw-head"><span class="gw-kind">{svg(kind)}</span><div><h2>{title}</h2>{sub}</div>
<button type="button" class="gw-x" aria-label="Close">{svg("close")}</button></div>
{verdict_html}
<div class="gw-body">{body}</div>
<div class="gw-foot">{foot}</div>
</div>"""


def btn(label: str, kind: str = "", icon: str = "", count: str = "", disabled: bool = False, attrs: str = "") -> str:
    ic = svg(icon, "go" if kind == "go" and icon == "right" else "") if icon else ""
    cnt = f'<span class="n">{count}</span>' if count else ""
    dis = ' disabled="disabled"' if disabled else ""
    lead = ic if icon in ("undo", "refresh", "skip", "key") else ""
    tail = ic if not lead else ""
    return f'<button type="button" class="gw-b {kind}"{dis} {attrs}>{lead}{label}{cnt}{tail}</button>'


def hint(text: str, cls: str = "") -> str:
    return f'<span class="gw-hint {cls}">{text}</span>'


def col(num: str, label: str, content: str, width: int = 480) -> str:
    w = f' style="width: {width}px;"' if width != 480 else ""
    return f'<div class="gw-col"{w}><div class="gw-state"><b>{num}</b><span>{label}</span></div>{content}</div>'


def stage(cols: list[str], wrap: bool = False) -> str:
    return f'<div class="gw-stage{" gw-wrap" if wrap else ""}">{"".join(cols)}</div>'


def top(title: str, sub: str) -> str:
    return f'<div class="gw-top"><h1>{title}</h1><p>{sub}</p></div>'


def reread(done: bool = False) -> str:
    if done:
        return f'<div class="gw-reread done">{svg("tick")}<span>The board shows the game as it now stands</span></div>'
    return '<div class="gw-reread"><span>Reading the game again</span><div class="gw-prog"><i></i></div></div>'


# --------------------------------------------------------------------------
# uniforms
# --------------------------------------------------------------------------
def role(name: str, state: str, preset: str = "Default") -> str:
    """A role: to be dressed, dressed already (kept), or dressed by this write."""
    if state == "kept":
        return (f'<div class="gw-role kept" data-read="{esc(f"<b>{name}</b> has a uniform already: the write never changes it")}">'
                f'<span class="gw-shirt">{svg("shirt")}<span class="gw-badge">{svg("lock")}</span></span>'
                f'<div><b>{name}</b><small>has one · kept</small></div></div>')
    after = f'<em class="gw-pn">{preset}</em>'
    line = (f'{svg("tick")}{after}' if state == "done"
            else f'<span class="gw-was">none {svg("right")}</span><span class="gw-now">{svg("tick")}</span>{after}')
    cls = "to done" if state == "done" else "to"
    return (f'<div class="gw-role {cls}" data-read="{esc(f"<b>{name}</b>: no uniform now, <em>{preset}</em> after")}">'
            f'<span class="gw-shirt">{svg("shirt")}<span class="gw-badge gw-tk">{svg("tick")}</span></span>'
            f'<div><b>{name}</b><small>{line}</small></div></div>')


FITNESS_ROLES = [("Gym Trainer", "to"), ("Security Guard", "to"), ("Cleaning", "to"), ("Customer Service", "kept")]


def roles(items, preset="Default", done=False) -> str:
    cards = "".join(role(nm, "done" if done and st == "to" else st, preset) for nm, st in items)
    return f'<div data-readzone><div class="gw-roles">{cards}</div><div class="gw-read sp-readout" style="margin-top:8px">Hover a role</div></div>'


def presets(names: list[str], on: str) -> str:
    if len(names) == 1:
        return (f'<div class="gw-pick"><span class="gw-lab">Uniform</span><span class="gw-presets">'
                f'<span class="gw-preset only" aria-pressed="true"><span class="ic">{svg("shirt")}</span>{names[0]}</span></span>'
                f'<span class="gw-only">the only one in your game</span></div>')
    pills = "".join(f'<button type="button" class="gw-preset" aria-pressed="{"true" if nm == on else "false"}" data-preset="{nm}">'
                    f'<span class="ic">{svg("shirt")}</span>{nm}</button>' for nm in names)
    return f'<div class="gw-pick"><span class="gw-lab">Uniform</span><span class="gw-presets" role="group" aria-label="Uniform">{pills}</span></div>'


FITNESS = where("GD", "HART. Fitness · Garment District")
UNI_LEAD = '<p class="gw-lead">Every role this shop can dress gets a uniform. One already set stays as it is.</p>'


def uni_ready(preset_names: list[str], on: str, demo: bool = False) -> str:
    body = (f'<div data-show="ready">{presets(preset_names, on)}</div>' + roles(FITNESS_ROLES, on)
            + f'<div class="gw-off" data-show="done">{reread()}</div>')
    ready = verdict("ok", "<b>The game will dress 3 roles</b>", "Sun 14:02")
    verdict_html = ready
    if demo:
        done = verdict("ok", f'<b>Done in the game:</b> <span class="gw-pn">{on}</span> on 3 roles', "Sun 14:02")
        verdict_html = (f'<div data-show="ready">{ready}</div>'
                        f'<div class="gw-off" data-show="applying">{verdict("ask", "<b>Setting uniforms in the game…</b>")}</div>'
                        f'<div class="gw-off" data-show="done">{done}</div>')
    spin = btn('<span class="gw-spin"></span>Applying', "go busy")
    foot = (f'<span class="gw-hint" data-show="ready">Nothing changes until you apply.</span>'
            f'<span class="gw-hint gw-off" data-show="done">Undo stays until your next uniform change.</span>'
            f'<span data-show="ready">{btn("Cancel", "ghost")}</span>'
            f'<span data-show="ready">{btn("Set 3 uniforms", "go", "right", attrs="data-apply")}</span>'
            f'<span class="gw-off" data-show="applying" style="margin-left:auto">{spin}</span>'
            f'<span class="gw-off" data-show="done">{btn("Undo", "undo", "undo", attrs="data-undo")}</span>'
            f'<span class="gw-off" data-show="done">{btn("Close", "go")}</span>')
    if not demo:
        foot = hint("Nothing changes until you apply.") + btn("Cancel", "ghost") + btn("Set 3 uniforms", "go", "right")
    lead = f'<div data-show="ready">{UNI_LEAD}</div>' if demo else UNI_LEAD
    return dialog("shirt", "Set uniforms", FITNESS, verdict_html, lead + body, foot,
                  attrs='data-demo="uniforms"' if demo else "")


def uni_done() -> str:
    body = (f'<p class="gw-said ok">Default is on 3 roles at HART. Fitness.</p>'
            + roles(FITNESS_ROLES, "Default", done=True) + reread())
    foot = hint("Undo stays until your next uniform change.") + btn("Undo", "undo", "undo") + btn("Close", "go")
    return dialog("shirt", "Set uniforms", FITNESS, verdict("ok", "<b>Done in the game</b>", "Sun 14:02"), body, foot)


def uniforms_main() -> str:
    return (top("Uniforms · one shop",
                "Opened from “Set Default uniforms” on the alert row or the shop's panel. The dialog opens on the game's own answer (the dry run): "
                "which roles it will dress, which already have a uniform and stay as they are. Try it: pick a uniform, apply, undo.")
            + stage([
                col("01", "Ready · one uniform in the game (the usual case)", uni_ready(["Default"], "Default", demo=True)),
                col("02", "Ready · the game has several uniforms", uni_ready(["Default", "Preset #2", "Preset #3"], "Preset #2", demo=True)),
                col("03", "Done, with Undo", uni_done()),
            ]))


# --------------------------------------------------------------------------
# uniforms at every shop the alert names
# --------------------------------------------------------------------------
SHOPS = [
    ("GD", "HART. Fitness", [("Gym Trainer", 1), ("Security Guard", 1), ("Cleaning", 1), ("Customer Service", 0)]),
    ("MT", "HART. Cuts", [("Hair Stylist", 1), ("Cleaning", 1), ("Customer Service", 0)]),
    ("HK", "HART. Coffee", [("Customer Service", 1), ("Cleaning", 1), ("Security Guard", 1), ("Cleaning", 0)]),
    ("MH", "HART. Books", [("Customer Service", 1), ("Cleaning", 1), ("Security Guard", 0)]),
    ("LM", "HART. Gym Two", None),
    ("MH", "HART. Florist", [("Customer Service", 1), ("Cleaning", 1), ("Security Guard", 1), ("Stage Crew", 1), ("DJ", 0)]),
    ("LM", "HART. Liquor", [("Customer Service", 1), ("Cleaning", 1), ("Security Guard", 1), ("Delivery Driver", 1), ("Graphic Designer", 0)]),
]


def shop_row(hood: str, name: str, rs, done: bool = False) -> str:
    if rs is None:
        return (f'<div class="gw-shop bad" data-leave-row="1"><div class="nm"><span class="hood">{hood}</span><span>{name}</span></div>'
                f'<span class="gw-minis"></span><span class="c"></span>'
                f'<div class="gw-why"><span><b>No uniform locker</b>: the game sets uniforms only where one stands.</span>'
                f'<button type="button" class="gw-mini-b" data-leave="1">{svg("skip")}Leave it out</button></div></div>')
    to = [r for r, d in rs if d]
    kept = [r for r, d in rs if not d]
    minis = "".join(f'<i class="{"" if d else "k"}" style="--k:{k}">{svg("tick" if done and d else "shirt")}</i>' for k, (r, d) in enumerate(rs))
    read = f"<b>{name}</b> · " + ", ".join(to) + " <em>→ Default</em>" + (f" · {', '.join(kept)} kept" if kept else "")
    return (f'<div class="gw-shop" data-read="{esc(read)}"><div class="nm"><span class="hood">{hood}</span><span>{name}</span></div>'
            f'<span class="gw-minis">{minis}</span><span class="c">{len(to)}</span></div>')


def uni_all_ready() -> str:
    rows = "".join(shop_row(h, nm, rs) for h, nm, rs in SHOPS)
    body = f"""<div class="gw-tally">
<div><span class="gw-lab">Get Default</span><span class="gw-big">{svg("shirt")}18</span></div>
<div><span class="gw-lab">Kept</span><span class="gw-big dim">{svg("lock")}6</span></div>
<div style="margin-left:auto;align-items:flex-end"><span class="gw-lab">Shops</span><span class="gw-big dim" data-until-left="1">6<span style="font-size:15px;color:var(--neg)">+1</span></span><span class="gw-big dim gw-off" data-when-left="1">6</span></div>
</div>
<div data-readzone><div class="gw-shops">{rows}</div><div class="gw-read sp-readout" style="margin-top:8px">Hover a shop for its roles</div></div>"""
    v = (f'<div data-until-left="1">{verdict("no", "<b>The game refuses 1 of 7 shops</b>", "Sun 14:02")}</div>'
         f'<div class="gw-off" data-when-left="1">{verdict("ok", "<b>The game will dress 18 roles</b>", "Sun 14:02")}</div>')
    foot = (f'<span class="gw-hint warn" data-until-left="1">Every shop is set, or none. Leave HART. Gym Two out, or place a locker first.</span>'
            f'<span class="gw-hint gw-off" data-when-left="1">HART. Gym Two keeps its warning.</span>'
            + btn("Cancel", "ghost")
            + f'<span data-until-left="1">{btn("Set 18 uniforms", "go", "right", disabled=True)}</span>'
            + f'<span class="gw-off" data-when-left="1">{btn("Set 18 uniforms", "go", "right")}</span>')
    return dialog("shirt", "Set uniforms at 7 shops", where("", "Every shop the alert names"), v, body, foot, attrs='data-leavebox="1"')


def uni_all_done() -> str:
    rows = "".join(shop_row(h, nm, rs, done=True) for h, nm, rs in SHOPS if rs)
    body = f"""<p class="gw-said ok">Default is on 18 roles at 6 shops.</p>
<div data-readzone><div class="gw-shops">{rows}</div><div class="gw-read sp-readout" style="margin-top:8px"></div></div>
{reread(done=True)}"""
    foot = hint("Undo takes back all 6 shops at once.") + btn("Undo", "undo", "undo") + btn("Close", "go")
    return dialog("shirt", "Set uniforms at 6 shops", where("", "HART. Gym Two was left out"), verdict("ok", "<b>Done in the game</b>", "Sun 14:03"), body, foot)


def uniforms_all() -> str:
    return (top("Uniforms · every shop at once",
                "“Set for all 7 shops” on the alert group. One row a shop, one shirt a role: outlined gets the uniform, grey keeps its own. "
                "A shop the game refuses says why in its row and can be left out, so one missing locker does not block the other six.")
            + stage([col("01", "Ready · one shop refused (click “Leave it out”)", uni_all_ready()),
                     col("02", "Done", uni_all_done())]))


# --------------------------------------------------------------------------
# imports
# --------------------------------------------------------------------------
def lvl(now: float, after: float, top_: float, cap: float | None = None, need: float | None = None, stopped: bool = False,
        now_label: bool = True) -> str:
    """One bar: what is set now, what the write sets, the importer's cap, and what the caps leave uncovered."""
    pc = lambda v: f"{v / top_ * 100:.1f}%"
    lo, hi = min(now, after), max(now, after)
    parts = f'<i class="base{" stopped" if stopped else ""}{" full" if hi == lo else ""}" style="left:0;width:{pc(lo)}"></i>'
    if after > now:
        parts += f'<i class="add" style="left:{pc(now)};width:{pc(after - now)}"></i>'
    elif now > after:
        parts += f'<i class="cut" style="left:{pc(after)};width:{pc(now - after)}"></i>'
    if need and need > after:
        parts += f'<i class="short" style="left:{pc(after)};width:{pc(need - after)}"></i>'
    if cap:
        parts += f'<u class="cap" style="left:{pc(cap)}"><span>cap {n(cap)}</span></u>'
    if now_label and now and not cap:
        parts += f'<u style="left:{pc(now)};opacity:.7"><span>now</span></u>'
    return f'<div class="gw-lvl">{parts}</div>'


def line(icon: str, name: str, smart: bool, now: float, after: float, bar: str, imps: str, notes: str = "",
         cls: str = "", read: str = "") -> str:
    mode = (f'<span class="gw-mode smart" title="Smart Delivery: keeps this in stock">{svg("tank")}</span>' if smart
            else f'<span class="gw-mode" title="Arrives each Monday">{svg("truck")}</span>')
    unit = "in stock" if smart else "a week"
    num = (f'<span class="gw-num"><s>{n(now)}</s>{svg("right")}{n(after)}<small>{unit}</small></span>' if now != after
           else f'<span class="gw-num">{n(after)}<small>{unit}</small></span>')
    return (f'<div class="gw-line {cls}"><div class="gw-lt"><span class="gw-mat">{svg(icon)}</span><b>{name}</b>{mode}{num}</div>'
            f'{bar}<div class="gw-imps">{imps}</div>{notes}</div>')


def imp(k: int, name: str, terms: str = "", stopped: bool = False) -> str:
    mark = svg("pause") if stopped else str(k)
    t = f"<small>{terms}</small>" if terms else ""
    s = '<small style="color:var(--warn)">stopped</small>' if stopped else ""
    return f'<span class="gw-imp{" stopped" if stopped else ""}"><i>{mark}</i>{name}{t}{s}</span>'


def call(kind: str, icon: str, text: str) -> str:
    return f'<div class="gw-call {kind}">{i(icon)}<div>{text}</div></div>'


DEPOT_N = '<div class="gw-depot"><span class="hood">IC</span>HART. DEPOT NORTH · 8TH AVENUE 4</div>'
DEPOT_S = '<div class="gw-depot"><span class="hood">IC</span>HART. DEPOT SOUTH · 7TH AVENUE 2</div>'
LEGEND = (f'<div class="gw-legend"><span class="sm">{svg("tank")}Smart Delivery keeps this much in stock</span>'
          f'<span>{svg("truck")}arrives every Monday</span></div>')


def imp_lines(state: str = "ready") -> str:
    metal = line("crate", "Metal Band", True, 3800, 4200, lvl(3800, 4200, 5000),
                 imp(1, "BlueStone Imports", "$5.50 each"))
    fabric_notes = (call("neg", "cap", "<b>200 a week not covered</b>: the importers' caps are reached.")
                    + call("info", "tank", "7 Pier's Smart Delivery contract for Fabric (Cheap) at HART. Depot South orders first and can use up to 600 of the cap."))
    fabric = line("crate", "Fabric (Cheap)", False, 900, 1200, lvl(900, 1200, 1500, cap=1200, need=1400),
                  imp(1, "7 Pier", "$2.10 each"), fabric_notes)
    restart = call("warn", "play", "<b>Maritime Freight Line is stopped.</b> This starts it again, with Repeating on."
                   "<div class=\"gw-cash\"><div class=\"tr\"><i style=\"--w:8%\"></i></div><span>next delivery, day 190: <b>$11,800</b> of $148,230</span></div>"
                   f"<div class=\"gw-chips\"><span class=\"gw-chip\">{svg('play')}also starts: <b>Metal Band</b> · 400 a week</span></div>")
    exp = line("crate", "Fabric (Expensive)", False, 600, 800, lvl(600, 800, 1000, stopped=True),
               imp(1, "Maritime Freight Line", stopped=True), restart)
    if state == "locked":
        metal = line("crate", "Metal Band", True, 3800, 4200, "", imp(1, "BlueStone Imports", "$5.50 each"), cls="dim")
        fabric = line("crate", "Fabric (Cheap)", False, 900, 1200, "", imp(1, "7 Pier", "$2.10 each"), cls="dim")
        exp = line("crate", "Fabric (Expensive)", False, 600, 800, "", imp(1, "Maritime Freight Line", stopped=True), cls="dim")
    if state == "done":
        tick = f'<div class="gw-chips" style="margin-top:0"><span class="gw-chip ok">{svg("tick")}set</span></div>'
        metal = line("crate", "Metal Band", True, 4200, 4200, "", tick, cls="ticked")
        fabric = line("crate", "Fabric (Cheap)", False, 1200, 1200, "", tick + call("neg", "cap", "200 a week still not covered: the caps are reached."), cls="ticked")
        exp = line("crate", "Fabric (Expensive)", False, 800, 800, "",
                   f'<div class="gw-chips" style="margin-top:0"><span class="gw-chip ok">{svg("tick")}set</span><span class="gw-chip ok">{svg("play")}Maritime Freight Line started</span></div>', cls="ticked")
    return f"{DEPOT_N}{metal}{fabric}{DEPOT_S}{exp}"


def imports_ready() -> str:
    body = LEGEND + imp_lines()
    foot = hint("Written all together, or not at all.") + btn("Cancel", "ghost") + btn("Apply 3 changes", "go", "right")
    return dialog("crate", "Weekly imports", where("", "2 depots · Industry City"),
                  verdict("ok", "<b>The game takes all 3</b>", "orders close<br>Sun 20:00 · in 6 h"), body, foot)


def lock_strip() -> str:
    # Sunday 16:00 to Monday 09:00, an hour a cell; closed from Sunday 20:00 to Monday 08:00; now Sunday 23:10
    hours = list(range(16, 24)) + list(range(0, 10))
    cells = "".join(f'<i class="{"x" if 4 <= k < 16 else ""}{" now" if k == 7 else ""}"></i>' for k, _ in enumerate(hours))
    labs = ('<span style="grid-column:1/span 4">Sun 16</span><span style="grid-column:5/span 3">20:00</span>'
            '<span class="n" style="grid-column:8/span 4">now 23:10</span>'
            '<span class="r" style="grid-column:15/span 4;text-align:right">Mon 08:00</span>')
    return f'<div class="gw-lock" aria-hidden="true"><div class="cells">{cells}</div><div class="labs">{labs}</div></div>'


def imports_locked() -> str:
    refusal = f"""<div class="gw-no">
<span class="ic">{svg("lock")}</span>
<div class="rule">Orders for Monday's delivery closed Sunday 20:00; they reopen Monday 08:00.</div>
<div class="gw-chips"><span class="gw-chip neg">BlueStone Imports · Metal Band</span><span class="gw-chip neg">7 Pier · Fabric (Cheap)</span></div>
<div class="fix">{svg("right")}<span>That is day 190, 08:00 game time: try again then.</span></div>
{lock_strip()}
</div>"""
    body = refusal + f'<p class="gw-lead" style="margin-top:2px">Waiting with them, since the three go together:</p>' + imp_lines("locked")
    foot = hint("Nothing was changed.") + btn("Close", "ghost") + btn("Apply 3 changes", "go", "right", disabled=True)
    return dialog("crate", "Weekly imports", where("", "2 depots · Industry City"),
                  verdict("no", "<b>The game refuses 2 of 3</b>", "Sun 23:10"), body, foot)


def imports_done() -> str:
    body = (f'<p class="gw-said ok">3 amounts set, 1 contract started.</p>' + imp_lines("done") + reread())
    foot = hint("Undo stays until your next imports change.") + btn("Undo", "undo", "undo") + btn("Close", "go")
    return dialog("crate", "Weekly imports", where("", "2 depots · Industry City"),
                  verdict("ok", "<b>Done in the game</b>", "Sun 14:05"), body, foot)


def imports() -> str:
    return (top("Imports",
                "“Apply 3 changes in game” above the Weekly imports table (one per depot, one for the section). A card a material, grouped by depot: "
                "the bar is what the contract holds now (grey) and what the write sets (green); red hatching is what the importers' caps leave uncovered. "
                "Contracts show in the game's delivery order, read-only.")
            + stage([col("01", "Ready · a cap, a Smart contract ahead, a stopped contract restarted", imports_ready()),
                     col("02", "Refused · inside the lock window", imports_locked()),
                     col("03", "Done, with Undo", imports_done())]))


# --------------------------------------------------------------------------
# the schedule
# --------------------------------------------------------------------------
DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
DAYF = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def week(now: list[tuple], after: list[tuple]) -> str:
    top_ = max(h for _, h in now + after) or 1
    out = ""
    for k in range(7):
        (ne, nh), (ae, ah) = now[k], after[k]
        d = ah - nh
        dl = f'<span class="dl gw-up">+{d} h</span>' if d > 0 else f'<span class="dl gw-dn">−{-d} h</span>' if d < 0 else '<span class="dl">=</span>'
        read = f"<b>{DAYF[k]}</b> · {ne} entries, {nh} h <em>→ {ae} entries, {ah} h</em>"
        out += (f'<div class="gw-wd{" same" if d == 0 and ne == ae else ""}" data-read="{esc(read)}">{dl}'
                f'<div class="bars"><i class="n" style="--h:{max(nh / top_ * 64, 2):.0f}px"></i><i class="a" style="--h:{max(ah / top_ * 64, 2):.0f}px"></i></div>'
                f'<span class="d">{DAYS[k]}</span></div>')
    return (f'<div data-readzone><div class="gw-week">{out}</div>'
            f'<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px">'
            f'<div class="gw-read sp-readout">Hover a day</div>'
            f'<div class="gw-key"><span><i></i>now</span><span><i class="a"></i>after</span></div></div></div>')


def tiles(items: list[tuple]) -> str:
    out = ""
    for lab, a, b in items:
        v = f"<s>{a}</s>{svg('right')}{b}" if a != b else b
        out += f'<div class="gw-tile"><span class="gw-lab">{lab}</span><div class="v">{v}</div></div>'
    return f'<div class="gw-tiles">{out}</div>'


def person(code: str, name: str, sub: str = "", cls: str = "", icon: str = "") -> str:
    ic = i(icon) if icon else ""
    s = f"<small>{sub}</small>" if sub else ""
    return f'<span class="person {cls}"><i>{code}</i>{name}{s}{ic}</span>'


FIT_NOW = [(12, 88)] * 5 + [(12, 86), (12, 86)]
FIT_AFTER = [(13, 96)] * 5 + [(12, 90), (13, 90)]


def add_people(n_people: int, assign: list[tuple], hire: list[tuple], staffed: int, empty: int) -> str:
    who = []
    if assign:
        who.append("assign " + ", ".join(nm.split()[0] for _, nm in assign) + " (unassigned)")
    if hire:
        who.append("hire " + ", ".join(f"{k} {r}" for k, r in hire))
    pills = "".join(person(c, nm, "unassigned", "bench") for c, nm in assign)
    pills += "".join(person(svg("plus"), f"{k} × {r}", "to hire", "hire") for k, r in hire)
    tot = staffed + empty
    return f"""<div class="gw-box warn">
{call("warn", "hire", f"<b>Add {n_people} people to fill this plan</b>: {' and '.join(who)}. {empty} h a week stay empty until then.")}
<div class="gw-pills">{pills}</div>
<div class="gw-cover"><i class="c" style="flex:{staffed / tot:.3f}"></i><i class="e" style="flex:{empty / tot:.3f}"></i></div>
<div class="gw-coverk"><span><b>{staffed} h</b> written now</span><span class="w">{empty} h wait for them</span></div>
</div>"""


def sched_demand() -> str:
    body = (f'<div style="display:flex;gap:8px;align-items:center"><span class="gw-plan">{svg("roster")}Demand plan</span>'
            f'<span class="gw-only">replaces the whole week</span></div>'
            + tiles([("Entries", "84", "90"), ("Hours / week", "612", "660"), ("People", "12", "10")])
            + week(FIT_NOW, FIT_AFTER)
            + f"""<div class="gw-box">{call("", "exit", "<b>No shift here after this</b>. The game takes them off their work here and adds a to-do, as its own schedule does.")}
<div class="gw-pills">{person("AS", "Ana Silva", "Cleaning")}{person("BC", "Ben Cho", "Security Guard")}</div></div>"""
            + add_people(4, [("KM", "Kai Moss"), ("LP", "Lena Park")], [(2, "Customer Service")], 516, 144)
            + call("warn", "flame", "<b>Tess Wolf</b> works 14 h on Thursday. The game allows it."))
    foot = hint("Nothing changes until you apply.") + btn("Cancel", "ghost") + btn("Write the week", "go", "right")
    return dialog("roster", "Write this roster to the game", FITNESS,
                  verdict("ok", "<b>The game takes the week</b>", "Sun 14:02"), body, foot)


GYM_NOW = [(1, 12)] * 6 + [(0, 0)]
GYM_AFTER = [(3, 36)] * 4 + [(2, 24)] * 3


def hours_strip(label: str, lo: int, hi: int, new: bool = False) -> str:
    cells = "".join(f'<i class="{"o" if lo <= h < hi else ""}{" new" if new and not (8 <= h < 22) else ""}"></i>' for h in range(24))
    return f'<span>{label}</span><div class="h">{cells}</div>'


def sched_full() -> str:
    toggle = f"""<div class="gw-toggle" data-toggle-box="1">
<div><b>Also open every day 0 to 24</b><small>An hour the shop is closed is an hour the demand test never measures.</small></div>
<button type="button" class="sw on" role="switch" aria-checked="true" aria-label="Also open every day 0 to 24" data-toggle="1"></button>
<div class="gw-hrs">{hours_strip("now", 8, 22)}{hours_strip("after", 0, 24, new=True)}</div>
</div>"""
    body = (f'<div style="display:flex;gap:8px;align-items:center"><span class="gw-plan full">{svg("sun")}Full cover 24/7</span>'
            f'<span class="gw-only">a new shop: every station, every hour</span></div>'
            + tiles([("Entries", "6", "18"), ("Hours / week", "72", "216"), ("Open", "8–22", "0–24")])
            + week(GYM_NOW, GYM_AFTER) + toggle
            + add_people(6, [], [(4, "Gym Trainer"), (2, "Cleaning")], 216, 288))
    foot = hint("Nothing changes until you apply.") + btn("Cancel", "ghost") + btn("Write the week", "go", "right")
    return dialog("roster", "Write this roster to the game", where("LM", "HART. Gym Two · Lower Manhattan"),
                  verdict("ok", "<b>The game takes the week</b>", "Sun 14:02"), body, foot)


def sched_done() -> str:
    body = (f'<p class="gw-said ok">HART. Fitness: 90 entries set in place of 84.</p>'
            + tiles([("Entries", "90", "90"), ("Hours / week", "660", "660"), ("People", "10", "10")])
            + call("warn", "hire", "<b>144 h a week stay empty</b> until you add 4 people. Write the roster again then: the board keeps this note on the roster until it is full.")
            + reread())
    foot = hint("Undo stays until your next schedule change.") + btn("Undo", "undo", "undo") + btn("Close", "go")
    return dialog("roster", "Write this roster to the game", FITNESS, verdict("ok", "<b>Done in the game</b>", "Sun 14:03"), body, foot)


def schedule() -> str:
    return (top("Schedule · one shop",
                "“Write this roster to the game” in a shop's Staffing block. The week as seven pairs of bars, now against after; "
                "the people it affects as pills; what the plan still waits on as a bar of written against empty hours.")
            + stage([col("01", "Ready · demand plan, with people left without a shift", sched_demand()),
                     col("02", "Ready · full cover for a new shop, open 0–24 (click the switch)", sched_full()),
                     col("03", "Done, with Undo", sched_done())]))


CUTS_NOW = [(6, 44)] * 5 + [(5, 40), (5, 40)]
CUTS_AFTER = [(6, 44)] * 5 + [(6, 46), (6, 46)]


def run_where(k: int, name: str, marks: str) -> str:
    return f'<div class="gw-where"><span class="gw-steps" aria-label="Shop {k} of 5">{marks}</span><span>{k} of 5 · {name}</span></div>'


def sched_run_ready() -> str:
    body = (tiles([("Entries", "40", "42"), ("Hours / week", "300", "312"), ("People", "7", "7")]) + week(CUTS_NOW, CUTS_AFTER))
    foot = btn("Skip this shop", "ghost", "skip") + '<span style="margin-left:auto"></span>' + btn("Write the week", "go", "right")
    return dialog("roster", "Write all 5 planned sites", run_where(2, "HART. Cuts · Midtown", '<i class="d"></i><i class="c"></i><i></i><i></i><i></i>'),
                  verdict("ok", "<b>The game takes the week</b>", "Sun 14:04"), body, foot)


def sched_run_done() -> str:
    body = (f'<p class="gw-said ok">HART. Cuts: 42 entries set in place of 40.</p>' + reread())
    foot = btn("Undo", "undo", "undo") + '<span style="margin-left:auto"></span>' + btn("Next shop · 3 of 5", "go", "right")
    return dialog("roster", "Write all 5 planned sites", run_where(2, "HART. Cuts · Midtown", '<i class="d"></i><i class="d"></i><i></i><i></i><i></i>'),
                  verdict("ok", "<b>Done in the game</b>", "Sun 14:04"), body, foot)


def sched_run_end() -> str:
    rows = [("HART. Fitness", "90 entries", True), ("HART. Cuts", "42 entries", True), ("HART. Coffee", "skipped", False),
            ("HART. Books", "36 entries", True), ("HART. Florist", "48 entries", True)]
    lst = "".join(f'<div><span class="m{"" if ok else " s"}">{svg("tick" if ok else "skip")}</span><span class="{"" if ok else "skip"}">{nm}</span><small>{what}</small></div>'
                  for nm, what, ok in rows)
    body = (f'<p class="gw-said ok">4 shops written, 1 skipped.</p><div class="gw-run">{lst}</div>'
            + call("info", "undo", "Undo holds the last shop written, <b>HART. Florist</b>: the game keeps one schedule change to take back.")
            + reread(done=True))
    foot = btn("Undo HART. Florist", "undo", "undo") + '<span style="margin-left:auto"></span>' + btn("Close", "go")
    return dialog("roster", "Write all 5 planned sites", run_where(5, "done", '<i class="d"></i><i class="d"></i><i class="s"></i><i class="d"></i><i class="d"></i>'),
                  verdict("ok", "<b>All 5 seen</b>", "Sun 14:06"), body, foot)


def schedule_all() -> str:
    return (top("Schedule · every planned site",
                "“Write all 5 planned sites” on the Staffing page steps through the shops one dialog at a time. The dots under the title are the run: "
                "green written, hollow skipped, the ringed one on screen. Each shop has its own dry run and its own warnings, as in the single-shop dialog.")
            + stage([col("01", "Shop 2 of 5 · ready", sched_run_ready()),
                     col("02", "Shop 2 of 5 · written", sched_run_done()),
                     col("03", "The end of the run", sched_run_end())]))


# --------------------------------------------------------------------------
# permission, asked in the game
# --------------------------------------------------------------------------
def scene() -> str:
    city = "".join(f'<i style="height:{h}px"></i>' for h in (26, 40, 18, 48, 30, 22, 44, 34, 20, 38, 28))
    return f"""<div class="gw-scene" aria-hidden="true">
<div class="gw-sbar"><i></i><i></i><i></i><span>BIG AMBITIONS</span></div>
<div class="city">{city}</div>
<div class="gw-pop"><b><i></i>Allow Big Copilot to change your game?</b><div class="bt"><span>Deny</span><span class="y">Allow</span></div></div>
{svg("cursor", "gw-cursor")}
</div>"""


def perm_wait() -> str:
    body = (scene() + '<p class="gw-lead">The game is asking you on its screen. <b>Switch to Big Ambitions and choose Allow.</b> '
            'It asks once for this browser.</p>')
    foot = hint("Nothing changes until you allow it and then apply.") + btn("Cancel", "ghost")
    return dialog("shirt", "Set uniforms", FITNESS, verdict("wait", "<b>Waiting for you in the game</b>", "0:12"), body, foot)


def perm_ok() -> str:
    body = (f'<div class="gw-ok"><span class="ic">{svg("tick")}</span><p><b>This browser may now change your game.</b> '
            'The game remembers it and will not ask again. Take it back in the Big Copilot Link options in the game.</p></div>'
            + '<div class="gw-skel" aria-hidden="true"><i></i><i></i></div>')
    foot = hint("Next: the game's answer for these uniforms.") + btn("Cancel", "ghost") + btn("Set uniforms", "go", "right", disabled=True)
    return dialog("shirt", "Set uniforms", FITNESS, verdict("ask", "<b>Allowed.</b> Asking the game what it would do…"), body, foot)


def perm_no() -> str:
    body = (f'<div class="gw-ok no"><span class="ic">{svg("close")}</span><p><b>The game said no.</b> Nothing was sent. '
            'The board changes the game only with your yes, and asks again when you try.</p></div>')
    foot = btn("Close", "ghost") + '<span style="margin-left:auto"></span>' + btn("Ask again", "go", "key")
    return dialog("shirt", "Set uniforms", FITNESS, verdict("no", "<b>Not allowed</b>", "Sun 14:02"), body, foot)


def perm_quiet() -> str:
    body = (f'<div class="gw-ok no"><span class="ic" style="background:color-mix(in srgb,var(--warn) 16%,transparent);color:var(--warn)">{svg("clock")}</span>'
            '<p><b>No answer from the game.</b> Nothing was sent. Is the game paused in a menu, or minimised? Its question waits there.</p></div>')
    foot = btn("Close", "ghost") + '<span style="margin-left:auto"></span>' + btn("Ask again", "go", "key")
    return dialog("shirt", "Set uniforms", FITNESS, verdict("wait", "<b>Still waiting</b>", "2:00"), body, foot)


def game_popup() -> str:
    return f"""<div class="gw-game">
<div class="t"><i></i>BIG COPILOT LINK</div>
<h3>Allow Big Copilot to change your game?</h3>
<p>The board at bigcopilot.com, in a browser on this computer, wants to change your game for you:</p>
<ul><li>{svg("shirt")}uniforms</li><li>{svg("crate")}import orders</li><li>{svg("roster")}schedules</li></ul>
<p>Each change shows here as it happens, and the board can undo its last one of each kind.</p>
<div class="bt"><button type="button">Deny</button><button type="button" class="y">Allow</button></div>
<small>Allowed browsers are listed in Settings → Mods → Big Copilot Link, where you can remove them.</small>
</div>"""


def permission() -> str:
    return (top("Permission · approve in the game",
                "Replaces the pairing code. The first write from a browser (its first dry run, which already needs permission) asks the game, "
                "and the board's dialog waits on the answer. Approved once, the browser is remembered; the write then carries on by itself.")
            + stage([col("01", "Board · waiting for the answer in game", perm_wait()),
                     col("02", "Game · the popup the mod shows (sketch)", f'<div class="gw-sketch">Drawn by the mod with the game\'s own popup; colours here are placeholders.</div>{game_popup()}'),
                     col("03", "Board · allowed, carries on", perm_ok()),
                     col("04", "Board · denied", perm_no()),
                     col("05", "Board · no answer yet (optional)", perm_quiet())], wrap=True))


# --------------------------------------------------------------------------
# the states every write shares
# --------------------------------------------------------------------------
def st_asking() -> str:
    body = '<div class="gw-skel" aria-hidden="true"><i></i><i></i><i></i></div>'
    foot = hint("Apply waits for the game's answer.") + btn("Cancel", "ghost") + btn("Set uniforms", "go", "right", disabled=True)
    return dialog("shirt", "Set uniforms", FITNESS, verdict("ask", "<b>Asking the game…</b>", "dry run"), body, foot)


def st_applying() -> str:
    body = roles(FITNESS_ROLES)
    foot = btn('<span class="gw-spin"></span>Applying', "go busy")
    d = dialog("shirt", "Set uniforms", FITNESS, verdict("ask", "<b>Setting uniforms in the game…</b>"), body,
               '<span style="margin-left:auto"></span>' + foot, cls="is-applying")
    return d


def st_moved() -> str:
    body = (f'<p class="gw-said">The game has moved on since this board was read. Nothing was changed.</p>'
            f'<div class="gw-drift"><div><span class="gw-lab">Board read</span><b>Sun 13:40</b></div><span class="ar"></span>'
            f'<div class="now"><span class="gw-lab">Game now</span><b>Sun 14:05</b></div></div>'
            f'<p class="gw-lead">Someone was hired or a uniform was set in the game meanwhile. Refresh, and the board plans again from what the game holds.</p>')
    foot = btn("Close", "ghost") + '<span style="margin-left:auto"></span>' + btn("Refresh the board", "go", "refresh")
    return dialog("shirt", "Set uniforms", FITNESS, verdict("moved", "<b>The game moved on</b>", "Sun 14:05"), body, foot)


def st_uncertain() -> str:
    body = (f'<p class="gw-said warn">The game did not answer, so this may or may not have been applied.</p>'
            f'<div class="gw-reread"><span>Reading the game again before anything else is offered</span><div class="gw-prog warn"><i></i></div></div>')
    foot = hint("No Undo: what it would restore is unknown.") + btn("Close", "ghost")
    return dialog("shirt", "Set uniforms", FITNESS, verdict("wait", "<b>No answer</b>", "Sun 14:02"), body, foot)


def st_uncertain_after() -> str:
    body = (f'<p class="gw-said warn">The game did not answer, so this may or may not have been applied.</p>'
            f'<div class="gw-ok"><span class="ic" style="background:var(--raised);color:var(--ink-2)">{svg("refresh")}</span>'
            f'<p><b>The board now shows what the game holds.</b> Check the shop there: the warning is gone if it went through.</p></div>')
    foot = btn("Close", "go")
    return dialog("shirt", "Set uniforms", FITNESS, verdict("ok", "<b>The board is up to date</b>", "Sun 14:03"), body,
                  '<span style="margin-left:auto"></span>' + foot)


def st_busy() -> str:
    body = (f'<p class="gw-said">The game stayed busy saving its state. Nothing was changed.</p>'
            f'<p class="gw-sub"><span class="gw-tries"><i></i><i></i><i></i></span>tried 3 times, a second apart</p>')
    foot = btn("Close", "ghost") + '<span style="margin-left:auto"></span>' + btn("Try again", "go", "refresh")
    return dialog("shirt", "Set uniforms", FITNESS, verdict("busy", "<b>The game is busy</b>", "Sun 14:02"), body, foot)


def st_cannot() -> str:
    body = (f'<div class="gw-ok"><span class="ic" style="background:var(--raised);color:var(--ink-2)">{svg("sofa")}</span>'
            f'<p><b>The game takes no changes while the interior designer is open.</b> Nothing was changed. Close it in the game, then try again.</p></div>')
    foot = btn("Close", "ghost") + '<span style="margin-left:auto"></span>' + btn("Try again", "go", "refresh")
    return dialog("shirt", "Set uniforms", FITNESS, verdict("busy", "<b>Not now</b>", "Sun 14:02"), body, foot)


def st_refused() -> str:
    body = f"""<div class="gw-no">
<span class="ic">{svg("lock")}</span>
<div class="rule">No uniform locker: the game sets uniforms only where one stands.</div>
<div class="gw-chips"><span class="gw-chip neg">HART. Fitness</span></div>
<div class="fix">{svg("right")}<span>Place a uniform locker in the shop, then try again.</span></div>
</div>""" + roles(FITNESS_ROLES)
    foot = hint("Nothing was changed.") + btn("Close", "ghost") + btn("Set 3 uniforms", "go", "right", disabled=True)
    return dialog("shirt", "Set uniforms", FITNESS, verdict("no", "<b>The game refuses this</b>", "Sun 14:02"), body, foot)


def st_toasts() -> str:
    t1 = (f'<div class="gw-toast" role="status"><span class="ic">{svg("tick")}</span>'
          f'<span class="t">Default is on 3 roles at HART. Fitness.<small>Undo stays until your next uniform change</small></span>'
          f'{btn("Undo", "undo", "undo")}<button type="button" class="gw-x" aria-label="Dismiss">{svg("close")}</button></div>')
    t2 = (f'<div class="gw-toast" role="status"><span class="ic">{svg("undo")}</span>'
          f'<span class="t">Undone: 3 roles back to no uniform.</span>'
          f'<button type="button" class="gw-x" aria-label="Dismiss">{svg("close")}</button></div>')
    t3 = (f'<div class="gw-toast" role="status"><span class="ic" style="background:var(--raised);color:var(--ink-2)">{svg("info")}</span>'
          f'<span class="t">Nothing left to undo: a later change replaced it, or the city was loaded again.</span>'
          f'<button type="button" class="gw-x" aria-label="Dismiss">{svg("close")}</button></div>')
    return (f'<div style="display:flex;flex-direction:column;gap:18px;align-items:flex-start">{t1}'
            f'<span class="gw-state"><span>After Undo:</span></span>{t2}'
            f'<span class="gw-state"><span>Undo refused, the game had moved on:</span></span>{t3}</div>')


def states() -> str:
    return (top("Shared states",
                "Every write goes through the same dialog, so these hold for uniforms, imports and the schedule alike. The wire under the title is the "
                "one signal to read: blue travelling asks, green agrees or is done, red refuses, amber waits or moved on, grey is busy.")
            + stage([col("01", "Asking · the dry run as the dialog opens", st_asking()),
                     col("02", "Applying", st_applying()),
                     col("03", "The game moved on (409 changed)", st_moved()),
                     col("04", "Uncertain · no answer, reading the game again", st_uncertain()),
                     col("05", "Uncertain · once the board has read the game", st_uncertain_after()),
                     col("06", "Busy · retried, still saving", st_busy()),
                     col("07", "Cannot write now (cannot_write)", st_cannot()),
                     col("08", "Refused · one rule, its object, the fix", st_refused()),
                     col("09", "The Undo strip, once the dialog is closed", st_toasts(), width=560)], wrap=True))


# --------------------------------------------------------------------------
# the write buttons where they sit on the board
# --------------------------------------------------------------------------
def gbtn(label: str, count: str = "", alt: bool = False, extra: str = "") -> str:
    cnt = f'<span class="n">{count}</span>' if count else ""
    return f'<button type="button" class="gw-btn{" alt" if alt else ""}{extra}"><span class="gw-mw"><i></i><b></b></span>{label}{cnt}</button>'


def gbtn_off(label: str, icon: str, count: str = "") -> str:
    cnt = f'<span class="n">{count}</span>' if count else ""
    return f'<button type="button" class="gw-btn off" aria-disabled="true">{svg(icon)}{label}{cnt}</button>'


def buttons() -> str:
    finding = f"""<div class="gw-frag">
<div class="sechead"><h2>Needs attention</h2></div>
<div class="finds">
<div class="find watch" style="grid-template-columns:22px 150px 1fr auto"><span class="mark"></span><span class="site"><span class="hood">GD</span>HART. Fitness</span>
<span class="what">No uniform set for Gym Trainer, Security Guard, Cleaning</span><span class="amt">3<small>roles</small></span>
<div class="gw-acts acts">{gbtn("Set Default uniforms")}{gbtn("Set for all 7 shops", alt=True)}</div></div>
<div class="find watch" style="grid-template-columns:22px 150px 1fr auto"><span class="mark"></span><span class="site"><span class="hood">MT</span>HART. Cuts</span>
<span class="what">No uniform set for Hair Stylist, Cleaning</span><span class="amt">2<small>roles</small></span>
<div class="gw-acts acts">{gbtn("Set Default uniforms")}</div></div>
</div></div>"""
    rows = [("Metal Band", "4,200", "3,800 in stock", "4,200", True), ("Fabric (Cheap)", "1,400", "900 a week", "1,200", True),
            ("Fabric (Expensive)", "800", "600 a week · stopped", "800", True), ("Molded Smartphone", "2,100", "2,100 a week", "2,100", False)]
    trs = "".join(f'<tr><td class="l">{m}</td><td>{u}</td><td>{g}</td><td><span class="gw-setto{" ch" if ch else ""}"><span class="dotc"></span><input value="{s}" aria-label="Set {m} to"></span></td></tr>'
                  for m, u, g, s, ch in rows)
    imports_frag = f"""<div class="gw-frag">
<div class="sechead"><h2>Weekly imports</h2><div class="aside">{gbtn("Apply changes in game", "3")}</div></div>
<div class="gw-depot" style="margin:0 0 8px"><span class="hood">IC</span>HART. DEPOT NORTH <span style="margin-left:auto">{gbtn("Apply in game", "2", alt=True)}</span></div>
<table><thead><tr><th>Material</th><th>Used / week</th><th>Set in game</th><th>Set to</th></tr></thead><tbody>{trs}</tbody></table>
</div>"""
    staff = f"""<div class="gw-frag">
<div class="sechead"><h2>Roster</h2><span class="quiet">HART. Fitness · demand plan</span></div>
<div class="gw-acts">{gbtn("Write this roster to the game")}{gbtn("Write all 5 planned sites", alt=True)}
<span class="gw-note">{svg("hire")}144 h a week stay empty until 4 people are added</span></div>
</div>"""
    st = [
        ("Rest", gbtn("Set Default uniforms")),
        ("Hover · a packet runs to the game", gbtn("Set Default uniforms", extra=" hov")),
        ("Clicked · asking the game", '<button type="button" class="gw-btn asking"><span class="gw-spin"></span>Asking the game…</button>'),
        ("Mod too old", gbtn_off("Set Default uniforms", "plug") + '<span class="gw-tipshow">Update the Big Copilot Link mod to set uniforms from here</span>'),
        ("Lock window", gbtn_off("Apply changes in game", "lock", "3") + '<span class="gw-tipshow">Orders for Monday\'s delivery closed Sunday 20:00; they reopen Monday 08:00</span>'),
    ]
    st2 = [
        ("Nobody here yet", gbtn_off("Write this roster to the game", "hire") + '<span class="gw-tipshow">Every entry in this plan waits on somebody who does not work here yet: add them first</span>'),
        ("Not allowed in game yet", gbtn("Set Default uniforms") + '<span class="gw-tipshow">The game asks you once, on its screen, when you first use this</span>'),
        ("Game not linked", '<span class="quiet">No button at all: outside linked mode the board keeps its checklists.</span>'),
    ]
    grid = "".join(f'<div><span class="gw-state"><span>{lab}</span></span>{b}</div>' for lab, b in st)
    grid2 = "".join(f'<div><span class="gw-state"><span>{lab}</span></span>{b}</div>' for lab, b in st2)
    return (top("The write buttons, where they sit",
                "A write button wears the wire: the board's green dot, a dashed line, the game. It says “this changes your game” before anything opens. "
                "Disabled buttons stay in place, dashed, with the reason on hover (drawn open here).")
            + f'<div class="gw-stage" style="flex-direction:column;gap:28px;align-items:stretch">'
            + f'<div style="display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:28px;align-items:start">{finding}{imports_frag}</div>'
            + staff
            + f'<div class="gw-frag"><div class="sechead"><h2>States</h2></div><div class="gw-sbtns">{grid}</div>'
            + f'<div class="gw-sbtns" style="margin-top:26px">{grid2}</div></div>'
            + '</div>')


# --------------------------------------------------------------------------
# phone: the dialog as a sheet
# --------------------------------------------------------------------------
def phone_board() -> str:
    rows = "".join('<div class="ph-row"><i></i><span></span><span class="s"></span></div>' for _ in range(9))
    return f'<div class="ph-board"><div class="ph-mast"><b>HART.<i></i></b></div>{rows}</div>'


def phone_uniforms() -> str:
    body = UNI_LEAD + presets(["Default"], "Default") + roles(FITNESS_ROLES)
    foot = hint("Nothing changes until you apply.") + btn("Cancel", "ghost") + btn("Set 3 uniforms", "go", "right")
    sheet = dialog("shirt", "Set uniforms", FITNESS, verdict("ok", "<b>The game will dress 3 roles</b>"), body, foot,
                   sheet=True, attrs='data-demo="uniforms"')
    return f'<div class="gw-phone">{phone_board()}<div class="ph-scrim"></div>{sheet}</div>'


def phone_imports() -> str:
    body = f'<div class="gw-fade" style="display:flex;flex-direction:column;gap:14px">{LEGEND}{imp_lines()}</div>'
    foot = hint("Written all together, or not at all.") + btn("Cancel", "ghost") + btn("Apply 3 changes", "go", "right")
    sheet = dialog("crate", "Weekly imports", where("", "2 depots · Industry City"),
                   verdict("ok", "<b>The game takes all 3</b>", "closes 20:00"), body, foot, sheet=True)
    return f'<div class="gw-phone">{phone_board()}<div class="ph-scrim"></div>{sheet}</div>'


def phone_undo() -> str:
    toast = (f'<div class="gw-toast" role="status"><span class="ic">{svg("tick")}</span>'
             f'<span class="t">Default is on 3 roles.<small>Until your next uniform change</small></span>'
             f'{btn("Undo", "undo", "undo")}<button type="button" class="gw-x" aria-label="Dismiss">{svg("close")}</button></div>')
    return f'<div class="gw-phone">{phone_board()}{toast}</div>'


# --------------------------------------------------------------------------
# behaviour every artboard carries; each part does nothing where its elements are absent
# --------------------------------------------------------------------------
WIRE = r"""
    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    document.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a && (a.getAttribute('href') || '#').charAt(0) === '#') e.preventDefault(); });

    // whatever is under the pointer reads out on the line kept for it
    $$('[data-readzone]').forEach(zone => {
      const out = $('.sp-readout', zone); if (!out) return; const rest = out.innerHTML;
      $$('[data-read]', zone).forEach(el => el.addEventListener('mouseenter', () => { out.innerHTML = el.dataset.read; }));
      zone.addEventListener('mouseleave', () => { out.innerHTML = rest; });
    });

    // a uniform picked: every card names it
    $$('.gw-preset[data-preset]').forEach(b => b.addEventListener('click', () => {
      const dlg = b.closest('.gw-dlg');
      $$('.gw-preset', dlg).forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      $$('.gw-pn', dlg).forEach(x => { x.textContent = b.dataset.preset; });
      $$('[data-read]', dlg).forEach(x => { x.dataset.read = x.dataset.read.replace(/<em>[^<]*<\/em>/, '<em>' + b.dataset.preset + '</em>'); });
    }));

    // apply, then undo: the dialog walks ready -> applying -> done and back
    const show = (dlg, st) => {
      dlg.classList.toggle('is-applying', st === 'applying'); dlg.classList.toggle('is-done', st === 'done');
      $$('[data-show]', dlg).forEach(el => el.classList.toggle('gw-off', el.dataset.show !== st));
    };
    $$('[data-demo] [data-apply]').forEach(b => b.addEventListener('click', () => {
      const dlg = b.closest('.gw-dlg'); show(dlg, 'applying'); setTimeout(() => show(dlg, 'done'), 1100);
    }));
    $$('[data-demo] [data-undo]').forEach(b => b.addEventListener('click', () => {
      const dlg = b.closest('.gw-dlg'); show(dlg, 'applying'); setTimeout(() => show(dlg, 'ready'), 900);
    }));

    // a refused shop left out: the rest can go
    $$('[data-leave]').forEach(b => b.addEventListener('click', () => {
      const box = b.closest('[data-leavebox]'); const row = b.closest('[data-leave-row]');
      row.classList.add('out'); b.remove();
      $$('[data-until-left]', box).forEach(el => el.classList.add('gw-off'));
      $$('[data-when-left]', box).forEach(el => el.classList.remove('gw-off'));
    }));

    // open 0 to 24: the switch
    $$('[data-toggle]').forEach(b => b.addEventListener('click', () => {
      const on = !b.classList.contains('on'); b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.closest('[data-toggle-box]').classList.toggle('off', !on);
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
<div class="board gw-board {{theme}}" style="width: __W__px; height: __H__px;">
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
<body><div class="board gw-board __THEME__" style="width: __W__px; min-height: 100px;">
__BODY__
</div>
<script>window.addEventListener('load', function () {__WIRE__});</script></body></html>
"""


def cols_w(k: int) -> int:
    return 64 * 2 + k * 480 + (k - 1) * 56


# file, title, builder, width, height (heights measured from the previews in both themes)
BOARDS = [
    ("Main.dc.html", "Uniforms · one shop", uniforms_main, cols_w(3), 740),
    ("UniformsAll.dc.html", "Uniforms · every shop", uniforms_all, cols_w(2), 940),
    ("Imports.dc.html", "Imports", imports, cols_w(3), 1180),
    ("Schedule.dc.html", "Schedule · one shop", schedule, cols_w(3), 1070),
    ("ScheduleAll.dc.html", "Schedule · every planned site", schedule_all, cols_w(3), 820),
    ("Permission.dc.html", "Permission · approve in game", permission, cols_w(3), 1020),
    ("States.dc.html", "Shared states", states, cols_w(3), 1960),
    ("Buttons.dc.html", "Write buttons on the board", buttons, 1680, 1120),
    ("PhoneUniforms.dc.html", "Phone · uniforms sheet", phone_uniforms, 390, 844),
    ("PhoneImports.dc.html", "Phone · imports sheet", phone_imports, 390, 844),
    ("PhoneUndo.dc.html", "Phone · Undo strip", phone_undo, 390, 844),
]

TIPS = {
    "Main.dc.html": "Play it: pick a uniform in 02, press Set 3 uniforms, then Undo. Hover a role card: the line under the cards says what happens to it. Dashed shirt = no uniform, gets one; grey shirt with a lock = has one, never touched.",
    "UniformsAll.dc.html": "Click “Leave it out” on the refused shop: the verdict turns green and Apply unlocks for the other six. Hover a row for its roles.",
    "Imports.dc.html": "Grey bar = what the contract holds now, green = what the write adds, red hatching past the cap = what the importers' caps leave uncovered. A tank is Smart Delivery (a stock level), a truck is a weekly amount.",
    "Schedule.dc.html": "Hover a day's bars for its entries and hours. In 02, flip the open-0-to-24 switch: the new hours in the strip go back to closed.",
    "ScheduleAll.dc.html": "The dots under the title are the run: green written, hollow skipped, the ringed one on screen.",
    "Permission.dc.html": "Replaces the pairing code. The board's dialog waits while the game asks; one Allow per browser.",
    "States.dc.html": "The wire under each title is the state at a glance: blue travelling asks, green agrees, red refuses, amber waits or moved on, grey is busy.",
    "Buttons.dc.html": "Hover a green button: a packet runs from the board's dot to the game.",
    "PhoneUniforms.dc.html": "At phone width the dialog is a bottom sheet; the role cards stay two to a row and the buttons go full width.",
    "PhoneImports.dc.html": "Imports cards stack; nothing scrolls sideways. The sheet scrolls inside itself.",
    "PhoneUndo.dc.html": "After closing: the Undo strip sits above the board's foot.",
}


def css(theme: str) -> str:
    base = BOARD_CSS.replace("@import url('" + FONTS + "');", "")
    base = base.replace("body{margin:0;background:#0d100f}", "body{margin:0;background:" + ("#dde0d7" if theme == "light" else "#080a09") + "}")
    return base + GW_CSS


def build(preview: bool = False) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    boards, order, notes = {}, [], {}
    # layout: the desktop artboards in one column, the phones in a row beside them
    x, y = 0, 0
    px = max(w for _, _, _, w, _ in BOARDS if w > 390) + 240
    py = 0
    for name, title, builder, w, h in BOARDS:
        body = builder()
        props = {"dark": {"editor": "boolean", "default": True, "section": "Theme"}, "$preview": {"width": w, "height": h}}
        page = (PAGE.replace("__TITLE__", "Write dialogs: " + title).replace("__FONTS__", FONTS.replace("&", "&amp;"))
                .replace("__CSS__", css("dark")).replace("__W__", str(w)).replace("__H__", str(h))
                .replace("__BODY__", body)
                .replace("__PROPS__", json.dumps(props, separators=(",", ":"), ensure_ascii=False).replace("'", "&#39;"))
                .replace("__LOGIC__", LOGIC))
        (ROOT / name).write_text(page, encoding="utf-8", newline="\n")
        if preview:
            out = HERE / "_preview"
            out.mkdir(exist_ok=True)
            for theme in ("", "light"):
                (out / f"{name.split('.')[0]}{'-light' if theme else ''}.html").write_text(
                    PREVIEW.replace("__TITLE__", title).replace("__FONTS__", FONTS.replace("&", "&amp;")).replace("__CSS__", css(theme or "dark"))
                    .replace("__THEME__", theme).replace("__W__", str(w)).replace("__BODY__", body).replace("__WIRE__", WIRE),
                    encoding="utf-8", newline="\n")
        if w == 390:
            bx, by = px, py
            px += 390 + 80
        else:
            bx, by = x, y
            y += h + 360
        boards[name] = {"x": bx, "y": by, "w": w, "h": h, "title": title, "is_interactive": True}
        order.append(name)
        notes["try-" + name.split(".")[0].lower()] = {"x": bx, "y": by - 250, "w": 560 if w > 390 else 390, "maxH": 190, "text": TIPS[name]}
    index = {"v": 3, "createdOnFiles": {"v": 1, "at": CREATED_AT}, "title": "Big Copilot Write Dialogs", "launch": {"view": "canvas"},
             "pages": [], "boards": boards, "order": order, "notes": notes, "designSystems": []}
    (ROOT / "canvas.json").write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8", newline="\n")
    print("wrote", len(order), "artboards")


if __name__ == "__main__":
    build("--preview" in sys.argv)
