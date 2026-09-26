"""Staffing, Businesses, Expansion, the two references, the utilities and the no-save entry."""
from __future__ import annotations

import random

from kit import (ROUTE, app, btn, chip, cover, from_strip, gwbtn, hood, hours, hrow, ic, mw, state, top, sidebar)
import boards_overview as ov
from boards_supply import SUP_CSS

MORE_CSS = """
.mo-cols{display:grid;grid-template-columns:300px minmax(0,1fr);gap:28px;align-items:start;margin-top:20px}
.mo-list{display:flex;flex-direction:column;border-top:1px solid var(--rule)}
.mo-list .gh{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);padding:14px 0 7px;border-bottom:1px solid var(--rule-soft);display:flex;justify-content:space-between}
.mo-biz{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:2px 8px;align-items:center;padding:9px 8px 9px 4px;border-bottom:1px solid var(--rule-soft);border-radius:0 8px 8px 0;cursor:pointer}
.mo-biz b{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mo-biz small{grid-column:2/4;font:400 11px/1.3 "IBM Plex Mono",monospace;color:var(--ink-3)}
.mo-biz small.w{color:var(--warn)}
.mo-biz .c{font:500 10.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.mo-biz:hover{background:var(--surface)}
.mo-biz.on{background:var(--accent-soft);box-shadow:inset 3px 0 0 var(--accent)}
.mo-biz.off b{color:var(--ink-2)}
.mo-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.mo-head h2{font-size:21px;font-weight:700;letter-spacing:-.02em}
.mo-head .sub{font-size:12.5px;color:var(--ink-3)}
.mo-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:14px}
.mo-tile{padding:12px 14px;border-radius:10px;background:var(--surface);border:1px solid var(--rule-soft);display:flex;flex-direction:column;gap:4px}
.mo-tile .v{font:500 20px/1.1 "IBM Plex Mono",monospace}
.mo-tile .v s{font-size:14px;color:var(--ink-3);margin-right:6px}
.mo-tile small{font-size:11.5px;color:var(--ink-3)}
.mo-pre{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
.mo-pre > div{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;border:1px solid var(--rule);background:var(--surface);font-size:12.5px}
.mo-pre > div small{font:500 10.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.mo-grid{margin-top:16px;padding:14px 16px;border-radius:12px;background:var(--surface);border:1px solid var(--rule-soft)}
.mo-grow{display:grid;grid-template-columns:120px minmax(0,1fr);gap:12px;align-items:center;min-height:30px}
.mo-grow .l{font:500 11px/1.2 "IBM Plex Mono",monospace;color:var(--ink-2)}
.mo-grow .l small{display:block;font-size:10px;color:var(--ink-3)}
.mo-track{position:relative;height:26px;border-radius:6px;background:var(--ground)}
.mo-track b{position:absolute;top:3px;bottom:3px;border-radius:5px;background:var(--accent-soft);border:1px solid color-mix(in srgb,var(--accent) 55%,transparent);font:500 10.5px/18px "IBM Plex Mono",monospace;padding:0 7px;white-space:nowrap;overflow:hidden;color:var(--ink)}
.mo-track b.hire{border-style:dashed;background:transparent;color:var(--warn);border-color:color-mix(in srgb,var(--warn) 60%,transparent)}
.mo-track b.now{background:color-mix(in srgb,var(--ink) 7%,transparent);border-color:var(--rule);color:var(--ink-2)}
.mo-need{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:2px;height:26px;align-items:end}
.mo-need i{display:block;border-radius:2px 2px 0 0;background:var(--accent);opacity:.85}
.mo-need i.c{background:repeating-linear-gradient(135deg,var(--neg) 0 2px,transparent 2px 4px);opacity:1;box-shadow:inset 0 0 0 1px var(--neg)}
.mo-need i.s{background:transparent;box-shadow:inset 0 0 0 1.2px var(--accent)}
.mo-need i.z{background:transparent}
.mo-ax{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));font:500 9.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.mo-days{display:flex;gap:2px}
.mo-days button{border:0;background:none;padding:6px 10px;border-radius:6px;font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink-2);cursor:pointer}
.mo-days button.on{background:var(--ink);color:var(--ground)}
.mo-days button small{display:block;font-size:9px;color:var(--ink-3);margin-top:3px}
.mo-foot{display:flex;align-items:center;gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid var(--rule-soft)}
.mo-ring{width:28px;height:28px;border-radius:50%;border:3px solid var(--rule);flex:none}
.mo-sec{margin-top:30px}
.mo-sec > .nx-sechead h2{font-size:17px}
.mo-chart{height:220px;border-radius:12px;background:var(--surface);border:1px solid var(--rule-soft);padding:14px 16px;position:relative}
.mo-chart svg{width:100%;height:170px}
.mo-fin{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;border:1px solid var(--rule-soft);border-radius:12px;overflow:hidden}
.mo-fin > div{padding:14px 16px;background:var(--surface);display:flex;flex-direction:column;gap:5px}
.mo-fin > div + div{border-left:1px solid var(--rule-soft)}
.mo-fin .v{font:500 20px/1.1 "IBM Plex Mono",monospace}
.mo-fin small{font-size:11.5px;color:var(--ink-3);line-height:1.4}
.mo-views{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.mo-views a{display:flex;flex-direction:column;gap:4px;padding:12px 14px;border-radius:10px;border:1px solid var(--rule-soft);background:var(--surface)}
.mo-views a b{display:flex;align-items:center;gap:8px;font-size:13.5px}
.mo-views a small{font-size:12px;color:var(--ink-3)}
.mo-views a:hover{border-color:var(--ink-3)}
.mo-jumps{display:flex;gap:4px;margin-top:14px;padding:4px;border-radius:9px;border:1px solid var(--rule-soft);background:var(--surface);width:fit-content}
.mo-jumps a{padding:6px 10px;border-radius:6px;font-size:12.5px;color:var(--ink-2)}
.mo-jumps a.on{background:var(--raised);color:var(--ink)}
.mo-sat{display:flex;align-items:flex-end;gap:14px}
.mo-sat .big{font:500 40px/1 "IBM Plex Mono",monospace}
.mo-sat .big small{font-size:14px;color:var(--ink-3)}
.mo-eq{display:flex;align-items:flex-end;gap:6px;height:64px;position:relative}
.mo-eq i{width:12px;border-radius:3px 3px 0 0}
.mo-eq::after{content:"80";position:absolute;left:-2px;right:-2px;bottom:51px;border-top:1px dashed var(--ink-3);font:500 9px/1 "IBM Plex Mono",monospace;color:var(--ink-3);text-align:right;padding-top:2px}
.mo-lamps{display:flex;gap:8px;flex-wrap:wrap}
.mo-lamp{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;border:1.5px solid var(--rule)}
.mo-lamp .i{width:17px;height:17px}
.mo-lamp.lit{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 50%,transparent);color:var(--accent)}
.mo-lamp.miss{background:var(--neg-soft);border-color:color-mix(in srgb,var(--neg) 60%,transparent);color:var(--neg)}
.mo-lamp.never{border-style:dashed;color:var(--ink-3)}
.mo-heat{display:grid;grid-template-columns:36px repeat(24,minmax(0,1fr));gap:2px}
.mo-heat span{font:500 9.5px/14px "IBM Plex Mono",monospace;color:var(--ink-3)}
.mo-heat i{height:14px;border-radius:2px}
.mo-heat i.hr{box-shadow:inset 0 0 0 1.5px var(--neg)}
.mo-heat i.bcap{box-shadow:inset 0 0 0 1.5px var(--ink-3)}
.mo-crew{display:flex;flex-wrap:wrap;gap:6px}
.mo-crew span{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px 0 4px;border-radius:14px;background:var(--raised);border:1px solid var(--rule-soft);font-size:12px}
.mo-crew span small{font-size:10.5px;color:var(--ink-3)}
.mo-card{border:1px solid var(--rule-soft);border-radius:12px;background:var(--surface);padding:14px 16px}
.mo-card h3{font-size:14.5px;font-weight:600;display:flex;align-items:center;gap:8px;margin-bottom:10px}
.mo-card h3 .i{color:var(--ink-3)}
.mo-card h3 .aside{margin-left:auto;font-size:12px;font-weight:400}
.mo-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.mo-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.mo-bar{height:6px;border-radius:3px;background:var(--rule-soft);position:relative;overflow:hidden;min-width:80px}
.mo-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:var(--accent)}
.mo-bar i.w{background:var(--warn)}
.mo-bar.mark::after{content:"";position:absolute;top:-2px;bottom:-2px;left:80%;width:1.5px;background:var(--ink-3)}
.mo-ref{display:inline-flex;align-items:center;gap:5px;font:600 9.5px/1 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;padding:4px 6px;border-radius:4px}
.mo-ref.game{color:var(--ink-2);background:color-mix(in srgb,var(--ink) 8%,transparent)}
.mo-ref.save{color:var(--accent);background:var(--accent-soft)}
/* the finder: filters, map, ranked list, a building with its floor plan */
.fd{display:grid;grid-template-columns:264px minmax(0,1fr) 380px;gap:0;margin-top:16px;border:1px solid var(--rule-soft);border-radius:14px;overflow:hidden;background:var(--surface);height:720px}
.fd-f{padding:14px 16px;border-right:1px solid var(--rule-soft);display:flex;flex-direction:column;gap:11px;overflow:hidden}
.fd-f .row{display:flex;flex-direction:column;gap:6px}
.fd-f .chips{display:flex;flex-wrap:wrap;gap:4px}
.fd-c{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 9px;border-radius:6px;border:1px solid var(--rule);font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-2);background:none;cursor:pointer}
.fd-c.on{border-color:var(--accent);color:var(--ink);background:var(--accent-soft)}
.fd-c small{font-size:10px;color:var(--ink-3)}
.fd-in{display:flex;gap:6px}
.fd-in label{flex:1;display:flex;align-items:center;gap:6px;height:30px;border-radius:6px;border:1px solid var(--rule);padding:0 8px;font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.fd-in label b{margin-left:auto;color:var(--ink);font-weight:500}
.fd-sel{display:flex;align-items:center;justify-content:space-between;height:32px;border-radius:7px;border:1px solid var(--rule);padding:0 10px;font-size:12.5px}
.fd-m{position:relative;overflow:hidden;background:#101512}
.board.light .fd-m{background:#dfe3da}
.fd-m > svg{position:absolute;inset:0;width:100%;height:100%}
.fd-m .blk{fill:#1a211d;stroke:#232b26}
.board.light .fd-m .blk{fill:#eef0ea;stroke:#cfd4ca}
.fd-m .rd{stroke:#0b0f0d;stroke-width:9}
.board.light .fd-m .rd{stroke:#d3d8ce}
.fd-m .park{fill:#16301f}
.board.light .fd-m .park{fill:#cfe3d2}
.fd-m .hit{fill:var(--accent);opacity:.85}
.fd-m .hit.sel{stroke:var(--ink);stroke-width:3}
.fd-m .mine{fill:var(--info);opacity:.8}
.fd-m .lbl{font:600 10px "IBM Plex Mono",monospace;letter-spacing:.12em;fill:var(--ink-3)}
.fd-m .zoom{position:absolute;right:12px;bottom:12px;display:flex;flex-direction:column;gap:6px}
.fd-m .ctx{position:absolute;left:12px;top:12px;right:12px;display:flex;gap:6px;flex-wrap:wrap}
.fd-m .ctx span{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:14px;background:color-mix(in srgb,var(--ground) 88%,transparent);border:1px solid var(--rule);font-size:12px}
.fd-l{display:flex;flex-direction:column;border-left:1px solid var(--rule-soft);min-height:0}
.fd-lh{display:grid;grid-template-columns:22px minmax(0,1fr) 44px 44px 44px 58px;gap:8px;padding:10px 12px;border-bottom:1px solid var(--rule);font:500 9.5px/1.1 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}
.fd-r{display:grid;grid-template-columns:22px minmax(0,1fr) 44px 44px 44px 58px;gap:8px;align-items:center;padding:9px 12px;border-bottom:1px solid var(--rule-soft);font-size:12.5px}
.fd-r .n{font:500 11.5px/1 "IBM Plex Mono",monospace;text-align:right}
.fd-r .rk{font:600 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.fd-r b{font-weight:600;font-size:12.5px;display:block}
.fd-r small{font:400 10.5px/1.2 "IBM Plex Mono",monospace;color:var(--ink-3)}
.fd-r.on{background:var(--accent-soft);box-shadow:inset 3px 0 0 var(--accent)}
.fd-card{margin-top:auto;border-top:1px solid var(--rule);padding:14px;display:grid;grid-template-columns:150px minmax(0,1fr);gap:14px;background:var(--ground)}
.fd-card .facts{display:grid;grid-template-columns:auto auto;gap:4px 10px;font-size:12px;color:var(--ink-2);align-content:start}
.fd-card .facts b{font:500 12px/1.3 "IBM Plex Mono",monospace;color:var(--ink);text-align:right}
.plan{background:var(--surface);border:1px solid var(--rule-soft);border-radius:8px;padding:6px}
.plan svg{width:100%;height:auto}
.plan .fl{fill:color-mix(in srgb,var(--accent) 10%,var(--surface))}
.plan .wl{fill:none;stroke:var(--ink);stroke-width:3}
.plan .pt{fill:none;stroke:var(--ink-2);stroke-width:1.5}
.plan .bay{fill:var(--ground)}
.plan .dr{stroke:var(--accent);stroke-width:4}
/* demand grid */
.dm{display:grid;grid-template-columns:170px repeat(7,minmax(0,1fr));gap:4px;align-items:stretch}
.dm .hd{font:500 9.5px/1.2 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);text-align:center;padding:6px 0}
.dm .ty{display:flex;flex-direction:column;justify-content:center;font-size:13px;font-weight:600}
.dm .ty small{font-size:11px;font-weight:400;color:var(--ink-3)}
.dm .cell{display:grid;place-items:center;height:42px;border-radius:6px;font:500 13px/1 "IBM Plex Mono",monospace;position:relative;cursor:pointer;border:1px solid transparent}
.dm .cell.best{border-color:var(--accent)}
.dm .cell .mine{position:absolute;right:5px;bottom:4px;width:6px;height:6px;border-radius:50%;background:var(--info)}
.mv{display:flex;flex-wrap:wrap;gap:6px}
.mv a{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 11px;border-radius:8px;border:1px solid var(--rule);font-size:12.5px;color:var(--ink-2);background:var(--surface)}
.mv a b{color:var(--ink);font-weight:600}
.mv a .i{width:14px;height:14px}
/* goods flow */
.gfl{position:relative;height:520px;border-radius:12px;background:var(--surface);border:1px solid var(--rule-soft);overflow:hidden}
.gfl > svg{position:absolute;inset:0;width:100%;height:100%}
.gfl .col{font:500 9.5px "IBM Plex Mono",monospace;letter-spacing:.14em;fill:var(--ink-3)}
.gfl .pipe{fill:none;stroke:var(--ink-3);stroke-opacity:.45;stroke-linecap:round}
.gfl .pipe.wk{stroke-dasharray:6 6}
.gfl .pipe.lit{stroke:var(--accent);stroke-opacity:1}
.gfl .pipe.warnp{stroke:var(--warn);stroke-opacity:.95}
.gfl .pipe.dim{stroke-opacity:.12}
.gfl .node rect{fill:var(--ground);stroke:var(--rule)}
.gfl .node.sel rect{stroke:var(--accent);stroke-width:2}
.gfl .node.dim{opacity:.35}
.gfl .node text{font:600 11.5px Archivo,sans-serif;fill:var(--ink)}
.gfl .node text.s{font:400 10px "IBM Plex Mono",monospace;fill:var(--ink-3)}
.gfl .node circle.w{fill:var(--warn)}.gfl .node circle.b{fill:var(--neg)}
/* landing */
.ld{display:grid;grid-template-columns:minmax(0,1fr) 520px;gap:56px;padding:56px 72px;align-items:start}
.ld h1{font-size:44px;font-weight:800;letter-spacing:-.045em;line-height:1.05}
.ld .lede{font-size:16px;color:var(--ink-2);margin-top:14px;max-width:560px;line-height:1.55}
.ld-drop{border:1.5px dashed var(--rule);border-radius:16px;padding:26px;display:flex;flex-direction:column;gap:14px;background:var(--surface)}
.ld-src{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:12px;align-items:center;padding:14px;border-radius:12px;border:1px solid var(--rule-soft);background:var(--ground)}
.ld-src .ic{width:40px;height:40px;border-radius:10px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent)}
.ld-src b{font-size:14.5px}
.ld-src small{display:block;font-size:12px;color:var(--ink-3);margin-top:2px}
.ld-path{display:flex;align-items:center;gap:8px;font:400 11.5px/1.4 "IBM Plex Mono",monospace;color:var(--ink-2);padding:10px 12px;border-radius:8px;background:var(--ground);border:1px solid var(--rule-soft)}
.ld-demo{margin-top:30px;border-top:1px solid var(--rule);padding-top:18px;display:flex;flex-direction:column;gap:10px}
.ld-demo .row{display:grid;grid-template-columns:14px minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--rule-soft);font-size:13.5px}
.ld-demo .row i{width:8px;height:8px;border-radius:50%}
/* preferences */
.pf{display:grid;grid-template-columns:220px minmax(0,1fr);gap:40px;padding:22px 0;border-bottom:1px solid var(--rule-soft)}
.pf h3{font-size:14.5px;font-weight:600}
.pf p.d{font-size:12.5px;color:var(--ink-3);margin-top:4px;line-height:1.45}
.pf .ctl{display:flex;flex-direction:column;gap:10px}
.pf .ln{display:flex;align-items:center;gap:12px;font-size:13px}
.pf .ln .quiet{margin-left:auto}
.nx-sw{position:relative;width:30px;height:17px;border-radius:9px;background:var(--rule);flex:none;border:0;padding:0;cursor:pointer}
.nx-sw::after{content:"";position:absolute;left:2px;top:2px;width:13px;height:13px;border-radius:50%;background:var(--ink-2)}
.nx-sw.on{background:var(--accent)}.nx-sw.on::after{transform:translateX(13px);background:var(--on-accent)}
.ret{border:1.5px dashed color-mix(in srgb,var(--info) 50%,var(--rule));border-radius:12px;padding:16px;display:grid;grid-template-columns:120px minmax(0,1fr);gap:16px;opacity:.9}
.ret .shot{height:84px;border-radius:8px;border:1px dashed var(--rule);display:grid;place-items:center;color:var(--ink-3);font:500 10px/1.3 "IBM Plex Mono",monospace;text-align:center;padding:6px}
.ret dl{display:grid;grid-template-columns:110px minmax(0,1fr);gap:6px 12px;font-size:12.5px;margin:0}
.ret dt{font:500 10px/1.6 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}
.ret dd{margin:0;color:var(--ink-3)}
"""


