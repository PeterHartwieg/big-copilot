"""Generates the "Add product" canvas for Plan a factory: project/*.dc.html and project/canvas.json.

Issue #162, "Plan a chain: allow secondary products". The range on Expansion › Plan a factory
lists only a type's main products from its F1 help page. ba_store_rules.json `types[<type>].i`
lists every product the type sells with the game's weight; those under 1 are what the type "can
additionally sell". This canvas draws an "Add product" control on the range: the main products
stay the default, an added product gets a line like the others, and a product the player does
not sell yet runs on a per-shop rate the player types.

Unlike the older canvases this one takes the board's REAL stylesheet out of
template/board.html (it was `TEMPLATE` in ba_dashboard.py when the canvas was drawn) (the sidebar layout of PR #169 is not in mockup/revamp), so the range, the tiles
and the ingredient table are the shipped classes. Every class added here carries the pc- prefix
(unused on the board when this was written).

Never hand-edit project/: change this and rerun. `--preview` also writes plain HTML copies into
_preview/ (both themes) for screenshots; do not commit _preview/.

The canvas is published at https://claude.ai/artifact/1umR95CFzK6HGHQB7Y5ixv.
All names (company, numbers) are invented. Never put a real save's names here.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE / "project"
REPO = HERE.parent.parent
CREATED_AT = "2026-10-01T09:30:00Z"
FONTS = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"


def board_css() -> str:
    """The board's own stylesheet: the one <style> block of template/board.html, map and wiki tokens dropped."""
    src = (REPO / "template" / "board.html").read_text(encoding="utf-8")
    s = src.index("<style>") + len("<style>")
    e = src.index("</style>", s)
    css = src[s:e].replace("/*__MAP_CSS__*/", "").replace("/*__WIKI_CSS__*/", "")
    return css


# --------------------------------------------------------------------------
# the feature's own stylesheet, all under pc-
# --------------------------------------------------------------------------
PC_CSS = r"""
html,body{margin:0}
.pc-board{position:relative;overflow:hidden}
.pc-board .sd{height:100%}
.pc-board .orb{opacity:1}

/* the Add product row: the last row of the range, never a column of its own */
tr.pc-addrow td{padding:10px 12px 12px;border-bottom:0}
.pc-add{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 12px 0 10px;border-radius:8px;border:1px dashed var(--rule);background:none;color:var(--ink-2);font:500 12.5px/1 Archivo,sans-serif;cursor:pointer;transition:border-color .15s,color .15s,background .15s}
.pc-add:hover,.pc-add[aria-expanded="true"]{border-color:var(--accent);border-style:solid;color:var(--ink);background:var(--accent-soft)}
.pc-add svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round}
.pc-add small{font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3);margin-left:2px}

/* the picker: a popover off the Add product button (on the board it hangs off <body>,
   position:fixed, as #alertPop does) */
.pc-anchor{position:relative;display:inline-block}
.pc-pop{position:absolute;left:0;top:calc(100% + 8px);z-index:20;width:380px;padding:6px;border-radius:12px;background:var(--raised);border:1px solid var(--rule);box-shadow:0 18px 48px #0006}
.pc-pop[hidden]{display:none}
.pc-pop-h{display:flex;align-items:baseline;justify-content:space-between;padding:8px 10px 8px}
.pc-pop-h b{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.pc-pop-h span{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);cursor:help;border-bottom:1px dotted var(--ink-3)}
.pc-opt{display:grid;grid-template-columns:minmax(0,1fr) 56px 34px;align-items:center;gap:12px;width:100%;min-height:44px;padding:6px 10px;border:0;border-radius:8px;background:none;color:var(--ink);text-align:left;font:inherit;cursor:pointer;transition:background .12s}
.pc-opt:hover,.pc-opt:focus-visible{background:var(--surface);outline:none}
.pc-opt span b{display:block;font:500 13.5px/1.25 Archivo,sans-serif}
.pc-opt span small{display:block;margin-top:2px;font:400 11.5px/1.3 "IBM Plex Mono",monospace;color:var(--ink-3)}
.pc-w{height:4px;border-radius:2px;background:var(--rule);overflow:hidden}
.pc-w i{display:block;height:100%;background:var(--ink-3);width:var(--w)}
.pc-opt em{font:500 12px/1 "IBM Plex Mono",monospace;font-style:normal;color:var(--ink-2);text-align:right}
.pc-opt.on{cursor:default}
.pc-opt.on span b{color:var(--ink-2)}
.pc-opt.on em{color:var(--accent)}
.pc-opt.on .pc-w i{background:var(--accent)}
.pc-opt .pc-tick{display:inline-block;width:14px;height:14px;stroke:var(--accent);fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;vertical-align:-2px;margin-left:6px}

/* an added line: the same row, a remove button by its name and the rate in Supplies */
tr.pc-added td.l:first-child{position:relative}
.pc-x{display:inline-grid;place-items:center;width:22px;height:22px;margin-left:6px;vertical-align:-5px;border-radius:6px;border:1px solid transparent;background:none;color:var(--ink-3);cursor:pointer;transition:all .15s}
.pc-x:hover,.pc-x:focus-visible{border-color:var(--rule);color:var(--neg);outline:none}
.pc-x svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round}
tr.pc-added.pc-out{display:none}
.pc-rate{display:flex;align-items:baseline;justify-content:flex-end;gap:6px;margin-top:6px;font:400 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap}
.pc-rate label{display:inline-flex;align-items:baseline;gap:4px;cursor:text}
.pc-rate input{width:44px;padding:3px 4px 2px;border:0;border-bottom:1px dashed var(--info);border-radius:0;background:none;color:var(--info);font:600 12.5px/1 "IBM Plex Mono",monospace;text-align:right;-moz-appearance:textfield}
.pc-rate input::-webkit-inner-spin-button,.pc-rate input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.pc-rate input:hover{background:var(--info-soft)}
.pc-rate input:focus{outline:none;border-bottom-style:solid;background:var(--info-soft)}
.pc-rate em{font-style:normal;color:var(--info)}

/* artboard B: the states, one range a band */
.pc-states{padding:40px 56px 56px;display:flex;flex-direction:column;gap:44px}
.pc-state{display:grid;grid-template-columns:200px minmax(0,1fr);gap:32px;align-items:start}
.pc-state > div:first-child b{display:block;font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.pc-state > div:first-child p{margin:10px 0 0;font-size:13px;line-height:1.45;color:var(--ink-2);text-wrap:pretty}
.pc-state table{background:var(--ground)}
.pc-state.tall{min-height:500px}
"""

# --------------------------------------------------------------------------
# icons (the board's stroke set)
# --------------------------------------------------------------------------
ICON_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>'
ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>'
ICON_TICK = '<svg class="pc-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>'

# --------------------------------------------------------------------------
# the invented company: four florists and a flower factory already on the floor
# --------------------------------------------------------------------------
COMPANY = "LARKSPUR &amp; CO"
SHOPS, PER_SHOP, PEAK = 4, 150, 1.09
TYPE = "Florist"
# what a Florist "can additionally sell", the game's weight, the workstation
SECONDARY = [("Soda Can", 0.80, "Bottledgoods Workstation"), ("Energy Drink", 0.80, "Bottledgoods Workstation"),
             ("Umbrella", 0.75, "Consumergoods Workstation"), ("Gift (Cheap)", 0.60, "Consumergoods Workstation"),
             ("Gift (Expensive)", 0.60, "Consumergoods Workstation")]
UMBRELLA_DEFAULT = int(round(PER_SHOP * 0.75 / 10.0) * 10)  # 112.5 -> 110


def n(v: float) -> str:
    return f"{round(v):,}"


def covers(week: float, per_shop: float) -> str:
    c = week / 7 / (per_shop * PEAK)
    return f"{c:.1f} shop" if round(c, 1) == 1 else f"{c:.1f} shops"


def supplies(week: float, per_shop: float) -> tuple[str, str]:
    take = per_shop * 7 * SHOPS
    surplus = week - take
    chip = (f'<span class="chip ok" data-tip="Surplus a week, for export">+{n(surplus)}</span>' if surplus >= 0
            else f'<span class="chip bad" data-tip="Short a week; this line needs more machines">{n(surplus)}</span>')
    return covers(week, per_shop), f'<span class="sub">shops take {n(take)} · {chip}</span>'