def crumbs(area: str, view: str, more: list | None = None):
    c = [(area.capitalize() if area != "supply" else "Supply", ROUTE[area]), (view, "")]
    if more:
        c = [(area.capitalize(), ROUTE[area]), (view, ROUTE[f"{area}/{more[0]}"]), (more[1], "")]
    return c


# --------------------------------------------------------------------------
# Staffing › Schedules
# --------------------------------------------------------------------------
def biz_list(sel: str = "pp") -> str:
    shops = [("pp", "MH", "Pepper &amp; Pine Florist", "Plan differs · 21 → 17 entries · hire 1", "w", "2"),
             ("vl", "HK", "Vale Liquor", "Staff demand open · weekends", "w", ""),
             ("mm", "MT", "Marlow Market", "Matches your schedule", "", ""),
             ("mh", "HK", "Marlow Market", "Matches your schedule", "", ""),
             ("cb", "HK", "Corner Brew Coffee", "Plan differs · 12 → 14 entries", "w", ""),
             ("hg", "LM", "Harbor Gifts", "New shop · nobody scheduled · no history yet", "w", ""),
             ("jb", "MT", "Juniper Books", "Matches your schedule", "", "")]
    rows = "".join(f'<a class="mo-biz{" on" if k == sel else ""}" href="#">{hood(h)}<b>{n}</b><span class="c">{c}</span><small class="{w}">{s}</small></a>' for k, h, n, s, w, c in shops)
    return f"""
<nav class="mo-list" aria-label="Businesses with schedules">
  <div class="gh"><span>Shops · schedules</span><span>11</span></div>{rows}
  <a class="mo-biz" href="#" style="opacity:.8"><span></span><b style="font-weight:500;color:var(--ink-3)">4 more shops</b><span class="c">{ic("chevd", style="width:13px;height:13px")}</span></a>
  <div class="gh"><span>Offices</span><span>1</span></div>
  <div class="mo-biz off">{hood("MT")}<b>Marlow HQ</b><span class="c"></span><small>Staff and desks shown; shop schedules do not apply here</small></div>
  <div class="gh"><span>Factories</span><span>2</span></div>
  <a class="mo-biz" href="{ROUTE["supply/production"]}">{hood("IC")}<b>Canal Brewery</b><span class="c">{ic("go", style="width:13px;height:13px")}</span><small>Factory staffing › Supply › Production</small></a>
  <a class="mo-biz" href="{ROUTE["supply/production"]}">{hood("IC")}<b>Stitch Yard</b><span class="c">{ic("go", style="width:13px;height:13px")}</span><small>Factory staffing › Supply › Production</small></a>
</nav>"""


def need_strip(vals, kinds) -> str:
    return '<div class="mo-need">' + "".join(
        f'<i class="{k}" style="height:{max(0, v) / 4 * 100:.0f}%"></i>' for v, k in zip(vals, kinds)) + "</div>"


def schedules() -> str:
    open_h = range(8, 22)
    need = [0] * 8 + [1, 1, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 2, 1] + [0, 0]
    kinds = ["z"] * 8 + ["", "", "", "", "s", "", "", "", "", "c", "c", "", "", ""] + ["z", "z"]
    ax = "".join(f"<span>{h if h % 3 == 0 else ''}</span>" for h in range(24))

    def track(bars):
        return '<div class="mo-track">' + "".join(
            f'<b class="{c}" style="left:{a / 24 * 100:.2f}%;width:{(b - a) / 24 * 100:.2f}%">{a:02d}–{b:02d} · {n}</b>' for a, b, n, c in bars) + "</div>"
    cvals = [0]*8 + [5, 9, 12, 14, 18, 17, 13, 12, 14, 20, 20, 19, 11, 6] + [0, 0]
    cust = "".join(f'<i class="{"hr" if v >= 19 else ""}" style="background:color-mix(in srgb,var(--accent) {int(v / 20 * 85)}%,var(--rule-soft))" title="{h}:00 · {v} customers"></i>' for h, v in enumerate(cvals))
    body = f"""
<div class="mo-cols">
  {biz_list()}
  <div>
    <div class="mo-head">{hood("MH")}<h2>Pepper &amp; Pine Florist</h2><span class="sub">Florist · 14 Park Ave · Murray Hill · open 08–22 daily</span>
      <a class="link" href="BusinessDetail.dc.html" style="margin-left:auto">Business page</a></div>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px">
      <div class="seg" data-seg="mode"><button class="on" type="button">Demand plan</button><button type="button">Full cover 24/7</button></div>
      <span class="why" title="Full cover opens 0–24 for a week to measure demand the building currently turns away">?</span>
      <div class="seg" data-seg="np" style="margin-left:auto"><button type="button">now</button><button class="on" type="button">plan</button></div>
      <div class="mo-days" role="tablist"><button class="on" type="button">MON</button><button type="button">TUE<small>= Mon</small></button><button type="button">WED<small>= Mon</small></button><button type="button">THU<small>= Mon</small></button><button type="button">FRI</button><button type="button">SAT</button><button type="button">SUN</button></div>
    </div>
    <div class="mo-tiles">
      <div class="mo-tile"><span class="lab">Hours a week</span><span class="v"><s>196</s>147</span><small>21 → 17 entries</small></div>
      <div class="mo-tile"><span class="lab">People</span><span class="v">5 + 1</span><small>hire 1 for the Cash register</small></div>
      <div class="mo-tile"><span class="lab">Wages a week</span><span class="v"><s>$3.1k</s>$2.4k</span><small>at today's rates</small></div>
      <div class="mo-tile"><span class="lab">Evidence</span><span class="v">3 wk</span><small>measured weekdays; Fri–Sun peaks</small></div>
    </div>
    <div class="mo-pre" aria-label="Before this plan works">
      <div><button class="nx-tick" type="button" aria-label="Done">{ic("tick")}</button>Hire 1 person with Customer Service<small>for the Cash register</small></div>
      <div><button class="nx-tick on" type="button" aria-label="Done">{ic("tick")}</button>Assign Cy Moss to this shop<small>already works for you</small></div>
    </div>
    <div class="mo-grid">
      <div class="mo-grow"><span class="l">Customers<small>Mondays, measured</small></span><div class="mo-heat" style="grid-template-columns:repeat(24,minmax(0,1fr))">{cust}</div></div>
      <div class="mo-grow"><span class="l">Need<small>stations an hour</small></span>{need_strip(need, kinds)}</div>
      <div class="mo-grow"><span class="l"></span><div class="mo-ax">{ax}</div></div>
      <div class="mo-grow"><span class="l">Cash register 1<small>Customer Service</small></span>{track([(8, 15, "Ben Ode", ""), (15, 22, "Cy Moss", "")])}</div>
      <div class="mo-grow"><span class="l">Cash register 2<small>Customer Service</small></span>{track([(11, 19, "hire", "hire"), (19, 22, "Ana Silva", "")])}</div>
      <div class="mo-grow"><span class="l">Cleaning station<small>Cleaning</small></span>{track([(8, 15, "Lea Kim", ""), (15, 22, "Tom Vu", "")])}</div>
      <div class="mo-grow"><span class="l" style="color:var(--ink-3)">now, for contrast</span>{track([(8, 20, "Ben Ode", "now"), (20, 22, "", "now")])}</div>
      <div class="sp-legend" style="margin-top:10px;display:flex;gap:16px;font-size:11.5px;color:var(--ink-2);flex-wrap:wrap">
        <span><i style="display:inline-block;width:12px;height:10px;background:var(--accent);border-radius:2px;margin-right:6px"></i>measured</span>
        <span><i style="display:inline-block;width:12px;height:10px;box-shadow:inset 0 0 0 1px var(--neg);background:repeating-linear-gradient(135deg,var(--neg) 0 2px,transparent 2px 4px);border-radius:2px;margin-right:6px"></i>at the ceiling 17–19: real demand is above it</span>
        <span><i style="display:inline-block;width:12px;height:10px;box-shadow:inset 0 0 0 1.2px var(--accent);border-radius:2px;margin-right:6px"></i>scaled from a better-measured day</span>
        <span>dashed bar · a person to hire</span></div>
    </div>
    <div class="mo-foot">
      <span class="mo-ring" style="border-top-color:var(--accent)"></span><span class="mono" style="font-size:12.5px">3 of 17 entries typed</span>
      <span style="margin-left:auto;display:flex;gap:8px;align-items:center">{btn("Copy the week", "", icon="copy")}{gwbtn("Write the week", "", "#")}</span>
    </div>
    <p class="quiet" style="margin-top:8px">Writes this shop's week of scheduled hours; undo lasts until your next schedule write.</p>
  </div>
</div>"""
    return app("staffing", "schedules", "Schedules", body, [("Staffing", ROUTE["staffing"]), ("Schedules", "")])


# --------------------------------------------------------------------------
# Staffing › Staff needs, Payroll
# --------------------------------------------------------------------------
def staff_needs() -> str:
    body = f"""
{from_strip("Ana Reyes at Vale Liquor, staff demands", "3 of 4 critical")}
<div class="mo-2" style="margin-top:20px">
  <div class="mo-card" style="border-color:color-mix(in srgb,var(--neg) 40%,var(--rule-soft))">
    <h3>{ic("warn")}Unmet demands<span class="aside quiet">3 people · 2 businesses</span></h3>
    <table class="nx-t"><thead><tr><th>Person</th><th>Wants</th><th>Now</th><th>Fix, where</th></tr></thead><tbody>
      <tr class="sel"><td><b>Ana Reyes</b><small>Vale Liquor · Customer Service</small></td><td>Free weekends</td><td>{chip("bad", "may quit")}<small>unhappy 4 days</small></td><td><a class="link" href="{ROUTE["staffing/schedules"]}">Move her Sat/Sun hours</a><small>Vale Liquor's schedule</small></td></tr>
      <tr><td><b>Rui Paz</b><small>Canal Brewery · factory worker</small></td><td>No night shifts</td><td>{chip("warn", "unhappy")}</td><td><a class="link" href="{ROUTE["supply/production"]}">Factory staffing plan</a><small>Supply › Production</small></td></tr>
      <tr><td><b>Ida Lund</b><small>Marlow HQ · office</small></td><td>A better desk</td><td>{chip("warn", "unhappy")}</td><td><span class="quiet">Buy a desk in game</span></td></tr>
    </tbody></table>
    <div class="nx-omit"><div>{ic("businesses")}<span><b>Company-wide:</b> 2 people want health insurance · set by you in the company's benefits, not at a shop</span></div></div>
  </div>
  <div class="mo-card">
    <h3>{ic("users")}Whom to hire<span class="aside quiet">assign before you hire</span></h3>
    <table class="nx-t"><thead><tr><th>Business</th><th>Role</th><th class="n">Assign</th><th class="n">Hire</th></tr></thead><tbody>
      <tr><td>{hood("MH")} Pepper &amp; Pine Florist</td><td>Customer Service</td><td class="n">1<small>Cy Moss</small></td><td class="n">1</td></tr>
      <tr><td>{hood("IC")} Canal Brewery</td><td>factory worker</td><td class="n">0</td><td class="n">7<small>Full production</small></td></tr>
      <tr><td>{hood("LM")} Harbor Gifts</td><td>Customer Service · Cleaning</td><td class="n">1<small>Lea Kim</small></td><td class="n">1</td></tr>
    </tbody></table>
    <p class="quiet" style="margin-top:10px">Assign people you already employ before hiring.</p>
  </div>
</div>
<div class="mo-sec"><div class="nx-sechead"><h2>Quit warnings</h2><span class="quiet">people unhappy long enough to leave</span></div>
  <div class="mo-crew"><span>{hood("HK")}Ana Reyes<small>Vale Liquor · 4 days</small></span></div></div>"""
    return app("staffing", "needs", "Staff needs", body, [("Staffing", ROUTE["staffing"]), ("Staff needs", "")])


def payroll() -> str:
    rows = [("Customer Service", "38", "$21.40", "$28,400", 82), ("Cleaning", "17", "$17.10", "$10,300", 88), ("factory worker", "14", "$19.30", "$13,200", 71),
            ("Security", "6", "$23.80", "$5,100", 90), ("office professionals", "12", "$34.00", "$19,800", 76), ("purchasing agent", "2", "$31.00", "$3,100", 93),
            ("logistics manager", "2", "$29.50", "$2,900", 91)]
    tr = "".join(f'<tr><td><b>{r}</b></td><td class="n">{p}</td><td class="n">{h}</td><td class="n">{w}</td><td><div style="display:flex;align-items:center;gap:10px"><div class="mo-bar mark" style="width:140px"><i class="{"w" if s < 80 else ""}" style="width:{s}%"></i></div><span class="mono" style="font-size:12px">{s}%</span></div></td><td><a class="link" href="#">Sites</a></td></tr>' for r, p, h, w, s in rows)
    body = f"""
<div class="mo-fin" style="margin-top:22px">
  <div><span class="lab">Wages booked last week</span><span class="v">$82,800</span><small>from the save's transactions</small></div>
  <div><span class="lab">At today's rates</span><span class="v">$84,100</span><small>96 people × their current hourly rate × scheduled hours</small></div>
  <div><span class="lab">Difference</span><span class="v warnc">+$1,300</span><small>raises since last week, mostly at Canal Brewery</small></div>
</div>
<div class="mo-sec"><table class="nx-t"><thead><tr><th>Role</th><th class="n">People</th><th class="n">Avg rate / h</th><th class="n">Booked / week</th><th>Satisfaction</th><th></th></tr></thead><tbody>{tr}</tbody></table>
</div>"""
    return app("staffing", "payroll", "Payroll", body, [("Staffing", ROUTE["staffing"]), ("Payroll", "")])


# --------------------------------------------------------------------------
# Businesses › Results, a business page, Products & prices, Standards, Milestones
# --------------------------------------------------------------------------
def chart() -> str:
    random.seed(7)
    bars, line = [], []
    for d in range(30):
        v = 2600 + 900 * ((d % 7) in (4, 5)) - 1800 * (d % 7 == 0) + random.randint(-600, 600)
        if d == 29:
            v = -1240
        bars.append(v)
    avg = [sum(bars[max(0, i - 6):i + 1]) / len(bars[max(0, i - 6):i + 1]) for i in range(30)]
    zero, sc = 110, 0.022
    rects = "".join(f'<rect x="{i * 33 + 6}" y="{zero - max(v, 0) * sc:.1f}" width="20" height="{abs(v) * sc:.1f}" rx="2" fill="{"var(--accent)" if v >= 0 else "var(--neg)"}" opacity="{.5 if v >= 0 else .8}"></rect>' for i, v in enumerate(bars))
    pl = " ".join(f"{i * 33 + 16},{zero - a * sc:.1f}" for i, a in enumerate(avg))
    return (f'<svg viewBox="0 0 1000 170" preserveAspectRatio="none" aria-label="Daily profit, last 30 days, with the 7-day average">'
            f'<line x1="0" x2="1000" y1="{zero}" y2="{zero}" stroke="var(--rule)"></line>{rects}<polyline points="{pl}" fill="none" stroke="var(--accent)" stroke-width="2"></polyline></svg>')


def results() -> str:
    chains = [("Marlow Market", "2 shops", "$9,840", "+4%", "$2,110", "21.4%"), ("Pepper &amp; Pine Florist", "1 shop", "$5,620", "+9%", "$1,480", "26.3%"),
              ("Vale Liquor", "1 shop", "$4,110", "-2%", "$610", "14.8%"), ("Corner Brew Coffee", "1 shop", "$3,020", "+22%", "$540", "17.9%"),
              ("Canal Brewery + Bridge Hub", "1 factory · 1 depot", "$11,200", "-6%", "-$2,030", "-18.1%"), ("Harbor Gifts", "1 shop · not trading", "$0", "—", "-$310", "—")]
    tr = "".join(f'<tr><td><b>{n}</b><small>{s}</small></td><td class="n">{r}</td><td class="n {"pos" if w.startswith("+") else ("neg" if w.startswith("-") else "")}">{w}</td><td class="n {"neg" if p.startswith("-") else "pos"}">{p}</td><td class="n">{m}</td></tr>' for n, s, r, w, p, m in chains)
    body = f"""
<div class="nx-sechead" style="margin-top:24px"><h2 class="nx-h2big">Company results</h2><span class="quiet">profit, costs and cash for Marlow Trading</span>
  <div class="aside"><div class="seg" data-seg="rng"><button class="on" type="button">30 days</button><button type="button">All</button><button type="button">By weekday</button></div></div></div>
<div class="mo-chart">{chart()}<div class="sp-legend" style="display:flex;gap:14px;font-size:12px;color:var(--ink-2)"><span>bars: net profit a day</span><span style="color:var(--accent)">line: 7-day average</span><span class="quiet">Day 83 dips: wages and rent are paid on Wednesdays</span></div></div>
<div class="mo-sec"><div class="nx-sechead"><h2>Company finances</h2><span class="quiet">cash is not profit</span></div>
<div class="mo-fin">
  <div><span class="lab">Cash on hand</span><span class="v">$212,400</span><small>+$9,800 this week; a truck bought on day 80 took $14,000 of cash but is not a cost</small></div>
  <div><span class="lab">Owed</span><span class="v">$120,000</span><small>2 loans · $1,640 interest a week, inside company costs</small></div>
  <div><span class="lab">History</span><span class="v">day 40 →</span><small>kept in this browser; earlier days were not recorded. Preferences › History</small></div>
</div></div>
<div class="mo-sec"><div class="nx-sechead"><h2>Business by business</h2><span class="quiet">last 7 days, by chain</span><div class="aside"><div class="seg"><button class="on" type="button">Profit &amp; loss</button><a href="{ROUTE["businesses/standards"]}">Satisfaction &amp; promotion</a></div></div></div>
<table class="nx-t"><thead><tr><th>Chain</th><th class="n">Revenue</th><th class="n">Week on week</th><th class="n">Profit</th><th class="n">Margin</th></tr></thead><tbody>{tr}
<tr><td class="quiet">Company costs outside sites · loan interest, head office, vehicles</td><td></td><td></td><td class="n neg">-$1,980</td><td></td></tr>
<tr><td><b>Company profit</b></td><td class="n">$33,790</td><td></td><td class="n pos">$420</td><td></td></tr></tbody></table>
<p class="quiet" style="margin-top:10px">Wages in detail: <a class="link" href="{ROUTE["staffing/payroll"]}">Staffing › Payroll</a></p></div>
"""
    return app("businesses", "results", "Results", body, [("Businesses", ROUTE["businesses"]), ("Results", "")])