def squares(m: int) -> str:
    return "".join('<i class="on"></i>' for _ in range(min(m, 12))) + (f"<em>+{m - 12}</em>" if m > 12 else "")


def step(m: int) -> str:
    return (f'<span class="step"><a href="#" data-d="-1" aria-label="one machine fewer">−</a><b>{m}</b>'
            f'<a href="#" data-d="1" aria-label="one machine more">+</a><span class="machines">{squares(m)}</span></span>')


def ing_list(week: float, parts: list[tuple[str, float]]) -> str:
    return ", ".join(f"<b>{n(week * f)}</b> {name}" for name, f in parts)


def main_line(name: str, m: int, rate: int, station: str, kit: str, parts: list[tuple[str, float]]) -> str:
    wk = m * rate * 24 * 7
    cov, sub = supplies(wk, PER_SHOP)
    return f"""<tr class="line" data-m="{m}" data-rate="{rate}">
      <td class="l">{name}<span class="sub" data-tip="One {station} is {kit}; one makes {n(rate * 24)} a day">{rate}/h rated · {station}</span></td>
      <td class="l">{step(m)}</td>
      <td class="made">{n(wk)}</td><td class="covers">{cov}{sub}</td><td class="l"><span class="ing">{ing_list(wk, parts)}</span></td></tr>"""


def umbrella_line(rate_typed: int, focus: bool = False, hidden: bool = False) -> str:
    m, rate = 1, 100
    wk = m * rate * 24 * 7
    cov, sub = supplies(wk, rate_typed)
    cls = "line pc-added" + (" pc-out" if hidden else "")
    af = " autofocus" if focus else ""
    return f"""<tr class="{cls}" data-m="{m}" data-rate="{rate}" data-pc="umbrella">
      <td class="l">Umbrella<button type="button" class="pc-x" aria-label="Remove Umbrella from the range" data-tip="Remove from the range">{ICON_X}</button><span class="sub" data-tip="One Consumergoods Workstation is Consumer Goods Assembly Machine + Laser Cutting Machine; one makes 2,400 a day">100/h rated · Consumergoods Workstation</span></td>
      <td class="l">{step(m)}</td>
      <td class="made">{n(wk)}</td><td class="covers"><span class="pc-cov">{cov}</span><span class="pc-sub">{sub}</span>
        <span class="pc-rate"><label><input type="number" min="0" step="10" value="{rate_typed}" aria-label="Umbrellas a shop sells a day, your estimate" data-pc-rate{af}>/shop/day</label>·<em data-tip="Your Florists do not sell umbrellas yet, so this rate is yours, not measured. It starts at {PER_SHOP} a shop, what they sell of a flower, times the game's 75% weight">your estimate</em></span></td>
      <td class="l"><span class="ing">{ing_list(wk, [("Metal Wire", 1.0), ("Plastic", 0.5)])}</span></td></tr>"""


def picker(open_: bool, added: set[str]) -> str:
    opts = []
    for name, w, station in SECONDARY:
        on = name in added
        opts.append(
            f'<button type="button" class="pc-opt{" on" if on else ""}" data-pc-pick="{name.lower()}"{" aria-disabled=\"true\"" if on else ""}>'
            f'<span><b>{name}{ICON_TICK if on else ""}</b><small>{station.replace(" Workstation", "")}</small></span>'
            f'<span class="pc-w" aria-hidden="true"><i style="--w:{int(w * 100)}%"></i></span><em>{int(w * 100)}%</em></button>')
    left = len(SECONDARY) - len(added)
    hid = "" if open_ else " hidden"
    return f"""<span class="pc-anchor"><button type="button" class="pc-add" aria-expanded="{"true" if open_ else "false"}" aria-haspopup="true" data-pc-toggle>{ICON_PLUS}Add product<small>{left} more</small></button>
      <div class="pc-pop" role="menu" aria-label="Products a Florist also sells"{hid}>
        <div class="pc-pop-h"><b>A Florist also sells</b><span data-tip="The game's own weight for each at a Florist; a main product is 100%">Weight</span></div>
        {"".join(opts)}
      </div></span>"""