def business_detail() -> str:
    random.seed(3)
    heat = ""
    for d, dn in enumerate(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]):
        heat += f"<span>{dn}</span>"
        for h in range(24):
            if h < 8 or h >= 22:
                heat += '<i style="background:var(--rule-soft)"></i>'
                continue
            v = min(1, (0.35 + 0.5 * (h in (12, 13, 17, 18, 19)) + 0.15 * (d >= 4)) * (0.8 + random.random() * .3))
            ring = " hr" if h in (17, 18) and d >= 3 else ""
            heat += f'<i class="{ring.strip()}" style="background:color-mix(in srgb,var(--accent) {int(v * 90)}%,var(--rule-soft))"></i>'
    body = f"""
<div style="display:flex;align-items:center;gap:14px;margin-top:22px">
  <span style="width:46px;height:46px;border-radius:50%;background:var(--accent);color:var(--on-accent);display:grid;place-items:center;font:700 13px 'IBM Plex Mono',monospace">MH</span>
  <div><div class="mo-head"><h2 style="font-size:26px">Pepper &amp; Pine Florist</h2><span class="chip line">3 / 11 by profit</span></div>
  <div class="sub quiet">Florist · 14 Park Ave · Murray Hill · opened day 12 · supplied by wholesale and Bridge Hub</div></div>
  <span style="margin-left:auto;display:flex;gap:8px">{btn("Staffing plan", "", ROUTE["staffing/schedules"], icon="staffing")}{btn("Delivery targets", "", ROUTE["supply/deliveries"], icon="supply")}{btn("Prices", "", "PricesShop.dc.html", icon="tag")}</span>
</div>
<div class="mo-jumps"><a class="on" href="#">Summary</a><a href="#">Results</a><a href="#">Standards</a><a href="#">Customers by hour</a><a href="#">People</a><a href="#">Products &amp; prices</a></div>
<div class="nx-band" style="margin-top:18px"><span class="lab watch">Needs attention here · 1</span></div>
{ov.crow(ov.WARN[8])}
<div class="mo-tiles" style="margin-top:18px">
  <div class="mo-tile"><span class="lab">Revenue yesterday</span><span class="v">$1,840</span><small>+6% on its weekday</small></div>
  <div class="mo-tile"><span class="lab">Customers</span><span class="v">196</span><small>$9.40 a visit</small></div>
  <div class="mo-tile"><span class="lab">Profit</span><span class="v pos">$690</span><small>37.5% margin</small></div>
  <div class="mo-tile"><span class="lab">Building capacity</span><span class="v">30 /h</span><small>the building's own limit; normal, not a finding</small></div>
</div>
<div class="mo-2" style="margin-top:20px">
  <div class="mo-card"><h3>{ic("star")}Satisfaction<span class="aside"><a class="link" href="{ROUTE["businesses/standards"]}">Compare shops</a></span></h3>
    <div class="mo-sat"><span class="big">86<small>%</small></span><div class="mo-eq"><i style="height:60px;background:var(--accent)"></i><i style="height:54px;background:var(--accent)"></i><i style="height:40px;background:var(--warn)"></i><i style="height:58px;background:var(--accent)"></i></div>
      <div class="mo-lamps"><span class="mo-lamp lit" title="Bathroom">{ic("door")}</span><span class="mo-lamp lit" title="Sink">{ic("sink")}</span><span class="mo-lamp lit" title="Music">{ic("music")}</span><span class="mo-lamp miss" title="Interior design 48 of 55">{ic("brush")}</span><span class="mo-lamp lit" title="Uniforms">{ic("shirt")}</span></div></div>
    <p class="quiet" style="margin-top:10px">Interior design 48 of the 55 florists here expect · uniforms set for both roles.</p></div>
  <div class="mo-card"><h3>{ic("megaphone")}Promotion</h3>
    <div style="display:flex;align-items:baseline;gap:8px"><span class="mono" style="font-size:28px">100</span><span class="quiet">/ 100 cap · foot traffic 72 + marketing 28</span></div>
    <div class="mo-bar" style="margin-top:10px;height:8px"><i style="width:100%"></i></div>
    <p class="quiet" style="margin-top:10px">No demand wave under this shop now. <a class="link" href="{ROUTE["expansion/demand"]}">Market changes</a></p></div>
</div>
<div class="mo-card" style="margin-top:16px"><h3>{ic("clock")}Customers by hour<span class="aside quiet">worst hour Sat 18:00 · 20 of 20 on the Cash register</span></h3>
  <div class="mo-heat">{heat}</div>
  <p class="quiet" style="margin-top:8px">Red rings: hours at the Cash register's ceiling. The building's own capacity (30 an hour) is not reached.</p></div>
<div class="mo-2" style="margin-top:16px">
  <div class="mo-card"><h3>{ic("users")}People<span class="aside quiet">5 · $512 a day</span></h3>
    <div class="mo-crew"><span>{hood("CS")}Ben Ode<small>Customer Service</small></span><span>{hood("CS")}Cy Moss<small>Customer Service</small></span><span>{hood("CS")}Ana Silva<small>Customer Service</small></span><span>{hood("CL")}Lea Kim<small>Cleaning</small></span><span>{hood("CL")}Tom Vu<small>Cleaning</small></span></div></div>
  <div class="mo-card"><h3>{ic("tag")}Products &amp; prices<span class="aside"><a class="link" href="PricesShop.dc.html">All prices here</a></span></h3>
    <table class="nx-t"><thead><tr><th>Product</th><th class="n">Your price</th><th class="n">Sells / day</th><th>Stock</th></tr></thead><tbody>
      <tr><td>Flowers (Cheap)</td><td class="n">$6.50</td><td class="n">118</td><td>{chip("ok", "covered")}</td></tr>
      <tr><td>Flowers (Luxury)</td><td class="n">$24.00</td><td class="n">41</td><td>{chip("warn", "tight")}</td></tr></tbody></table></div>
</div>"""
    return app("businesses", "results", "Pepper &amp; Pine Florist", body, [("Businesses", ROUTE["businesses"]), ("Results", ROUTE["businesses/results"]), ("Pepper &amp; Pine Florist", "")])


def prices(shop: bool = False) -> str:
    shops = [("MH", "Pepper &amp; Pine Florist"), ("MT", "Marlow Market"), ("HK", "Marlow Market"), ("HK", "Vale Liquor"), ("HK", "Corner Brew Coffee"), ("MT", "Juniper Books"), ("LM", "Harbor Gifts")]
    picks = "".join(f'<a class="nx-pick{" sel" if shop and k == 0 else ""}" href="{"PricesShop.dc.html" if k == 0 else "#"}">{hood(h)}{n}</a>' for k, (h, n) in enumerate(shops))
    if shop:
        tbl = f"""
<div class="nx-sechead" style="margin-top:22px"><h2>Prices at Pepper &amp; Pine Florist</h2><span class="mo-ref save">your save</span><span class="mo-ref game">market reconstruction</span>
  <div class="aside"><a class="link" href="{ROUTE["guide"]}">Florist guide › Prices in your save</a></div></div>
<table class="nx-t"><thead><tr><th>Product</th><th class="n">Your price</th><th class="n">Lowest market price · Murray Hill</th><th class="n">Average sold price</th><th class="n">Sells / day</th><th></th></tr></thead><tbody>
  <tr class="sel"><td><b>Flowers (Cheap)</b></td><td class="n">$6.50</td><td class="n">$5.90<small>2 sellers</small></td><td class="n">$6.50</td><td class="n">118</td><td>{chip("dim", "above the lowest")}</td></tr>
  <tr><td><b>Flowers (Luxury)</b></td><td class="n">$24.00</td><td class="n">$26.50<small>1 seller</small></td><td class="n">$24.00</td><td class="n">41</td><td>{chip("dim", "below the lowest")}</td></tr>
  <tr><td><b>Vase</b></td><td class="n">Not set</td><td class="n">$14.00</td><td class="n">—</td><td class="n">0</td><td>{chip("warn", "no price")}</td></tr>
  <tr><td><b>Plant (Potted)</b></td><td class="n">$18.00</td><td class="n">Unavailable<small>supplier event active</small></td><td class="n">$18.00</td><td class="n">22</td><td></td></tr>
</tbody></table>
<p class="quiet" style="margin-top:10px">Comparisons, not recommended prices. The lowest market price is withheld during a supplier event.</p>"""
    else:
        top10 = [("Beer", "1,100", "$4.20", "2"), ("Flowers (Cheap)", "118", "$6.50", "1"), ("Coffee", "640", "$3.10", "1"), ("Water", "240", "$1.20", "2"), ("Wine (Cheap)", "210", "$9.80", "1"), ("Gift (Cheap)", "86", "$8.00", "1")]
        tbl = f"""
<div class="nx-sechead" style="margin-top:22px"><h2>Sales across the company</h2><span class="quiet">last 7 days · top 6 of 46</span><div class="aside"><div class="seg"><button class="on" type="button">Top</button><button type="button">All 46</button></div></div></div>
<table class="nx-t"><thead><tr><th>Product</th><th class="n">Sells / day</th><th class="n">Average sold price</th><th class="n">Sold at</th><th>Busiest day</th></tr></thead><tbody>
{"".join(f'<tr><td><b>{p}</b></td><td class="n">{s}</td><td class="n">{a}</td><td class="n">{n} shops</td><td class="mono" style="font-size:12px">Sat</td></tr>' for p, s, a, n in top10)}
</tbody></table>
"""
    body = f"""

<div class="nx-scope" style="flex-wrap:wrap"><span class="lab">Prices at</span>{picks}</div>
{tbl}"""
    return app("businesses", "products", "Products &amp; prices", body, [("Businesses", ROUTE["businesses"]), ("Products &amp; prices", "")])


def standards() -> str:
    def lamps(vals):
        ico = ["door", "door", "sink", "music", "brush"]
        out = ""
        for k, v in enumerate(vals):
            c = {"y": "lit", "n": "miss", "-": "never"}[v]
            out += f'<span class="mo-lamp {c}" style="width:28px;height:28px">{ic(ico[k], style="width:14px;height:14px")}</span>'
        return f'<div class="mo-lamps" style="gap:5px">{out}</div>'
    rows = [("MT", "Juniper Books", 74, 90, "ynnnn", "set", "4 fixes"), ("HK", "Corner Brew Coffee", 71, 100, "yyynn", "set", ""), ("HK", "Vale Liquor", 83, 95, "yyyyy", "missing", ""),
            ("HK", "Marlow Market", 88, 80, "yyyyy", "set", ""), ("MH", "Pepper &amp; Pine Florist", 86, 100, "yyyyn", "set", ""), ("LM", "Harbor Gifts", 0, 0, "-----", "—", "not scored yet")]
    tr = ""
    for h, n, s, p, l, u, note in rows:
        sat = (f'<div style="display:flex;align-items:center;gap:8px"><div class="mo-bar mark" style="width:110px"><i class="{"w" if s < 80 else ""}" style="width:{s}%"></i></div><span class="mono" style="font-size:12px">{s}%</span></div>' if s else '<span class="quiet">not scored yet</span>')
        uni = gwbtn("Set missing uniforms", "sm", "#") if u == "missing" else (f'<span class="quiet">{u}</span>')
        tr += f'<tr class="{"sel" if note == "4 fixes" else ""}"><td>{hood(h)} <b>{n}</b>{f"<small>{note}</small>" if note else ""}</td><td>{sat}</td><td class="n">{str(p) + "%" if p else "—"}</td><td>{lamps(l)}</td><td>{uni}</td></tr>'
    body = f"""

<div class="sp-legend" style="display:flex;gap:16px;margin-top:14px;font-size:12px;color:var(--ink-2);flex-wrap:wrap">
  <span><span class="mo-lamp lit" style="width:20px;height:20px;display:inline-grid"></span> found</span><span><span class="mo-lamp miss" style="width:20px;height:20px;display:inline-grid"></span> missing</span><span><span class="mo-lamp never" style="width:20px;height:20px;display:inline-grid"></span> not scored yet</span>
  <span>Amenities: bathroom · privacy · sink · music · interior design</span></div>
<table class="nx-t" style="margin-top:14px"><thead><tr><th>Shop</th><th>Satisfaction · line at 80%</th><th class="n">Promotion</th><th>Amenities</th><th>Uniforms</th></tr></thead><tbody>{tr}</tbody></table>
"""
    return app("businesses", "standards", "Standards", body, [("Businesses", ROUTE["businesses"]), ("Standards", "")])


def milestones() -> str:
    goals = [("Run 5 business types", 5, 5), ("Own 3 buildings", 1, 3), ("Reach $2M net worth", 1.84, 2), ("Employ 100 people", 96, 100)]
    g = "".join(f'<div style="display:grid;grid-template-columns:minmax(0,1fr) 200px 70px;gap:14px;align-items:center;padding:10px 0;border-bottom:1px solid var(--rule-soft)"><span>{n}</span><div class="mo-bar" style="height:8px"><i style="width:{a / b * 100:.0f}%"></i></div><span class="mono" style="font-size:12px;text-align:right">{a:g} / {b:g}</span></div>' for n, a, b in goals)
    body = f"""

<div class="mo-2" style="margin-top:18px">
  <div class="mo-card"><h3>{ic("trophy")}Career goals</h3>{g}</div>
  <div class="mo-card"><h3>{ic("businesses")}Business types run</h3><div class="mo-crew">{"".join(f"<span>{t}</span>" for t in ["Grocery store", "Florist", "Liquor store", "Coffee shop", "Gift shop", "Bookstore", "Factory", "Warehouse", "Office"])}</div>
    <h3 style="margin-top:16px">{ic("users")}Rivals taken over</h3><p class="quiet">1 · Hudson &amp; Bell's florist, day 61</p>
    <h3 style="margin-top:16px">{ic("guide")}Diplomas</h3><div class="mo-crew"><span>Business Administration</span><span>Logistics</span></div></div>
</div>
<div class="mo-card" style="margin-top:16px"><h3>{ic("coin")}Career totals</h3><div class="mo-3">
  <div><span class="lab">Goods sold</span><div class="mono" style="font-size:22px;margin-top:4px">412,880</div></div>
  <div><span class="lab">Taxes paid</span><div class="mono" style="font-size:22px;margin-top:4px">$38,420</div><a class="link" href="{ROUTE["businesses/results"]}">in company costs</a></div>
  <div><span class="lab">Buildings owned</span><div class="mono" style="font-size:22px;margin-top:4px">1</div><a class="link" href="{ROUTE["map"]}">on the City map</a></div></div></div>"""
    return app("businesses", "milestones", "Milestones", body, [("Businesses", ROUTE["businesses"]), ("Milestones", "")])


# --------------------------------------------------------------------------
# Expansion › Demand, Find a location, Plan a factory
# --------------------------------------------------------------------------
HOODS = ["HK", "MT", "MH", "GD", "LM", "IC", "HA"]


def demand() -> str:
    types = [("Florist", "you run 1", [42, 68, 58, 31, 63, 12, 40], {2}), ("Liquor store", "you run 1", [51, 44, 38, 29, 47, 22, 35], {0}),
             ("Bookstore", "you run 1", [28, 55, 41, 24, 33, 10, 30], {1}), ("Gift shop", "you run 1", [36, 49, 31, 45, 52, 18, 58], {4}),
             ("Bakery", "not yet", [61, 72, 44, 38, 58, 15, 49], set()), ("Gym", "not yet", [39, 63, 51, 20, 45, 30, 22], set())]
    cells = ""
    for t, s, vals, mine in types:
        best = max(vals)
        cells += f'<div class="ty">{t}<small>{s}</small></div>'
        for k, v in enumerate(vals):
            a = int(v / 80 * 70)
            href = "Finder.dc.html" if (t == "Florist" and k == 1) else "#"
            cells += (f'<a class="cell{" best" if v == best else ""}" href="{href}" style="background:color-mix(in srgb,var(--accent) {a}%,var(--surface))" title="{t} in {HOODS[k]}: {v}">{v}'
                      f'{"<i class=mine></i>" if k in mine else ""}</a>')
    head = '<span></span>' + "".join(f'<span class="hd">{h}</span>' for h in ["Hell's K.", "Midtown", "Murray H.", "Garment D.", "Lower Man.", "Industry C.", "Hamptons"])
    body = f"""
<div class="nx-sechead" style="margin-top:22px"><h2>Market changes</h2><span class="quiet">waves, supplier shortages and demand that moved</span></div>
<div class="mv">
  <a href="#">{ic("expansion", style="color:var(--accent)")}<b>Midtown</b>Beer wave you sell here · 3 d left</a>
  <a href="{ROUTE["supply/imports"]}">{ic("warn", style="color:var(--neg)")}<b>Fabric (Cheap)</b>backorder at 7 Pier · affects Garment Depot</a>
  <a href="#">{ic("expansion", style="color:var(--accent)")}<b>Lower Manhattan</b>Gift shops +5</a>
  <a href="#">{ic("expansion", style="color:var(--neg);transform:scaleY(-1)")}<b>Hell's Kitchen</b>Beer -8</a>
</div>
<div class="nx-sechead" style="margin-top:28px"><h2>Demand by business type</h2><span class="quiet">each type's best neighbourhood outlined · a cell opens Find a location there</span>
  <div class="aside"><div class="seg"><button class="on" type="button">By type</button><button type="button">What I sell</button><button type="button">Not yet</button></div></div></div>
<div class="dm">{head}{cells}</div>
<div class="sp-legend" style="display:flex;gap:16px;margin-top:10px;font-size:12px;color:var(--ink-2)"><span><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--info);margin-right:6px"></i>you run one here</span><span>Offices: 4 types in their own band below</span><span class="quiet">Demand is how much customers want a type here, not guaranteed profit.</span></div>
<p class="quiet" style="margin-top:14px">A cell opens Find a location for that type and neighbourhood. Setup checklists: <a class="link" href="{ROUTE["guide"]}">Game guide</a></p>"""
    return app("expansion", "demand", "Demand", body, [("Expansion", ROUTE["expansion"]), ("Demand", "")])


def city_svg(highlight: bool = True, sel: bool = True) -> str:
    random.seed(11)
    parts = ['<svg viewBox="0 0 700 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true">']
    xs = list(range(0, 721, 64))
    ys = list(range(0, 721, 56))
    for x in xs:
        parts.append(f'<line class="rd" x1="{x}" y1="0" x2="{x}" y2="720"></line>')
    for y in ys:
        parts.append(f'<line class="rd" x1="0" y1="{y}" x2="700" y2="{y}"></line>')
    parts.append('<line class="rd" x1="0" y1="700" x2="700" y2="60" style="stroke-width:12"></line>')
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            x0, y0 = xs[i] + 7, ys[j] + 7
            if (i, j) in ((3, 2), (4, 2), (3, 3), (4, 3)):
                if (i, j) == (3, 2):
                    parts.append(f'<rect class="park" x="{x0}" y="{y0}" width="114" height="98" rx="6"></rect>')
                    parts.append(f'<circle cx="{x0 + 57}" cy="{y0 + 49}" r="34" fill="url(#g)"></circle>')
                continue
            parts.append(f'<rect class="blk" x="{x0}" y="{y0}" width="50" height="42" rx="3"></rect>')
    parts.insert(1, '<defs><radialGradient id="g" cx="35%" cy="30%"><stop offset="0" stop-color="#b8f5cf"></stop><stop offset=".3" stop-color="#5fd894"></stop><stop offset=".7" stop-color="#2f9e63"></stop><stop offset="1" stop-color="#135c37"></stop></radialGradient></defs>')
    hits = [(1, 4, 1), (2, 3, 2), (8, 2, 3), (6, 8, 4), (3, 10, 5), (1, 9, 6), (5, 11, 7)]
    if highlight:
        for i, j, r in hits:
            c = "hit sel" if (r == 1 and sel) else "hit"
            parts.append(f'<rect class="{c}" x="{xs[i] + 14}" y="{ys[j] + 12}" width="30" height="26" rx="3"></rect>'
                         f'<text x="{xs[i] + 29}" y="{ys[j] + 30}" text-anchor="middle" style="font:600 11px IBM Plex Mono,monospace;fill:var(--on-accent)">{r}</text>')
    for i, j in [(2, 6), (7, 4), (9, 9)]:
        parts.append(f'<rect class="mine" x="{xs[i] + 12}" y="{ys[j] + 10}" width="34" height="30" rx="3"></rect>')
    parts.append('<text class="lbl" x="70" y="250">MIDTOWN</text><text class="lbl" x="420" y="140">HELL\'S KITCHEN</text><text class="lbl" x="380" y="470">MURRAY HILL</text><text class="lbl" x="40" y="640">GARMENT DISTRICT</text>')
    parts.append("</svg>")
    return "".join(parts)


def floor_plan(big: bool = False) -> str:
    return ('<svg viewBox="0 0 150 110" aria-label="Floor plan, layout C2, 225 square metres">'
            '<rect class="fl" x="6" y="6" width="138" height="98"></rect>'
            '<path class="wl" d="M6 6h138v98H86M64 104H6V6"></path>'
            '<path class="pt" d="M104 6v40h40M104 60h40"></path>'
            '<rect class="bay" x="118" y="74" width="26" height="24"></rect>'
            '<line class="dr" x1="66" y1="104" x2="84" y2="104"></line>'
            + ('<text x="30" y="56" style="font:500 8px IBM Plex Mono,monospace;fill:var(--ink-3)">sales floor</text><text x="108" y="30" style="font:500 7px IBM Plex Mono,monospace;fill:var(--ink-3)">back room</text>' if big else "")
            + '</svg>')