def range_table(added: bool, rate_typed: int = UMBRELLA_DEFAULT, open_: bool = False, focus: bool = False,
                interactive_umbrella: bool = False) -> str:
    rows = [
        main_line("Flower (Cheap)", 2, 100, "Garden Workstation", "Food Assembly Machine + Hydroponic Planter",
                  [("Seeds (Flower Cheap)", 1.0), ("Water", 1.0)]),
        main_line("Flower (Expensive)", 1, 100, "Garden Workstation", "Food Assembly Machine + Hydroponic Planter",
                  [("Seeds (Flower Expensive)", 1.0), ("Water", 1.0)]),
    ]
    if added or interactive_umbrella:
        rows.append(umbrella_line(rate_typed, focus=focus, hidden=not added))
    taken = {"Umbrella"} if added else set()
    return f"""<table class="pc-range" data-pershop="{PER_SHOP}" data-shops="{SHOPS}" data-peak="{PEAK}" data-products="2">
      <thead><tr><th>Product</th><th class="l">Machines</th><th>Made / week</th><th>Supplies</th><th class="l">Raw material / week</th></tr></thead>
      <tbody>{"".join(rows)}
      <tr class="pc-addrow"><td class="l" colspan="5">{picker(open_, taken)}</td></tr></tbody>
    </table>"""


# --------------------------------------------------------------------------
# page chrome: the shipped sidebar and the view row (PR #169)
# --------------------------------------------------------------------------
def sidebar() -> str:
    return f"""<nav class="sd" id="mast" aria-label="Main">
  <div class="sd-in" id="sdIn">
    <div class="sd-head" id="sdHead">
      <div class="brand" id="brand"><span class="wordmark" id="title">{COMPANY}</span><span class="dot"></span></div>
    </div><button type="button" class="ss-q" id="ssField" aria-label="Search the board"><span class="ss-lens"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path></svg></span><span class="ss-ql">Search the board</span><span class="ss-kbd" aria-hidden="true">/</span></button>
    <div class="sd-areas" id="nav"><a href="#overview"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"></path></svg><span>Overview</span></a><a href="#businesses"><svg viewBox="0 0 24 24"><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"></path><path d="M14 10h5a1 1 0 0 1 1 1v10M4 21h17M8 8h2M8 12h2M8 16h2M17 14h1M17 18h1"></path></svg><span>Businesses</span><svg class="nx-i sd-cv" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg></a><a href="#supply"><svg viewBox="0 0 24 24"><path d="M3.5 8.5 12 4l8.5 4.5v8L12 21l-8.5-4.5z"></path><path d="M3.5 8.5 12 13l8.5-4.5M12 13v8"></path></svg><span>Supply</span><svg class="nx-i sd-cv" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg></a><a href="#staffing"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path><circle cx="17" cy="9" r="2.5"></circle><path d="M15.5 14.5a5 5 0 0 1 6 5"></path></svg><span>Staffing</span><svg class="nx-i sd-cv" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg></a><a href="#expansion" class="on sd-open" aria-current="page"><svg viewBox="0 0 24 24"><path d="M4 18 10 12l4 4 6-7"></path><path d="M15 9h5v5"></path></svg><span>Expansion</span><svg class="nx-i sd-cv" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg></a><nav class="nx-local" id="localNav" aria-label="Expansion views"><a href="#expansion/demand">Demand</a><a href="#expansion/finder">Find a location</a><a href="#expansion/open">Open a store</a><a href="#expansion/factory" class="on" aria-current="page">Plan a factory</a></nav></div>
    <div class="sd-refs" id="navRefs" role="group" aria-label="Reference"><a href="#map"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"></path><circle cx="12" cy="10" r="2"></circle></svg><span>City map</span></a><a href="#wiki"><svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"></path><path d="M4 20.5V5.5M20 18v3H6.5"></path><path d="M9 8h7M9 11.5h5"></path></svg><span>Wiki</span></a></div>
    <div class="sd-foot">
      <div class="clock tr" id="clock"><b>Day 142<i>·</i>Wed 14:20</b><small>YEAR 3</small></div>
      <div class="sd-row" id="sdRow">
        <button type="button" class="sd-ib" aria-label="More"><svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="18" cy="12" r="1.4"></circle></svg></button>
        <button type="button" class="sd-ib sd-tog" aria-label="Collapse the sidebar"><svg class="nx-i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect><path d="M9 4.5v15"></path></svg></button>
      </div>
    </div>
  </div>
</nav>"""