def finder(detail: bool = False) -> str:
    rows = [(1, "14 Park Ave", "MT", "225 m² · C2", "92", "38", "68", "$16.5k"), (2, "3 Lexington Av", "MT", "180 m² · C1", "88", "35", "68", "$13.0k"),
            (3, "61 9th Avenue", "HK", "225 m² · C2", "81", "31", "42", "$8.9k"), (4, "8 2nd Ave", "MH", "300 m² · M1", "79", "29", "58", "$11.2k"),
            (5, "120 West St", "LM", "180 m² · C1", "74", "27", "63", "$6.4k"), (6, "22 7th Ave", "GD", "225 m² · C2", "70", "33", "31", "$7.7k"),
            (7, "5 Broad St", "LM", "140 m² · A1", "66", "24", "63", "$4.8k")]
    tr = "".join(f'<div class="fd-r{" on" if k == 1 else ""}"><span class="rk">{k}</span><span><b>{a}</b><small>{hood(h)} {s}</small></span><span class="n">{sc}</span><span class="n">{t}</span><span class="n">{d}</span><span class="n">{u}</span></div>' for k, a, h, s, sc, t, d, u in rows)
    card = f"""
<div class="fd-card">
  <div class="plan">{floor_plan()}</div>
  <div style="display:flex;flex-direction:column;gap:8px">
    <div style="display:flex;align-items:center;gap:8px">{hood("MT")}<b style="font-size:14px">14 Park Ave</b><span class="chip ok">vacant</span></div>
    <div class="facts"><span>Floor</span><b>225 m² · C2</b><span>Building capacity</span><b>30 an hour</b><span>Foot traffic</span><b>38</b>
      <span>Rent, estimated</span><b>$262 a day</b><span>Deposit, estimated</span><b>$16,460 ±4%</b></div>
    <a class="link" href="FinderDetail.dc.html" style="align-self:flex-start">Floor plan and costs</a>
  </div>
</div>"""
    filters = f"""
<div class="fd-f" aria-label="Filters">
  <div class="row"><span class="lab">Kind</span><div class="chips"><button class="fd-c on" type="button">Retail</button><button class="fd-c" type="button">Office</button><button class="fd-c" type="button">Warehouse</button><button class="fd-c" type="button">Cinema</button><button class="fd-c" type="button">Theater</button></div></div>
  <div class="row"><span class="lab">Business type</span><div class="fd-sel">Florist {ic("chevd")}</div></div>
  <div class="row"><span class="lab">Show</span><div class="chips"><button class="fd-c on" type="button">To rent <small>12</small></button><button class="fd-c" type="button">To take over <small>4</small></button><button class="fd-c" type="button">For sale <small>2</small></button></div></div>
  <div class="row"><span class="lab">Where</span><div class="chips">{"".join(f'<button class="fd-c{" on" if h in ("MT", "HK", "MH", "LM", "GD") else ""}" type="button">{h}</button>' for h in HOODS)}</div></div>
  <div class="row"><span class="lab">Size m²</span><div class="fd-in"><label>min<b>140</b></label><label>max<b>—</b></label></div></div>
  <div class="row"><span class="lab">Capacity, traffic</span><div class="fd-in"><label>cap ≥<b>15</b></label><label>traffic ≥<b>20</b></label></div></div>
  <div class="row"><span class="lab">Layout</span><div class="chips"><button class="fd-c" type="button">A1</button><button class="fd-c" type="button">C1</button><button class="fd-c on" type="button">C2</button><button class="fd-c" type="button">M1</button></div></div>
  <div class="row"><span class="lab">Saved searches</span><div class="chips"><button class="fd-c on" type="button">{ic("star", style="width:12px;height:12px")}Florist, Manhattan</button><button class="fd-c" type="button">+ Save</button></div></div>
</div>"""
    ctx = (f'<div class="ctx"><span>{ic("expansion", style="width:14px;height:14px;color:var(--accent)")}Florist demand: Midtown 68 · Lower Man. 63 · Murray H. 58</span>'
           f'<span>{ic("pin", style="width:14px;height:14px")}From Demand › Florist · Midtown</span></div>')
    main = f"""
<div class="fd">
  {filters}
  <div class="fd-m">{city_svg()}{ctx}<div class="zoom"><button class="ibtn" type="button" aria-label="Zoom in">{ic("plus")}</button><button class="ibtn" type="button" aria-label="Zoom out">{ic("minus")}</button><button class="ibtn" type="button" aria-label="Fit the city">{ic("home")}</button></div></div>
  <div class="fd-l"><div class="fd-lh"><span>#</span><span>Address</span><span style="text-align:right">Score</span><span style="text-align:right">Traffic</span><span style="text-align:right">Demand</span><span style="text-align:right">Upfront</span></div>{tr}{card}</div>
</div>"""
    onward = f"""
<div class="mo-views" style="margin-top:16px">
  <a href="{ROUTE["expansion/demand"]}"><b>{ic("expansion")}Florist demand by neighbourhood</b><small>Back to Demand, with Florist selected</small></a>
  <a href="{ROUTE["guide"]}"><b>{ic("guide")}Florist setup guide</b><small>Fixtures, suppliers and a setup checklist in the Game guide</small></a>
  <a href="{ROUTE["expansion/plan"]}"><b>{ic("factory")}Plan a factory</b><small>For a warehouse or factory floor, plan its machines and inputs</small></a>
</div>"""
    body = f"""
<p class="nx-lede" style="margin-top:18px">Vacant premises ranked for the business you want to open.</p>
{main}{onward}"""
    b = app("expansion", "finder", "Find a location", body, [("Expansion", ROUTE["expansion"]), ("Find a location", "")])
    if detail:
        sheet = f"""
<div class="sp-scrim"></div>
<div style="position:absolute;top:0;right:0;bottom:0;width:560px;z-index:21;background:var(--surface);border-left:1px solid var(--rule);box-shadow:var(--shadow);display:flex;flex-direction:column">
  <div style="display:flex;align-items:center;gap:10px;padding:18px 22px;border-bottom:1px solid var(--rule-soft)">
    <a class="nx-btn sm" href="Finder.dc.html">{ic("back")}Results</a><span class="quiet">filters kept: Florist · 5 neighbourhoods · ≥140 m² · C2</span></div>
  <div style="padding:20px 22px;display:flex;flex-direction:column;gap:16px">
    <div style="display:flex;align-items:center;gap:10px">{hood("MT")}<h2 style="font-size:22px;font-weight:700">14 Park Ave</h2><span class="chip ok">vacant · to rent</span><span class="chip line">#1 of 12</span></div>
    <div class="plan" style="padding:14px">{floor_plan(big=True)}</div>
    <div class="sp-legend" style="display:flex;gap:14px;font-size:12px;color:var(--ink-2)"><span><i style="display:inline-block;width:14px;height:4px;background:var(--accent);margin-right:6px;vertical-align:middle"></i>entrance</span><span>dark block: loading bay (a gap in the floor)</span><span>as stored in the game, not turned to the street</span></div>
    <div class="mo-3">
      <div class="mo-tile"><span class="lab">Floor</span><span class="v">225 m²</span><small>layout C2 · 1 entrance · 1 bay</small></div>
      <div class="mo-tile"><span class="lab">Building capacity</span><span class="v">30 /h</span><small>for a shop on a C floor</small></div>
      <div class="mo-tile"><span class="lab">Foot traffic</span><span class="v">38</span><small>Midtown's median 31</small></div>
    </div>
    <div class="mo-card"><h3>{ic("coin")}Costs and ownership</h3>
      <div class="sp-kv"><span>Rent, estimated</span><b>$262 a day</b><small>from floor, traffic and Midtown's rate; fitted on 48 leases, within 1%</small>
      <span>Deposit, estimated</span><b>$16,460</b><small>62.84 × a day's rent; seen within 4%</small><span>Landlord</span><b>city</b><span>Florist demand here</span><b>68 · best</b></div></div>
    <div style="display:flex;gap:8px">{btn("Show on the City map", "", ROUTE["map"], icon="map")}{btn("Florist demand", "ghost", ROUTE["expansion/demand"], icon="expansion")}</div>
  </div>
</div>"""
        b += sheet
    return b


def plan_factory() -> str:
    body = f"""
<div class="r2-scope" style="margin-top:20px"><span class="chip dim">Plan for: Full production</span><span class="quiet">A factory you do not run yet. Running factories: <a class="link" href="{ROUTE["supply/production"]}">Supply › Production</a></span></div>
<div class="mo-2" style="margin-top:20px;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)">
  <div class="mo-card"><h3>{ic("factory")}Lines<span class="aside quiet">Clothing factory · 2 lines</span></h3>
    <table class="nx-t"><thead><tr><th>Recipe</th><th>Machines</th><th class="n">Makes a day</th><th class="n">Your shops use</th><th class="n">Export surplus</th></tr></thead><tbody>
      <tr><td><b>Clothing (Cheap)</b><small><a class="link" href="{ROUTE["guide"]}">recipe in the Game guide</a></small></td><td><div style="display:inline-flex;align-items:center;gap:8px"><button class="ibtn" type="button" aria-label="One fewer" style="width:28px;height:28px">{ic("minus")}</button><b class="mono">3</b><button class="ibtn" type="button" aria-label="One more" style="width:28px;height:28px">{ic("plus")}</button></div></td><td class="n">4,320</td><td class="n">2,100</td><td class="n pos">2,220</td></tr>
      <tr><td><b>Clothing (Luxury)</b><small>Sewing Workstation</small></td><td><div style="display:inline-flex;align-items:center;gap:8px"><button class="ibtn" type="button" aria-label="One fewer" style="width:28px;height:28px">{ic("minus")}</button><b class="mono">1</b><button class="ibtn" type="button" aria-label="One more" style="width:28px;height:28px">{ic("plus")}</button></div></td><td class="n">480</td><td class="n">610</td><td class="n neg">-130</td></tr>
    </tbody></table></div>
  <div class="mo-card"><h3>{ic("cart")}Ingredients and costs<span class="aside quiet">a week</span></h3>
    <table class="nx-t"><thead><tr><th>Ingredient</th><th class="n">Needs</th><th class="n">Observed price</th><th class="n">Cost</th></tr></thead><tbody>
      <tr><td>Fabric (Cheap)</td><td class="n">30,240</td><td class="n">$0.62<small>7 Pier</small></td><td class="n">$18,750</td></tr>
      <tr><td>Fabric (Luxury)</td><td class="n">3,360</td><td class="n">—<small>no price seen</small></td><td class="n">—</td></tr>
      <tr><td>Buttons</td><td class="n">6,720</td><td class="n">$0.20</td><td class="n">$1,340</td></tr>
    </tbody></table>
    <p class="quiet" style="margin-top:8px">Priced for 2 of 3 ingredients. Company target: supply your shops first, export the rest. <a class="link" href="{ROUTE["supply/imports"]}">Current imports</a></p></div>
</div>"""
    return app("expansion", "plan", "Plan a factory", body, [("Expansion", ROUTE["expansion"]), ("Plan a factory", "")])


# --------------------------------------------------------------------------
# Supply › Deliveries and Goods flow (supporting frames)
# --------------------------------------------------------------------------
def deliveries() -> str:
    def row(hd, dest, item, word, cls, now, to, unit, src, note, st=""):
        return (f'<tr><td>{hood(hd)} <b>{dest}</b></td><td>{item}</td><td>{chip(cls, word)}</td><td class="n"><s class="dim">{now}</s> → <b class="pos">{to}</b><small>{unit}</small></td>'
                f'<td>{src}<small>{note}</small></td><td>{st}</td></tr>')
    body = f"""
{from_strip("Gift (Cheap) at Harbor Gifts, wholesale delivery too low", "warning 3 of 11", nxt=False)}
<div class="nx-scope"><span class="lab">Scope</span><button class="nx-pick" type="button">{ic("businesses")}Whole company{ic("chevd")}</button><span class="sp-scope-note">grouped by where the goods arrive</span>
  <span style="margin-left:auto;display:flex;gap:8px"><a class="nx-btn sm ghost" href="{ROUTE["supply/flow"]}">{ic("flow")}See it as goods flow</a><div class="seg"><button class="on" type="button">Needs a change</button><button type="button">Everything</button></div></span></div>
<table class="nx-t" style="margin-top:18px"><thead><tr><th>Destination</th><th>Item</th><th>Status</th><th class="n">Setting</th><th>Source · recurrence</th><th></th></tr></thead><tbody>
<tr class="grp"><td colspan="6">Shops · daily top-ups and wholesale</td></tr>
{row("LM", "Harbor Gifts", "Gift (Cheap)", "short", "bad", "450", "700", "a week, each Monday", "wholesale store", "sells 600 a week + 15%", state("mine"))}
{row("MT", "Marlow Market", "Umbrella", "no plan", "bad", "none", "30", "top-up a day", "Bridge Hub", "busiest day Sat 28")}
{row("MT", "Marlow Market", "Soda Can", "idle", "warn", "1,400", "300", "target", "Bridge Hub", "5 weeks of the busiest day", state("mine"))}
<tr class="grp"><td colspan="6">Warehouses · second tier</td></tr>
{row("GD", "Garment Depot", "Clothing (Cheap)", "not routed", "warn", "—", "180", "a day to Stitch &amp; Co", "Garment Depot", "3,000 held, 2 shops sell it")}
<tr class="grp"><td colspan="6">Factories · inputs</td></tr>
{row("IC", "Canal Brewery", "Water", "short", "bad", "1,200", "2,400", "top-up a day", "Bridge Hub", "Full production · also on Production")}
</tbody></table>
<p class="quiet" style="margin-top:10px">Import amounts and paused imports: <a class="link" href="{ROUTE["supply/imports"]}">Imports</a></p>"""
    return app("supply", "deliveries", "Deliveries", body, [("Supply", ROUTE["supply"]), ("Deliveries", "")])


def goods_flow() -> str:
    cols = [(90, "IMPORTERS"), (330, "FACTORIES"), (570, "DEPOTS"), (820, "SHOPS")]
    nodes = [("1 Pier", 90, 110, "8,400 a week", ""), ("7 Pier", 90, 300, "5,000 a week", ""),
             ("Canal Brewery", 330, 110, "1,500 a day", "b"), ("Stitch Yard", 330, 300, "unnamed line", "w"),
             ("Bridge Hub", 570, 110, "5,600 held", "b"), ("Garment Depot", 570, 300, "3,000 idle", "w"),
             ("Marlow Market MT", 820, 60, "", ""), ("Marlow Market HK", 820, 130, "", ""), ("Vale Liquor", 820, 200, "", ""),
             ("Stitch &amp; Co", 820, 290, "", "w"), ("Harbor Gifts", 820, 380, "wholesale", "b")]
    sel = {"1 Pier", "Bridge Hub", "Canal Brewery", "Vale Liquor", "Marlow Market MT", "Marlow Market HK"}
    pipes = [((90, 110), (570, 110), "wk lit", 6), ((90, 300), (570, 300), "wk dim", 4), ((570, 110), (330, 110), "warnp", 5),
             ((570, 110), (820, 200), "lit", 4), ((570, 110), (820, 60), "lit", 3), ((570, 110), (820, 130), "lit", 3),
             ((570, 300), (330, 300), "dim", 3), ((570, 300), (820, 290), "dim", 1)]
    svg = ['<svg viewBox="0 0 1000 520" preserveAspectRatio="xMidYMid meet">']
    for x, t in cols:
        svg.append(f'<text class="col" x="{x}" y="30" text-anchor="middle">{t}</text>')
    for (a, b, c, w) in pipes:
        (x1, y1), (x2, y2) = a, b
        mx = (x1 + x2) / 2
        sx, ex = x1 + (60 if x2 > x1 else -60), x2 + (-62 if x2 > x1 else 62)
        if y1 == y2 and abs(x2 - x1) > 300:
            svg.append(f'<path class="pipe {c}" stroke-width="{w}" d="M{sx},{y1 - 12} C{sx + 120},{y1 - 70} {ex - 120},{y2 - 70} {ex},{y2 - 12}"></path>')
            continue
        svg.append(f'<path class="pipe {c}" stroke-width="{w}" d="M{sx},{y1} C{mx},{y1} {mx},{y2} {ex},{y2}"></path>')
    for n, x, y, s, d in nodes:
        cls = "node" + (" sel" if n == "Bridge Hub" else "") + ("" if n in sel else " dim")
        dot = f'<circle class="{d}" cx="{x + 52}" cy="{y - 14}" r="4"></circle>' if d else ""
        svg.append(f'<g class="{cls}"><rect x="{x - 62}" y="{y - 24}" width="124" height="{48 if s else 34}" rx="8"></rect><text x="{x - 52}" y="{y - 4}">{n}</text>'
                   f'{f"<text class=s x={x - 52} y={y + 13}>{s}</text>" if s else ""}{dot}</g>')
    svg.append("</svg>")
    body = f"""
{from_strip("Water · Bridge Hub, import shortfall", "following its supply route")}
<div class="nx-scope"><span class="lab">Following</span><span class="nx-pick sel">{ic("warehouse")}Bridge Hub<span class="x">{ic("x", style="width:12px;height:12px")}</span></span>
  <span class="nx-pick sel">{ic("tag")}Water<span class="x">{ic("x", style="width:12px;height:12px")}</span></span>
  <span style="margin-left:auto" class="seg"><a href="{ROUTE["supply/deliveries"]}">Table</a><button class="on" type="button">Goods flow</button></span></div>
<div class="gfl" style="margin-top:16px">{"".join(svg)}</div>
<div class="mo-2" style="margin-top:14px">
  <div class="mo-card"><h3>{ic("warehouse")}Bridge Hub · Water<span class="aside"><a class="link" href="{ROUTE["supply/imports"]}">Its import</a></span></h3>
    <div class="sp-kv"><span>In</span><b>1 Pier · 8,400 a week</b><span>Out</span><b>Canal Brewery 1,200 · 2 shops 240 a day</b><span>On hand</span><b>5,600 · dry Sat</b></div></div>
  <div class="mo-card"><h3>{ic("link")}Fixes on this route</h3><div style="display:flex;flex-direction:column;gap:8px">
    <a href="{ROUTE["supply/imports"]}" style="color:var(--info);font-size:13px;font-weight:500">1 Pier → Bridge Hub: the weekly order and the gap until Monday</a>
    <a href="{ROUTE["supply/production"]}" style="color:var(--info);font-size:13px;font-weight:500">Bridge Hub → Canal Brewery: the Water top-up</a></div>
    <p class="quiet" style="margin-top:10px">solid: the daily round · dashed: the weekly import · amber: an input arriving short</p></div></div>"""
    return app("supply", "flow", "Goods flow", body, [("Supply", ROUTE["supply"]), ("Goods flow", "")])


# --------------------------------------------------------------------------
# references, utilities, the entry without a save
# --------------------------------------------------------------------------
def guide() -> str:
    cats = ["Businesses", "Products", "Suppliers", "Fixtures", "Recipes", "Staff and skills", "Vehicles", "Real estate"]
    body = f"""
<div class="nx-scope"><button class="nx-search" type="button" style="width:420px">{ic("search")}Search the guide: a product, a fixture, a recipe</button>
  <span style="margin-left:12px" class="mo-ref game">game reference</span><span class="mo-ref save">from your save</span></div>
<div class="mo-cols" style="grid-template-columns:220px minmax(0,1fr)">
  <nav class="mo-list">{"".join(f'<a class="mo-biz{" on" if c == "Businesses" else ""}" href="#"><span></span><b>{c}</b><span></span></a>' for c in cats)}</nav>
  <div>
    <div class="mo-head"><h2>Florist</h2><span class="mo-ref game">game reference</span><span class="sub">Retail · sells Flowers (Cheap), Flowers (Luxury), Vase, Plant (Potted)</span></div>
    <div class="mo-2" style="margin-top:16px">
      <div class="mo-card"><h3>{ic("list")}Setup checklist<span class="aside quiet">your notes</span></h3>
        {"".join(f'<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--rule-soft);font-size:13px"><button class="nx-tick{" on" if k < 3 else ""}" type="button" aria-label="Done">{ic("tick")}</button>{t}</div>' for k, t in enumerate(["Rent a retail floor (C or larger)", "Flower fridge × 2", "Cash register", "Customer bathroom with a stall", "Music player", "Interior design 55 or more"]))}</div>
      <div class="mo-card"><h3>{ic("tag")}Prices in your save<span class="mo-ref save" style="margin-left:6px">your save</span><span class="aside"><a class="link" href="PricesShop.dc.html">Products &amp; prices</a></span></h3>
        <table class="nx-t"><thead><tr><th>Neighbourhood</th><th>Product</th><th class="n">Your price</th><th class="n">Lowest market</th></tr></thead><tbody>
          <tr><td>{hood("MH")} Murray Hill</td><td>Flowers (Cheap)</td><td class="n">$6.50</td><td class="n">$5.90</td></tr>
          <tr><td>{hood("MH")} Murray Hill</td><td>Vase</td><td class="n">Not set</td><td class="n">$14.00</td></tr></tbody></table>
        <p class="quiet" style="margin-top:8px">Comparisons, not recommendations.</p></div>
    </div>
    <div class="mo-card" style="margin-top:16px"><h3>{ic("supply")}Suppliers and recipes</h3><p class="quiet">Where Flowers come from, fixture sizes and each supplier's building, as in the game. Linked from Supply and Plan a factory; works with no save open.</p></div>
  </div>
</div>"""
    return app("guide", "", "Game guide", body)


def city_map() -> str:
    body = f"""
<div class="nx-scope">
  <button class="sev" type="button" style="color:var(--ink)"><i style="background:var(--accent)"></i>Mine 14</button><button class="sev" type="button"><i style="background:var(--info)"></i>Owned 1</button>
  <button class="sev" type="button"><i style="background:var(--ink)"></i>Homes 1</button><button class="sev watch" type="button"><i></i>Findings 6</button><button class="sev" type="button" style="opacity:.5"><i style="border:1px solid var(--ink-3)"></i>All 883</button>
  <span style="margin-left:auto;display:flex;gap:8px"><a class="nx-btn" href="{ROUTE["expansion/finder"]}">{ic("pin")}Find a location</a><button class="nx-search" type="button" style="width:260px">{ic("search")}An address or a business</button></span></div>
<div class="fd" style="grid-template-columns:minmax(0,1fr) 340px;height:700px">
  <div class="fd-m">{city_svg(highlight=False)}</div>
  <div class="fd-l" style="padding:16px;gap:12px">
    <div style="display:flex;align-items:center;gap:8px">{ic("home")}<b style="font-size:15px">Your home</b>{hood("MT")}</div>
    <div class="quiet">31 5th Avenue · apartment</div>
    <div class="plan" style="padding:12px">{floor_plan()}</div>
    <div class="facts" style="display:grid;grid-template-columns:auto auto;gap:6px 12px;font-size:12.5px;color:var(--ink-2)"><span>Rent a day</span><b class="mono" style="text-align:right">$140</b><span>A week</span><b class="mono" style="text-align:right">$980</b><span>Floor</span><b class="mono" style="text-align:right">95 m²</b><span>Rent per m² a day</span><b class="mono" style="text-align:right">$1.47</b></div>
    <p class="quiet">Not a business: no results or findings. Rent is in company costs.</p>
  </div>
</div>"""
    return app("map", "", "City map", body)


def preferences() -> str:
    def sw(on):
        return f'<button class="nx-sw{" on" if on else ""}" type="button" role="switch" aria-checked="{"true" if on else "false"}"></button>'
    body = f"""
<div style="max-width:980px">
<div class="pf"><div><h3>Appearance</h3><p class="d">Theme and motion. Motion follows your system unless you choose here.</p></div><div class="ctl">
  <div class="ln"><div class="seg"><button type="button">System</button><button type="button">Light</button><button class="on" type="button">Dark</button></div></div>
  <div class="ln">{sw(False)}Reduce motion<span class="quiet">now: system says no preference</span></div>
  <div class="ln">{sw(True)}Playful touches: the sphere and coins<span class="quiet">never block a finding; off in reduced motion</span></div></div></div>
<div class="pf"><div><h3>Interface language</h3><p class="d">Big Copilot's own words.</p></div><div class="ctl"><div class="ln"><div class="seg"><button class="on" type="button">English</button><button type="button">Deutsch</button></div><span class="quiet">German is in progress</span></div></div></div>
<div class="pf"><div><h3>Game names</h3><p class="d">Products, businesses and fixtures as the game names them, in its language.</p></div><div class="ctl">
  <div class="ln"><div class="fd-sel" style="width:220px">English {ic("chevd")}</div><span class="quiet">separate from the interface language</span></div>
  <div class="ln">{ic("file")}Optional game text: <b>en.json</b> from your install<button class="link" type="button" style="margin-left:8px">Choose file</button></div></div></div>
<div class="pf"><div><h3>History</h3><p class="d">Trends and week-on-week figures need history kept in this browser.</p></div><div class="ctl">
  <div class="ln"><div class="fd-sel" style="width:220px">Keep 120 days {ic("chevd")}</div><span class="quiet">Marlow Trading: day 40 to 83</span></div>
  <div class="ln">{btn("Forget history for Marlow Trading", "sm ghost", icon="x")}<span class="quiet">trend charts start again from the next save</span></div></div></div>
<div class="pf"><div><h3>Checks</h3><p class="d">Which findings reach Needs attention.</p></div><div class="ctl"><div class="ln"><a class="nx-btn sm" href="Customize.dc.html">{ic("prefs")}Customize checks</a><span class="quiet">29 of 31 on · $500 a day line</span></div></div></div>
<div class="pf"><div><h3>Game context</h3><p class="d">What the numbers are played on.</p></div><div class="ctl"><div class="ln"><span class="fv-diff" style="font-size:11px;padding:5px 8px">{ic("prefs")}Normal</span>Difficulty settings compared with the stock presets<button class="link" type="button" style="margin-left:8px">Compare</button></div></div></div>
<div class="pf" style="border:0"><div><h3>Local board (CLI)</h3><p class="d">For the Python version on your computer.</p></div><div class="ctl"><div class="nx-copy">python ba_dashboard.py --watch      # follow the save folder
python ba_dashboard.py --game       # read the running game
python ba_dashboard.py --backfill   # rebuild history from old saves</div></div></div>
</div>"""
    return app("prefs", "", "Preferences", body)


def help_page() -> str:
    body = f"""
<div class="mo-3" style="margin-top:22px">
  <div class="mo-card"><h3>{ic("help")}Can't find something?</h3><p class="quiet">Tell us the task in your own words. We use it to fix names and routes, not just docs.</p><div style="margin-top:10px;display:flex;gap:8px">{btn("Ask on Discord", "", icon="ext")}{btn("Report a bug", "ghost", icon="ext")}</div></div>
  <div class="mo-card"><h3>{ic("vote")}Feature requests</h3><p class="quiet">Vote on what comes next. One vote per connection, not per person.</p><div style="margin-top:10px">{btn("Open the ballot", "", icon="vote")}</div></div>
  <div class="mo-card"><h3>{ic("news")}What's new</h3><p class="quiet"><b style="color:var(--ink-2)">26 Sep</b> · Hairdressers ask for a second stylist when two queues run short.</p><div style="margin-top:10px">{btn("Changelog", "ghost")}</div></div>
</div>
<div class="mo-sec"><div class="nx-sechead"><h2>Retired features</h2><span class="nx-tag nw">contingency · nothing retired</span></div>
  <p class="nx-lede">Nothing has been retired in this redesign. If a feature ever is, it is listed here with why, what replaces it, and a way to ask for it back. An old link lands here, never on a dead end.</p>
  <div class="ret" style="margin-top:14px"><div class="shot">example layout<br>(no real entry)</div><dl>
    <dt>Feature</dt><dd>[name of the retired feature]</dd><dt>Its job</dt><dd>[the task it did]</dd><dt>Why</dt><dd>[reason, date]</dd>
    <dt>Instead</dt><dd>[replacement, linked]</dd><dt>Status</dt><dd>Under review · Planned · Restored · Not planned</dd>
    <dt></dt><dd><button class="nx-btn sm ghost off" type="button">{ic("vote")}Request its return</button> <span class="quiet">a restoration request, separate from new-feature votes</span></dd></dl></div></div>
<div class="mo-sec"><div class="nx-sechead"><h2>The project</h2></div>
  <div class="mo-crew"><span>{ic("heart", style="width:14px;height:14px")}Support the project (PayPal)</span><span>{ic("ext", style="width:14px;height:14px")}Source code</span><span>YouTube</span><span>r/bigambitions</span><span>Discord</span><span>Steam store page</span><span>Hovgaard Games</span><span>Impressum</span><span>Privacy</span><span>{ic("users", style="width:14px;height:14px")}about 40 online now</span></div>
  <p class="quiet" style="margin-top:10px">Fan-made companion for Big Ambitions. Not affiliated with, endorsed by or supported by Hovgaard Games.</p></div>"""
    return app("help", "", "Help &amp; feedback", body)