def view_row() -> str:
    owned = ["Coffee Shop", "Florist", "Gift Shop", "Supermarket"]
    segs = "".join(f'<a href="#" class="{"on" if t == TYPE else ""}">{t}</a>' for t in owned)
    return f"""<div class="nx-localrow" id="localRow"><div class="nx-ctl" id="viewCtl"><div class="sechead"><h2 class="nx-sr">Plan a factory</h2>
        <span class="why" data-tip="Every machine runs 24 hours at its rated rate, so a line makes its full quantity whether or not the shelves need it." tabindex="0"><i>?</i></span>
        <div class="aside" id="planPicker"><span class="seg" id="planTypes">{segs}</span><span class="field" style="margin:0"><select aria-label="Another business type">
        <option value="" selected="" disabled="">Another type…</option><option>Bookstore · 6</option><option>Clothing Store · 8</option><option>Jewelry Store · 4</option></select></span><a class="link xl-guide" href="#">Wiki page ›</a></div></div></div></div>"""


def stats() -> str:
    return """<div class="planstats">
      <div class="planstat"><span class="lab">Machines</span><div class="v">4</div></div>
      <div class="planstat"><span class="lab">Made / week</span><div class="v"><span>67,200</span><small>units</small></div></div>
      <div class="planstat"><span class="lab">Raw material / week</span><div class="v"><span>126,000</span><small>units to import</small></div></div>
    </div>"""


def ing_section() -> str:
    rows = [
        ("Water", "Flower (Cheap), Flower (Expensive)", 50400, "50,400", ""),
        ("Seeds (Flower Cheap)", "Flower (Cheap)", 33600, "33,600", ""),
        ("Seeds (Flower Expensive)", "Flower (Expensive)", 16800, "16,800", ""),
        ("Metal Wire", "Umbrella", 16800, None, "+16,800"),
        ("Plastic", "Umbrella", 8400, None, "+8,400"),
    ]
    body = "".join(
        f'<tr><td class="l">{name}</td><td class="l"><span class="usedby">{by}</span></td>'
        f"<td>{n(wk / 7)}</td><td class=\"wk\">{n(wk)}</td><td><span class=\"set\">{n(wk)}</span></td>"
        f"<td>{order if order else '<span class=\"quiet\">not ordered</span>'}</td>"
        f'<td class="chg">{f"<span class=\"chip warn\" data-tip=\"No contract yet, so this is the whole order to place\">{chg}</span>" if chg else ""}</td>'
        f'<td class="cash"></td></tr>'
        for name, by, wk, order, chg in rows)
    return f"""<section class="sec rv in" id="secIngredients">
      <div class="sechead"><h2>Ingredients</h2><span class="why" data-tip="What the machines above eat, added up across every line that shares an ingredient." tabindex="0"><i>?</i></span></div>
      <div class="scrollx"><table class="ingtable nocash">
        <thead><tr><th>Ingredient</th><th class="l">Used by</th><th>Per day</th><th>Per week</th><th>Company target</th><th>On order now</th><th class="chg">Change</th><th class="cash">Cash / week</th></tr></thead>
        <tbody>{body}</tbody>
        <tfoot><tr><td class="l">Total</td><td></td><td>18,000</td><td>126,000</td><td>126,000</td><td></td><td class="chg"></td><td class="cash"></td></tr></tfoot>
      </table></div>
    </section>"""


def main_board() -> str:
    kit = "Machines to buy: Food Assembly Machine ×3, Hydroponic Planter ×3, Consumer Goods Assembly Machine ×1, Laser Cutting Machine ×1 · 8 in all"
    return f"""<div class="sd-app" id="sdApp" style="height:100%">
{sidebar()}
<div class="wrap">
  {view_row()}
  <div class="page" id="pageGrowth">
    <section class="sec rv in" id="secPlan"><div id="planBody">
      {stats()}
      {range_table(added=True, interactive_umbrella=True)}
      <p class="quiet" style="margin:12px 0 0">{kit}</p>
    </div></section>
    {ing_section()}
  </div>
</div>
</div>"""