def no_save() -> str:
    body = f"""
<div class="ld">
  <div>
    <div class="nx-brand" style="padding:0"><span class="wordmark" id="wm" style="font-size:34px;max-width:none">Big Copilot</span><span class="dot" id="dot" role="button" tabindex="0" aria-label="Brand dot" style="width:13px;height:13px"></span></div>
    <h1 style="margin-top:34px">It reads your company<br>and tells you what needs fixing.</h1>
    <p class="lede">Open a Big Ambitions save and Big Copilot checks every business, supply line and person, then walks you to the setting to change: the import amount, the delivery target, the hours a factory should run.</p>
    <div class="ld-demo" aria-label="What Needs attention looks like">
      <span class="lab">What you will see first · an example</span>
      <div class="row"><i style="background:var(--neg)"></i><span><b>Raise the Water import at Bridge Hub</b> <span class="quiet">runs dry Sat, 2 days before the import</span></span><span class="quiet">Review import amount ›</span></div>
      <div class="row"><i style="background:var(--warn)"></i><span><b>4 amenity fixes at a bookstore</b> <span class="quiet">bathroom privacy · sink · music · interior</span></span><span class="quiet">Review amenities ›</span></div>
    </div>
    <div style="margin-top:22px;display:flex;align-items:center;gap:10px">{btn("Browse the Game guide", "ghost", ROUTE["guide"], icon="guide")}<span class="quiet">works with no save at all</span></div>
    <div class="nx-ptop" style="position:relative;height:110px;border-bottom:1px solid var(--rule);margin-top:26px"><div class="orb" aria-hidden="true"><u></u></div></div>
  </div>
  <div class="ld-drop">
    <b style="font-size:17px">Open your company</b>
    <div class="ld-src"><span class="ic">{ic("folder")}</span><span><b>Save folder</b><small>Follows the newest save as you play · or drop the folder here</small></span>{btn("Choose", "go")}</div>
    <div class="ld-src"><span class="ic">{ic("file")}</span><span><b>One save file</b><small>A snapshot you pick on purpose; it does not update</small></span>{btn("Choose", "")}</div>
    <div class="ld-src"><span class="ic">{ic("game")}</span><span><b>Link to the running game</b><small>With the Big Copilot Link mod: live reads, and it can set import amounts, shop schedules and missing uniforms</small></span>{btn("Connect", "")}</div>
    <span class="lab" style="margin-top:6px">Where Windows keeps your saves</span>
    <div class="ld-path"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">%USERPROFILE%\\AppData\\LocalLow\\Hovgaard Games\\Big Ambitions\\SaveGames</span><button class="ibtn" type="button" aria-label="Copy the path" style="width:28px;height:28px">{ic("copy")}</button></div>
    <div class="seg" style="align-self:flex-start"><button class="on" type="button">Windows</button><button type="button">macOS</button><button type="button">Linux</button></div>
    <p class="quiet">Your save stays on your computer; it is read in this browser and never uploaded.</p>
  </div>
</div>"""
    links = (f'<div style="position:absolute;top:22px;right:72px;display:flex;gap:6px;z-index:3">'
             f'<a class="nx-btn sm ghost" href="{ROUTE["guide"]}">{ic("guide")}Game guide</a><a class="nx-btn sm ghost" href="{ROUTE["prefs"]}">{ic("prefs")}Preferences</a>'
             f'<a class="nx-btn sm ghost" href="{ROUTE["help"]}">{ic("help")}Help</a></div>')
    return f'<div style="position:relative">{links}{body}</div>'


BOARDS = [
    ("Schedules.dc.html", "Staffing › Schedules · one shop's plan, with evidence and prerequisites", schedules, 1440, 1160, "tasks", 0, True, False, SUP_CSS + MORE_CSS),
    ("Results.dc.html", "Businesses › Results · company results and finances", results, 1440, 1380, "tasks", 0, True, False, SUP_CSS + MORE_CSS),
    ("BusinessDetail.dc.html", "Businesses › a business page (shop)", business_detail, 1440, 1560, "tasks", 0, True, False, SUP_CSS + MORE_CSS),
    ("Prices.dc.html", "Businesses › Products & prices · from the Overview task", lambda: prices(False), 1440, 900, "tasks", 1, True, False, SUP_CSS + MORE_CSS),
    ("PricesShop.dc.html", "Products & prices · one shop's prices against the market", lambda: prices(True), 1440, 900, "tasks", 1, True, False, SUP_CSS + MORE_CSS),
    ("Finder.dc.html", "Expansion › Find a location · map, list, filters, floor plan", finder, 1440, 1060, "tasks", 1, True, False, SUP_CSS + MORE_CSS),
    ("FinderDetail.dc.html", "Find a location · a building's floor plan and costs, filters kept", lambda: finder(True), 1440, 1060, "tasks", 1, False, False, SUP_CSS + MORE_CSS),
    ("Deliveries.dc.html", "Supply › Deliveries", deliveries, 1440, 900, "support", 0, True, False, SUP_CSS + MORE_CSS),
    ("GoodsFlow.dc.html", "Supply › Goods flow", goods_flow, 1440, 1000, "support", 0, True, False, SUP_CSS + MORE_CSS),
    ("StaffNeeds.dc.html", "Staffing › Staff needs", staff_needs, 1440, 900, "support", 0, True, False, SUP_CSS + MORE_CSS),
    ("Payroll.dc.html", "Staffing › Payroll", payroll, 1440, 900, "support", 0, True, False, SUP_CSS + MORE_CSS),
    ("Standards.dc.html", "Businesses › Standards", standards, 1440, 900, "support", 1, True, False, SUP_CSS + MORE_CSS),
    ("Milestones.dc.html", "Businesses › Milestones (secondary)", milestones, 1440, 900, "support", 1, True, False, SUP_CSS + MORE_CSS),
    ("Demand.dc.html", "Expansion › Demand", demand, 1440, 1000, "support", 1, True, False, SUP_CSS + MORE_CSS),
    ("PlanFactory.dc.html", "Expansion › Plan a factory", plan_factory, 1440, 900, "support", 1, True, False, SUP_CSS + MORE_CSS),
    ("Guide.dc.html", "Game guide (reference)", guide, 1440, 900, "support", 2, True, False, SUP_CSS + MORE_CSS),
    ("CityMap.dc.html", "City map (reference), a home's card", city_map, 1440, 900, "support", 2, True, False, SUP_CSS + MORE_CSS),
    ("Preferences.dc.html", "Preferences", preferences, 1440, 1060, "support", 2, False, False, SUP_CSS + MORE_CSS),
    ("Help.dc.html", "Help & feedback · Retired features as a contingency", help_page, 1440, 1000, "support", 2, True, False, SUP_CSS + MORE_CSS),
    ("NoSave.dc.html", "No save yet · the entry", no_save, 1440, 900, "support", 2, True, False, SUP_CSS + MORE_CSS),
]

ROW_TITLES = {
    ("tasks", 0): "Staffing and Businesses: schedules, results, a business",
    ("tasks", 1): "Prices from the Overview task, and Find a location",
    ("support", 0): "Supporting: Deliveries, Goods flow, Staff needs, Payroll",
    ("support", 1): "Supporting: Standards, Milestones, Demand, Plan a factory",
    ("support", 2): "References, utilities and the entry",
}
NOTES = {
    "n-sched": ("tasks", 0, 0, "Schedules lists shops with their plan status; offices show why a shop schedule does not apply; factories link to Supply › Production, the one factory staffing plan."),
    "n-price": ("tasks", 1, 0, "Overview › Check prices and product sales lands here; picking a shop shows its prices beside the market. No pricing optimizer: the page says these are comparisons."),
    "n-find": ("tasks", 1, 1520, "Find a location keeps its filters: open a building (FinderDetail) and 'Results' returns to the same list. Demand › Florist · Midtown opens it with that context."),
}


# --------------------------------------------------------------------------
# the other kinds of business page: depot, factory, office (home is on the map)
# --------------------------------------------------------------------------
def business_kinds() -> str:
    def rail_row(item, days, truck, act):
        return (f'<div style="display:grid;grid-template-columns:140px minmax(0,1fr) 190px;gap:14px;align-items:center;padding:8px 0;border-bottom:1px solid var(--rule-soft)">'
                f'<b style="font-size:13px">{item}</b>{cover(days, ["W", "T", "F", "S", "S", "M", "T"], truck=truck)}<span style="font-size:12px;color:var(--ink-2)">{act}</span></div>')
    depot = f"""
<div class="mo-card"><h3>{ic("warehouse")}Bridge Hub · warehouse<span class="aside">{hood("IC")}</span></h3>
  <div class="mo-3" style="margin-bottom:12px"><div class="mo-tile"><span class="lab">Costs a day</span><span class="v">$310</span></div><div class="mo-tile"><span class="lab">On the floor</span><span class="v">14,900</span><small>4 lines</small></div><div class="mo-tile"><span class="lab">Feeds</span><span class="v">3 sites</span><small>1,740 a day out</small></div></div>
  <span class="lab">Stock, next 7 days</span>
  {rail_row("Water", ["", "", "", "half", "dry", "", ""], 5, "<a class='link' href='Imports.dc.html'>Raise the weekly order</a> · Imports")}
  {rail_row("Soda Can", ["", "", "", "", "", "", ""], 5, "covered · Smart Delivery")}
  {rail_row("Umbrella", ["", "", "", "", "", "", ""], None, "idle · nothing draws on it")}
  </div>"""
    fac = f"""
<div class="mo-card"><h3>{ic("factory")}Canal Brewery · factory<span class="aside">{hood("IC")}</span></h3>
  <div class="mo-3" style="margin-bottom:12px"><div class="mo-tile"><span class="lab">Machines</span><span class="v">4</span><small>all on a named line</small></div><div class="mo-tile"><span class="lab">Makes a day</span><span class="v">1,500</span><small>of 2,400 rated</small></div><div class="mo-tile"><span class="lab">Ships</span><span class="v">1,480</span><small>to Bridge Hub</small></div></div>
  <span class="lab">Beer line · a square a machine, filled by staffed share of the week</span>
  <div style="display:flex;gap:8px;margin:10px 0">{"".join(f'<span style="width:40px;height:40px;border-radius:6px;border:1px solid var(--rule);background:linear-gradient(0deg,var(--accent) {p}%,var(--ground) {p}%)" title="Beer {k + 1}: {p}% of the week"></span>' for k, p in enumerate([100, 100, 50, 0]))}</div>
  <div class="sp-kv"><span>Water</span><b>eats 1,500 · top-up 1,200</b></div>
  <p class="quiet" style="margin-top:8px">Hours, inputs and workers are planned in <a class="link" href="{ROUTE["supply/production"]}">Supply › Production</a>, with Canal Brewery selected.</p></div>"""
    office = f"""
<div class="mo-card"><h3>{ic("office")}Marlow HQ · office<span class="aside">{hood("MT")}</span></h3>
  <div class="mo-3" style="margin-bottom:12px"><div class="mo-tile"><span class="lab">Fees a day</span><span class="v">$2,140</span></div><div class="mo-tile"><span class="lab">Clients</span><span class="v">18</span><small>of 20 desks' capacity</small></div><div class="mo-tile"><span class="lab">People</span><span class="v">12</span><small>1 unmet demand</small></div></div>
  <div class="nx-omit"><div>{ic("calendar")}<span>No shop schedule here: offices have staff and desk evidence, not a Cash register plan. <a class="link" href="{ROUTE["staffing/needs"]}">Staff needs</a></span></div></div></div>"""
    body = f"""

<div class="mo-2" style="margin-top:18px">{depot}{fac}</div>
<div class="mo-2" style="margin-top:16px">{office}
<div class="mo-card"><h3>{ic("home")}A home</h3><p class="quiet">Opens from its card on the City map: rent a day and a week, floor area, rent per m². Not a business, so no results and no findings. <a class="link" href="{ROUTE["map"]}">City map</a></p></div></div>"""
    return app("businesses", "results", "Business pages by kind", body, [("Businesses", ROUTE["businesses"]), ("Business pages", "")])


BOARDS.insert(3, ("BusinessKinds.dc.html", "Business pages: warehouse, factory, office, home", business_kinds, 1440, 1000, "tasks", 0, True, False, SUP_CSS + MORE_CSS))