def states_board() -> str:
    def band(label: str, text: str, table: str, tall: bool = False) -> str:
        return f'<div class="pc-state{" tall" if tall else ""}"><div><b>{label}</b><p>{text}</p></div><div>{table}</div></div>'
    return f"""<div class="pc-states">
  {band("1 · Closed", "The main products, as today. One quiet row under them.", range_table(added=False))}
  {band("2 · Open", "The type's other products, the game's weight beside each. One click adds a line.", range_table(added=False, open_=True), tall=True)}
  {band("3 · Added, rate typed", "A line like the others. The rate is the player's: blue, editable, said once. × takes the line out again.", range_table(added=True, rate_typed=40, focus=False))}
  {band("4 · Picker after one add", "An added product stays in the list, ticked; the count drops.", range_table(added=True, open_=True), tall=True)}
</div>"""


# --------------------------------------------------------------------------
# interaction: open and close the picker, add and remove the umbrella, live rate
# --------------------------------------------------------------------------
WIRE = r"""
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    const fmt = v => Math.round(v).toLocaleString('en-US');
    const SHOPS = 4, PEAK = 1.09;
    const recalc = tr => {
      const inp = tr.querySelector('[data-pc-rate]'); if (!inp) return;
      const per = Math.max(0, +inp.value || 0), wk = (+tr.dataset.m) * (+tr.dataset.rate) * 24 * 7;
      const take = per * 7 * SHOPS, surplus = wk - take;
      const c = per ? wk / 7 / (per * PEAK) : null;
      tr.querySelector('.pc-cov').textContent = c === null ? '—' : c.toFixed(1) + (c.toFixed(1) === '1.0' ? ' shop' : ' shops');
      tr.querySelector('.pc-sub').innerHTML = per ? '<span class="sub">shops take ' + fmt(take) + ' · <span class="chip ' + (surplus >= 0 ? 'ok">+' : 'bad">') + fmt(surplus) + '</span></span>' : '';
    };
    const count = tbl => {
      const on = $$('tr.pc-added:not(.pc-out)', tbl).length;
      const sm = tbl.querySelector('.pc-add small'); if (sm) sm.textContent = (5 - on) + ' more';
      $$('.pc-opt[data-pc-pick="umbrella"]', tbl).forEach(o => {
        o.classList.toggle('on', !!on);
        if (on) o.setAttribute('aria-disabled', 'true'); else o.removeAttribute('aria-disabled');
        o.querySelector('em').style.color = '';
      });
    };
    $$('[data-pc-toggle]').forEach(b => b.addEventListener('click', () => {
      const pop = b.parentElement.querySelector('.pc-pop'), open = pop.hidden;
      pop.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false');
    }));
    $$('.pc-opt').forEach(o => o.addEventListener('click', () => {
      const tbl = o.closest('table'), pop = o.closest('.pc-pop');
      if (o.dataset.pcPick === 'umbrella') {
        const tr = tbl.querySelector('tr.pc-added');
        if (tr && tr.classList.contains('pc-out')) { tr.classList.remove('pc-out'); recalc(tr); }
      }
      pop.hidden = true; const b = tbl.querySelector('[data-pc-toggle]'); if (b) b.setAttribute('aria-expanded', 'false');
      count(tbl);
    }));
    $$('.pc-x').forEach(x => x.addEventListener('click', () => {
      const tr = x.closest('tr'); tr.classList.add('pc-out'); count(tr.closest('table'));
    }));
    $$('[data-pc-rate]').forEach(i => i.addEventListener('input', () => recalc(i.closest('tr'))));
    $$('.step a').forEach(a => a.addEventListener('click', e => {
      e.preventDefault(); const tr = a.closest('tr'), m = Math.max(0, Math.min(12, +tr.dataset.m + +a.dataset.d));
      tr.dataset.m = m; tr.querySelector('.step b').textContent = m;
      tr.querySelector('.machines').innerHTML = '<i class="on"></i>'.repeat(m);
      const wk = m * (+tr.dataset.rate) * 24 * 7; tr.querySelector('.made').textContent = fmt(wk);
      if (tr.querySelector('[data-pc-rate]')) recalc(tr);
    }));
"""

LOGIC = ("class Component extends DCLogic {\n"
         "  renderVals() { const dark = this.props.dark ?? true;\n"
         "    try { document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light'); } catch (e) {}\n"
         "    return { theme: dark ? 'dark' : 'light' }; }\n"
         "  componentDidMount() {" + WIRE + "  }\n}")

PAGE = """<!doctype html>
<html lang="en" data-theme="dark">
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
<div class="pc-board" data-theme="{{theme}}" style="width: __W__px; height: __H__px; background: var(--ground); color: var(--ink);">
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
<html lang="en" data-theme="__THEME__"><head><meta charset="utf-8"><title>__TITLE__</title>
<link rel="stylesheet" href="__FONTS__"><style>__CSS__</style></head>
<body><div class="pc-board" style="width: __W__px; height: __H__px; background: var(--ground); color: var(--ink);">
__BODY__
</div>
<script>window.addEventListener('load', function () {__WIRE__});</script></body></html>
"""

W = 1440
# file, title, builder, width, height
BOARDS = [
    ("Main.dc.html", "A · Plan a factory, Umbrella added to a Florist range", main_board, W, 1080),
    ("States.dc.html", "B · Add product: closed, open, added, after one add", states_board, W, 1900),
]
TIPS = {
    "Main.dc.html": "Florist, four shops. The flowers are the main products; Umbrella was added from “Add product”. Type a rate in its Supplies cell, step its machines, × removes it, “Add product” brings it back. Metal Wire and Plastic are the added line's raw material, new orders in Ingredients.",
    "States.dc.html": "The range alone in each state. The picker lists what a Florist “can additionally sell”, by the game's weight.",
}


def css() -> str:
    return board_css() + PC_CSS


def build(preview: bool = False) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    style = css()
    boards, order, notes = {}, [], {}
    y = 0
    for name_, title, builder, w, h in BOARDS:
        body = builder()
        props = {"dark": {"editor": "boolean", "default": True, "section": "Theme"}, "$preview": {"width": w, "height": h}}
        page_ = (PAGE.replace("__TITLE__", "Add product: " + title).replace("__FONTS__", FONTS.replace("&", "&amp;"))
                 .replace("__CSS__", style).replace("__W__", str(w)).replace("__H__", str(h))
                 .replace("__BODY__", body)
                 .replace("__PROPS__", json.dumps(props, separators=(",", ":"), ensure_ascii=False).replace("'", "&#39;"))
                 .replace("__LOGIC__", LOGIC))
        (ROOT / name_).write_text(page_, encoding="utf-8", newline="\n")
        if preview:
            out = HERE / "_preview"
            out.mkdir(exist_ok=True)
            for theme in ("dark", "light"):
                (out / f"{name_.split('.')[0]}-{theme}.html").write_text(
                    PREVIEW.replace("__TITLE__", title).replace("__FONTS__", FONTS.replace("&", "&amp;")).replace("__CSS__", style)
                    .replace("__THEME__", theme).replace("__W__", str(w)).replace("__H__", str(h))
                    .replace("__BODY__", body).replace("__WIRE__", WIRE),
                    encoding="utf-8", newline="\n")
        boards[name_] = {"x": 0, "y": y, "w": w, "h": h, "title": title, "is_interactive": True}
        order.append(name_)
        notes["try-" + name_.split(".")[0].lower()] = {"x": W + 120, "y": y, "w": 420, "maxH": 260, "text": TIPS[name_]}
        y += h + 160
    index = {"v": 3, "createdOnFiles": {"v": 1, "at": CREATED_AT}, "title": "Plan a factory: add product", "launch": {"view": "canvas"},
             "pages": [], "boards": boards, "order": order, "notes": notes, "designSystems": []}
    (ROOT / "canvas.json").write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8", newline="\n")
    print("wrote", len(order), "artboards")


if __name__ == "__main__":
    build("--preview" in sys.argv)
