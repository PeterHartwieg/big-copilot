"""Generates the floor-plans canvas (issue #70): project/*.dc.html and project/canvas.json.

The Map page's "Find a location" finder shows each building's floor plan in the empty map
area left of its panel. The plans are the game's own layout prefabs, drawn top-down by
research/floor-plans/render_plans.py (main checkout), copied to plans/ and turned into
small vector paths by make_plans.py (plans.json). Decisions and open questions: NOTES.md.

The board's stylesheet is borrowed from mockup/revamp/build_canvas.py and the finder's own
from web/map.css, so the mockup is the shipped finder plus what is new; every class added
here carries the lp- prefix (layout plan), which nothing on the board uses yet.

Sample figures (traffic, demand, rent) are the HART. YT day-20 save the find-location
canvas used (mockup/find-location/data.json). Which version of a size each address has is
not in any shipped file yet (the owner step of issue #70 adds `v`), so the generator picks
one per address by a stable hash; the plans themselves are real.

The canvas is published at https://claude.ai/artifact/QFNRZLS49MUh1t7jCN7uKF (Design type); republish
project/ with that url. The stage backdrop is project/stage.jpg, rendered from web/maps/map-background.svg by
render_backdrop.cjs. Never hand-edit project/: change this and rerun. `--preview` also
writes plain HTML copies to _preview/ (both themes) for a browser; do not commit _preview/.
"""
from __future__ import annotations

import html
import json
import shutil
import sys
import zlib
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE / "project"
REPO = HERE.parent.parent
sys.path.insert(0, str(HERE.parent / "revamp"))
from build_canvas import CSS as BOARD_CSS, ICON  # noqa: E402

CREATED_AT = "2026-09-25T09:00:00Z"
FONTS = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"

PLANS = json.loads((HERE / "plans.json").read_text(encoding="utf-8"))
DATA = json.loads((REPO / "mockup" / "find-location" / "data.json").read_text(encoding="utf-8"))
LOC = {b["key"]: b for b in json.loads((REPO / "web" / "maps" / "locations.json").read_text(encoding="utf-8"))["buildings"]}
MAP_CSS = (REPO / "web" / "map.css").read_text(encoding="utf-8")

ICON = dict(ICON)
ICON.update({
    "map": '<svg viewBox="0 0 24 24"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"></path><circle cx="12" cy="10" r="2"></circle></svg>',
    "x": '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"></path></svg>',
    "home": '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"></path></svg>',
    "full": '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"></path></svg>',
    "pinned": '<svg viewBox="0 0 24 24"><path d="M9 4h6l-1 6 3 3v2H7v-2l3-3z"></path><path d="M12 15v5"></path></svg>',
    "plan": '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1"></rect><path d="M4 11h7v9M11 4v4M15 11h5"></path></svg>',
    "layers": '<svg viewBox="0 0 24 24"><path d="m12 4 8 4-8 4-8-4z"></path><path d="m4 12 8 4 8-4M4 16l8 4 8-4"></path></svg>',
})

# --------------------------------------------------------------------------
# the world the stage pans over (stage.jpg), in step with render_backdrop.cjs
# --------------------------------------------------------------------------
WORLD = {"x": 960, "y": 690, "z": 3.2, "w": 2240, "h": 1344}
STAGE_W, STAGE_H = 1180, 720
FREE_W = STAGE_W - 16 - 485          # the map area left of the panel
TARGET = (205, 205)                  # where a picked footprint's centre lands
PHONE_TARGET = (195, 150)
HOOD_TAG = {"Garment District": "GD", "Hell's Kitchen": "HK", "Industry City": "IC", "Lower Manhattan": "LM",
            "Midtown": "MT", "Murray Hill": "MH", "The Hamptons": "HA"}
KIND_LABEL = {"retail": "Retail", "office": "Office", "warehouse": "Warehouse"}
VERSIONS = {
    "retail": {"A": ["A1", "A2"], "C": ["C1", "C2"], "D": ["D2"], "M": ["M1"]},
    "office": {"A": ["A3"], "C": ["C1", "C2"], "D": ["D2"], "J": ["J1"], "K": ["K1"]},
    "warehouse": {s: [f"{s}1", f"{s}2", f"{s}3"] for s in "HIPQ"},
}
M2 = {"retail": {"A": 75, "C": 225, "D": 285, "M": 1000}, "office": {"A": 75, "C": 225, "D": 285, "J": 285, "K": 660},
      "warehouse": {"H": 690, "I": 1292, "P": 2184, "Q": 2610}}
CAPS = DATA["caps"]


def esc(s: str) -> str:
    return html.escape(str(s), quote=True)


def money(v: float) -> str:
    return "$" + f"{round(v):,}"


def version(b: dict) -> str | None:
    opts = VERSIONS.get(b["type"], {}).get(b["size"])
    if not opts:
        return None
    return opts[zlib.crc32((b["key"] + "a").encode()) % len(opts)]


def dims(key: str) -> tuple[float, float]:
    w, h = PLANS[key]["px"]
    return round((w - 48) / 24, 1), round((h - 48) / 24, 1)


# --------------------------------------------------------------------------
# the plan itself: one path a class, painted in the board's tokens
# --------------------------------------------------------------------------
def plan_svg(key: str, s: float, cls: str = "", attrs: str = "") -> str:
    """The plan at s pixels a metre. The PNGs carry a metre of margin; half of it stays."""
    p = PLANS[key]
    w, h = p["px"]
    vw, vh = w - 24, h - 24
    body = "".join(f'<path class="{c}" d="{p["paths"][c]}"></path>' for c in "fbwnd" if c in p["paths"])
    return (f'<svg class="lp-svg{(" " + cls) if cls else ""}" viewBox="12 12 {vw} {vh}" width="{vw / 24 * s:.1f}" '
            f'height="{vh / 24 * s:.1f}" shape-rendering="crispEdges" role="img" aria-label="Floor plan {esc(key.split("-")[1])}"{attrs}>{body}</svg>')


def fit(key: str, box_w: float, box_h: float, cap: float = 10.0) -> float:
    w, h = PLANS[key]["px"]
    return min(box_w / ((w - 24) / 24), box_h / ((h - 24) / 24), cap)


def scale_bar(s: float) -> str:
    for m in (1, 2, 5, 10, 20, 50):
        if m * s >= 36:
            break
    return f'<span class="lp-scale" aria-label="Scale: {m} metres"><i style="width:{m * s:.1f}px"></i><span>{m} m</span></span>'


def doors_word(kind: str, n: int) -> str:
    if kind == "warehouse":
        return "loading door" if n == 1 else "loading doors"
    return "entrance" if n == 1 else "entrances"


# --------------------------------------------------------------------------
# sample rows: vacant retail in Murray Hill and the Garment District
# --------------------------------------------------------------------------
def best_type(hood: str, cat: str) -> dict:
    rows = [d for d in DATA["demand"][hood] if d["category"] == cat]
    return max(rows, key=lambda d: (d["demand"], -d["providers"]))


def world_centre(b: dict) -> tuple[float, float]:
    x, y, w, h = b["bounds"]
    return (x + w / 2 - WORLD["x"]) * WORLD["z"], (y + h / 2 - WORLD["y"]) * WORLD["z"]


def rows_for(cat: str = "retail") -> list[dict]:
    out = []
    for b in DATA["buildings"]:
        if b["type"] != cat or b["status"] != "vacant" or b["hood"] not in ("Murray Hill", "Garment District"):
            continue
        cx, cy = world_centre(b)
        if not (TARGET[0] <= cx <= WORLD["w"] - (STAGE_W - TARGET[0]) and TARGET[1] <= cy <= WORLD["h"] - (STAGE_H - TARGET[1])):
            continue
        t = best_type(b["hood"], cat)
        lay = version(b)
        out.append({**b, "fit": t["type"], "demand": t["demand"], "rivals": t["providers"],
                    "score": round(b["traffic"] * t["demand"] / 100), "layout": lay, "plan": f"{cat}-{lay}" if lay else None,
                    "deposit": b["rent"] * 7 if b["rent"] else None, "cx": cx, "cy": cy,
                    "id": b["key"].split(":")[1].replace("#", "-").replace("_", "")})
    out.sort(key=lambda r: (-r["score"], -r["traffic"]))
    return out[:11]


ROWS = rows_for()
PICK = next(r for r in ROWS if r["address"] == "54 Fifth Avenue") if any(r["address"] == "54 Fifth Avenue" for r in ROWS) else ROWS[0]


def shade(t: float, top: int) -> str:
    return f"background:color-mix(in oklab, var(--accent) {round(4 + max(0, min(1, t)) * (top - 4))}%, var(--surface))"


def row_list(rows: list[dict], pick: dict | None, *, pins: tuple = (), no_plan: str = "", start: int = 0, head_row: bool = True) -> str:
    head = ('<div class="fhead"><span>#</span><span></span><span>Address</span><span class="on" data-s="score">Score</span>'
            '<span data-s="traffic">Traffic</span><span data-s="demand">Demand</span><span data-s="m2">m²</span><span data-s="cap">Cap</span><span data-s="deposit">Upfront</span></div>')

    def scale(vals):
        lo, hi = min(vals), max(vals)
        return lambda v: (v - lo) / (hi - lo) if hi > lo else 0
    sc, tr, dm = scale([r["score"] for r in rows]), scale([r["traffic"] for r in rows]), scale([r["demand"] for r in rows])
    out = []
    for i, r in enumerate(rows):
        lay = None if r["key"] == no_plan else r["layout"]
        tag = f'<span class="lp-tag">{lay}</span>' if lay else ""
        sub = f'{tag}best fit: {esc(r["fit"])} · {r["rivals"]} rival{"" if r["rivals"] == 1 else "s"}'
        on = pick is not None and r["key"] == pick["key"]
        pin = f'<span class="lp-pinmark" data-pinmark="{r["id"]}"{"" if r["id"] in pins else " hidden"}>{ICON["pinned"]}</span>'
        out.append(
            f'<button type="button" class="place fr{" on" if on else ""}" data-row="{r["id"]}" data-layout="{lay or ""}" aria-pressed="{"true" if on else "false"}">'
            f'<span class="rk"><i></i>{start + i + 1}</span><span class="hood">{HOOD_TAG[r["hood"]]}</span>'
            f'<span class="nm">{esc(r["address"])}{pin}<small>{sub}</small></span>'
            f'<span class="v sc sh" style="{shade(sc(r["score"]), 46)}">{r["score"]}</span>'
            f'<span class="v sh" style="{shade(tr(r["traffic"]), 18)}">{r["traffic"]}</span>'
            f'<span class="v sh" style="{shade(dm(r["demand"]), 18)}">{r["demand"]}</span>'
            f'<span class="v m2">{r["m2"]:,}</span><span class="v cap">{r["cap"]}</span>'
            f'<span class="v dep">{money(r["deposit"]) if r["deposit"] else "—"}</span></button>')
    return (head if head_row else "") + "".join(out)


def filters(*, kind: str = "retail", layout_chip: str = "") -> str:
    def row(label, body, cls=""):
        return f'<div class="frow{cls}"><span class="lab">{label}</span>{body}</div>'
    kinds = "".join(f'<button type="button" class="fchip cat{" on" if c == kind else ""}" aria-pressed="{"true" if c == kind else "false"}">{l}</button>'
                    for c, l in (("retail", "Retail"), ("office", "Office"), ("warehouse", "Warehouse"), ("cinema", "Cinema"), ("theater", "Theater")))
    shows = "".join(f'<button type="button" class="fchip show{" on" if k == "rent" else ""}">{l}<b>{n}</b></button>'
                    for k, l, n in (("rent", "To rent", 61), ("takeover", "To take over", 38), ("sale", "For sale", 12)))
    hoods = "".join(f'<button type="button" class="fchip hd{" on" if t in ("GD", "MH") else ""}" data-tip="{esc(h)}">{t}</button>'
                    for h, t in HOOD_TAG.items())
    lay = (f'{row("Layout", layout_chip)}' if layout_chip else "")
    return f"""<div class="filters">
      {row("Kind", kinds)}
      {row("Type", '<label class="fsel"><select aria-label="Business type"><option>Any type</option></select><i class="fchev">' + ICON["chev"] + '</i></label>')}
      {row("Show", shows + '<span class="why"><i>?</i></span>')}
      {row("Where", hoods)}
      {row("Size", '<label class="fchip num">min<input type="number" value="0" aria-label="Smallest floor area"><b>m²</b></label><label class="fchip num">max<input type="number" value="0" aria-label="Largest floor area"><b>m²</b></label>')}
      {lay}
      {row("Saved", '<span class="fsaved"><span class="fsave"><button type="button" class="fchip fnew">' + ICON["plus"] + 'Save</button></span></span>', " fsaves")}
    </div>"""


# --------------------------------------------------------------------------
# the stage: the map world, footprints, the site card, the finder chrome
# --------------------------------------------------------------------------
def footprints(rows: list[dict], pick: dict | None) -> str:
    vb = f'{WORLD["x"]} {WORLD["y"]} {WORLD["w"] / WORLD["z"]:.2f} {WORLD["h"] / WORLD["z"]:.2f}'
    ps = []
    for r in rows:
        loc = LOC.get(r["key"])
        if not loc:
            continue
        cls = "fp cand" + (" sel" if pick and r["key"] == pick["key"] else "")
        ps.append(f'<path class="{cls}" data-fp="{r["id"]}" d="{loc["path"]}" fill-rule="evenodd"></path>')
    return f'<svg class="lp-fps" viewBox="{vb}" width="{WORLD["w"]}" height="{WORLD["h"]}" xmlns="http://www.w3.org/2000/svg">{"".join(ps)}</svg>'


def site_card(r: dict, target: tuple, *, shown: bool, no_plan: bool = False) -> str:
    x, y, w, h = r["bounds"]
    fw, fh = w * WORLD["z"], h * WORLD["z"]
    left = target[0] + fw / 2 + 14
    top = max(16, target[1] - fh / 2 - 6)
    size = r["size"]
    lay = "" if no_plan or not r["layout"] else f' · layout {r["layout"]}'
    return f"""<div class="site lp-site{" in" if shown else ""}" data-site="{r["id"]}" style="left:{left:.0f}px;top:{top:.0f}px"><span class="tail"></span><button type="button" class="x" aria-label="Close">{ICON["x"]}</button>
      <h3>{esc(r["address"])}</h3><div class="sub"><span class="hood">{HOOD_TAG[r["hood"]]}</span>{esc(r["hood"])} · Retail, size {size}{lay}</div>
      <div class="nums"><div class="num"><b class="sc">{r["score"]}</b><span>Score</span></div><div class="num"><b>{r["traffic"]}</b><span>Traffic</span></div><div class="num"><b>{r["demand"]}</b><span>Demand</span></div></div>
      <div class="st"><i></i>To rent</div>
      <div class="facts"><span>Floor<b>{r["m2"]:,} m²</b></span><span>Cap<b>{r["cap"]}</b></span><span>Est. rent<b>{money(r["rent"])}</b></span><span>Upfront<b>{money(r["deposit"])}</b></span></div>
      <div class="fit">Best fit: <b>{esc(r["fit"])}</b>, demand {r["demand"]}, {r["rivals"]} rival{"" if r["rivals"] == 1 else "s"}</div></div>"""


def world_shift(r: dict, target: tuple) -> str:
    return f"transform:translate({target[0] - r['cx']:.0f}px,{target[1] - r['cy']:.0f}px)"


def stage(rows: list[dict], pick: dict | None, dock: str, *, no_plan: str = "", target=TARGET, phone: bool = False, extra: str = "") -> str:
    shift = world_shift(pick or rows[0], target)
    cards = "".join(site_card(r, target, shown=pick is not None and r["key"] == pick["key"], no_plan=r["key"] == no_plan) for r in rows)
    zoom = (f'<div class="zoomer"><button type="button" class="ibtn" aria-label="Zoom in">+</button><button type="button" class="ibtn" aria-label="Zoom out">−</button>'
            f'<button type="button" class="ibtn" aria-label="Whole city">{ICON["home"]}</button>'
            + ("" if phone else f'<button type="button" class="ibtn" aria-label="Full screen">{ICON["full"]}</button>') + '</div>')
    return f"""<div class="stage panel finder lp-stage" data-stage>
      <div class="lp-world" data-world style="{shift}"><img src="stage.jpg" alt="" width="{WORLD["w"]}" height="{WORLD["h"]}">{footprints(rows, pick)}</div>
      <div class="layer lp-layer">{cards}</div>
      <div class="fswitch"><button type="button" class="ibtn" aria-pressed="true">{ICON["pin"]}<span>Find a location</span></button></div>
      {extra}
      {dock}
      {zoom}
    </div>"""


def finder(rows, pick, dock, *, no_plan="", layout_chip="", pins=(), mode="") -> str:
    return f"""<div class="city-map finder lp-finder" data-finder data-mode="{mode}" data-pick="{pick["id"] if pick else ""}" data-target="{TARGET[0]},{TARGET[1]}">
  <div class="citymap">
    {stage(rows, pick, dock, no_plan=no_plan)}
    <aside class="places" aria-label="Premises found">{filters(layout_chip=layout_chip)}<div class="list">{row_list(rows, pick, pins=pins, no_plan=no_plan)}</div></aside>
  </div>
</div>"""


def rows_json(rows, no_plan="") -> str:
    """What the page script needs a row: its footprint centre, and its plan in metres."""
    out = {}
    for r in rows:
        plan = None if r["key"] == no_plan else r["plan"]
        out[r["id"]] = {"cx": round(r["cx"]), "cy": round(r["cy"]), "plan": plan, "layout": None if not plan else r["layout"],
                        "m": list(dims(plan)) if plan else None}
    return esc(json.dumps(out, separators=(",", ":")))


# --------------------------------------------------------------------------
# the plan card, docked bottom-left in the map area
# --------------------------------------------------------------------------
def plan_card(r: dict, *, picked: bool, shown: bool, pin: bool = False) -> str:
    key = r["plan"]
    s = fit(key, 212, 178)
    p = PLANS[key]
    kind = key.split("-")[0]
    size = r["layout"][0]
    wm, hm = dims(key)
    pin_btn = (f'<button type="button" class="lp-pinbtn" data-pin="{r["id"]}" aria-pressed="false">{ICON["pinned"]}<span>Pin to compare</span></button>' if pin else "")
    return f"""<div class="lp-card{"" if shown else " lp-off"}" data-card="{r["id"]}">
      <div class="lp-box">{plan_svg(key, s)}</div>
      <div class="lp-side">
        <div class="lp-state"><i></i><span data-when="pick">Picked</span><span data-when="hover">Hovered</span><span class="why lp-why" tabindex="0" data-tip="{LEGEND_TIP}"><i>?</i></span></div>
        <div class="lp-code"><b>{r["layout"]}</b><span>{KIND_LABEL[kind]}, size {size}</span></div>
        <div class="lp-addr">{esc(r["address"])}</div>
        <div class="lp-nums">
          <div><b>{M2[kind][size]:,}</b><span>m²</span></div>
          <div><b>{CAPS[kind][size] if isinstance(CAPS[kind].get(size), int) else "—"}</b><span>cap</span></div>
          <div><b>{p["doors"]}</b><span>{doors_word(kind, p["doors"])}</span></div>
        </div>
        <p class="lp-hint2">Hover any row to see its layout here.</p>
        <div class="lp-foot">{scale_bar(s)}<span class="lp-dim">{wm:g} × {hm:g} m</span></div>
        {pin_btn}
      </div>
    </div>"""


LEGEND_TIP = ("The game's own layout for this building, from above. Grey lines are walls, blue windows, green doors; "
              "a green door on the outside wall is an entrance. m² and cap are the game's figures for the size; "
              "the outline is the outside of the walls. The top of the plan is not necessarily north or the street.")


def dock_single(rows, pick, *, no_plan="", pin=False) -> str:
    cards = "".join(plan_card(r, picked=True, shown=pick is not None and r["key"] == pick["key"] and r["key"] != no_plan, pin=pin)
                    for r in rows if r["plan"] and r["key"] != no_plan)
    return f'<div class="lp-dock" data-dock>{cards}</div>'


# --------------------------------------------------------------------------
# option A: pinned plans side by side, one shared scale
# --------------------------------------------------------------------------
def tray(rows, pinned: list[dict], live: dict) -> str:
    keys = [r["plan"] for r in pinned + [live]]
    s = min(fit(k, 150, 150, 8) for k in keys)

    def slot(r, *, is_pin):
        wm, hm = dims(r["plan"])
        kind, size = r["plan"].split("-")[0], r["layout"][0]
        return f"""<div class="lp-slot{" pinned" if is_pin else " live"}" data-slot="{r["id"]}"{"" if is_pin else ' data-live'}>
          <div class="lp-slotbox">{plan_svg(r["plan"], s, attrs=f' data-m="{wm},{hm}"')}</div>
          <div class="lp-slothead"><b>{r["layout"]}</b><span>{esc(r["address"])}</span>
            {'<button type="button" class="lp-unpin" data-unpin="' + r["id"] + '" aria-label="Unpin ' + esc(r["address"]) + '">' + ICON["x"] + '</button>' if is_pin else '<button type="button" class="lp-pinbtn sm" data-pinlive aria-label="Pin this plan">' + ICON["pinned"] + '<span>Pin</span></button>'}</div>
          <div class="lp-slotnums"><span><b>{M2[kind][size]:,}</b> m²</span><span><b>{CAPS[kind][size]}</b> cap</span><span><b>{r["score"]}</b> score</span></div>
        </div>"""
    slots = "".join(slot(r, is_pin=True) for r in pinned) + slot(live, is_pin=False)
    # every other row's plan waits here, hidden, so a pin or a hover can bring it in
    spares = "".join(f'<template data-spare="{r["id"]}">{slot(r, is_pin=False)}</template>' for r in rows if r["plan"])
    return f"""<div class="lp-dock lp-traydock" data-dock data-tray>
      <div class="lp-tray">
        <div class="lp-trayhead"><span class="lp-lab">{ICON["plan"]}Plans at one scale</span><span class="lp-traynote" data-traynote>{len(pinned)} pinned · up to 3</span>{scale_bar(s).replace('class="lp-scale"', 'class="lp-scale" data-trayscale')}</div>
        <div class="lp-slots" data-slots data-s="{s:.3f}">{slots}</div>
      </div>{spares}
    </div>"""


# --------------------------------------------------------------------------
# option B: the kind's layouts on one shelf, one shared scale
# --------------------------------------------------------------------------
def shelf(kind: str, rows, pick, *, box_h=150, wrap=False, counts=None) -> str:
    keys = [f"{kind}-{c}" for c in (l for size in VERSIONS[kind].values() for l in size)]
    tallest = max(dims(k)[1] for k in keys)
    widest_sum = sum(dims(k)[0] for k in keys)
    s = min(box_h / tallest, (FREE_W - 60 - 12 * len(keys)) / widest_sum) if not wrap else box_h / tallest
    counts = counts or {}
    tiles = []
    for k in keys:
        code = k.split("-")[1]
        n = counts.get(code, 0)
        wm, hm = dims(k)
        size = code[0]
        lit = pick is not None and pick["layout"] == code
        tiles.append(f"""<button type="button" class="lp-tile{" lit" if lit else ""}{" none" if not n else ""}" data-tile="{code}" aria-pressed="false">
          <span class="lp-tilebox" style="height:{box_h * (1 if not wrap else 1):.0f}px">{plan_svg(k, s)}</span>
          <span class="lp-tilecode"><b>{code}</b>{M2[kind][size]:,} m²</span>
          <span class="lp-tilen">{n or "none"} {"here" if n else ""}</span></button>""")
    return f"""<div class="lp-shelf{" wrap" if wrap else ""}" data-shelf>
      <div class="lp-trayhead"><span class="lp-lab">{ICON["layers"]}{KIND_LABEL[kind]} layouts at one scale</span><span class="lp-traynote">click one to list only it</span>{scale_bar(s)}</div>
      <div class="lp-tiles">{"".join(tiles)}</div></div>"""


# --------------------------------------------------------------------------
# the board around it
# --------------------------------------------------------------------------
NAV = [("today", "Today"), ("results", "Results"), ("supply", "Supply"), ("growth", "Growth"), ("map", "Map"), ("company", "Company")]


def mast() -> str:
    items = "".join(f'<a class="{"on" if k == "map" else ""}" href="#{k}">{ICON[k]}<span>{l}</span></a>' for k, l in NAV)
    return f"""<header class="mast"><div class="brand"><span class="wordmark">Costco</span><span class="dot"></span></div>
  <nav class="nav">{items}</nav>
  <div class="clock"><b>Day 20<i>·</i>Sat 14:00</b><small>YEAR 1 · 6 SITES · 41 STAFF</small></div></header>"""


def desktop(body: str) -> str:
    return f'<div class="wrap">{mast()}<div class="lp-page">{body}</div></div>'


# --------------------------------------------------------------------------
# artboards
# --------------------------------------------------------------------------
def main_board() -> str:
    return desktop(finder(ROWS, PICK, dock_single(ROWS, PICK), mode="single"))


def compare_tray() -> str:
    pinned = [r for r in ROWS if r["plan"] and r["layout"] != PICK["layout"]][:2]
    body = finder(ROWS, PICK, tray(ROWS, pinned, PICK), pins=tuple(r["id"] for r in pinned), mode="tray")
    return desktop(body)


def compare_shelf() -> str:
    counts = {}
    for r in ROWS:
        counts[r["layout"]] = counts.get(r["layout"], 0) + 1
    chip = '<span class="lp-laychips" data-laychips><span class="lp-hint">All layouts</span></span>'
    body = finder(ROWS, PICK, f'<div class="lp-dock lp-shelfdock" data-dock>{shelf("retail", ROWS, PICK, box_h=132, counts=counts)}</div>',
                  layout_chip=chip, mode="shelf")
    wh = shelf("warehouse", [], None, box_h=96, wrap=True, counts={"H1": 1, "H2": 2, "I1": 3, "I2": 1, "I3": 2, "P1": 1, "Q2": 1})
    return desktop(body) + f"""<div class="lp-aside"><div class="lp-asidehead"><b>Warehouse kind</b><span>Twelve layouts wrap onto two rows in the same dock; the scale drops so the longest (Q2, 79 m) fits.</span></div>
      <div class="lp-asidebox">{wh}</div></div>"""


def no_plan_board() -> str:
    lacking = PICK
    body = finder(ROWS, lacking, dock_single(ROWS, lacking, no_plan=lacking["key"]), no_plan=lacking["key"], mode="single")
    return desktop(body)


def legend_board() -> str:
    key = "retail-C1"
    s = 12
    items = [("f", "Floor"), ("w", "Wall"), ("n", "Window"), ("d", "Door: an entrance on the outside wall, else between rooms"),
             ("b", "Bay: no floor, or a block the game did not name (warehouses only; what it is, is unverified)")]
    leg = "".join(f'<li><svg class="lp-svg lp-sw" viewBox="0 0 10 10" width="18" height="18"><path class="{c}" d="M0 0h10v10h-10z"></path></svg><span>{t}</span></li>' for c, t in items)
    leg = leg.replace("Bay: no floor", "Bay: no floor, the ground shows through")

    def street(key, label, note, rot=0, marker=True):
        w, h = dims(key)
        sv = plan_svg(key, 7)
        mk = '<span class="lp-street"><i></i>street</span>' if marker else ""
        return f"""<figure class="lp-orient"><div class="lp-obox" style="transform:rotate({rot}deg)">{sv}</div>{mk}<figcaption><b>{label}</b>{note}</figcaption></figure>"""
    both = "".join(f"""<div class="board lp-theme {t}"><div class="lp-legcard">{plan_svg("retail-D2", 7)}<div class="lp-legside"><b>{name}</b>
        <span class="lp-code"><b>D2</b><span>Retail, size D</span></span>{scale_bar(7)}</div></div></div>""" for t, name in (("", "Dark"), ("light", "Light")))
    return f"""<div class="lp-sheet">
      <div class="lp-sheethead"><h1>Legend, scale and orientation</h1><p>The plans are drawn in the board's own tokens, so they follow the theme; the map stays dark in both, the cards do not.</p></div>
      <div class="lp-cols">
        <section><h2>Legend</h2><ul class="lp-legend">{leg}</ul>
          <p class="lp-p">The legend lives behind the <b>?</b> on the plan card, not on every card: once seen, the five colours need no key.</p>
          <h2>Scale bar</h2><div class="lp-scales">{scale_bar(4)}{scale_bar(10)}{scale_bar(20)}</div>
          <p class="lp-p">One length from 1, 2, 5, 10, 20, 50 m, the first at least 36 px long. Small plans stop at 10 px a metre so an A1 is not drawn as big as an M1.</p>
          <h2>Both themes</h2><div class="lp-themes">{both}</div></section>
        <section><h2>Orientation (unverified)</h2>
          <p class="lp-p">The plans are in the prefab's own frame. How the game turns each building to its street is not in any file we read yet, so the map's north and the plan's top may not agree.</p>
          <div class="lp-orients">{street("office-K1", "As the game stores it", "No street marker. Honest, but K1's entrance is on its right-hand wall.", marker=False)}
          {street("office-K1", "Street side down", "Turned so the wall with the entrance faces down: K1 turns 90°. Retail fronts (glass and door) already face down as stored.", rot=90)}</div>
          <p class="lp-p">Recommendation: ship "as stored" with no marker first. Add "street side down" only once the entrance wall is confirmed to face the street in game (a check Peter can make on three buildings).</p></section>
      </div></div>"""


def layouts_board() -> str:
    parts = []
    for kind, sizes in VERSIONS.items():
        keys = [f"{kind}-{c}" for c in (l for size in sizes.values() for l in size)]
        tall = max(dims(k)[1] for k in keys)
        s = min(150 / tall, 10)
        tiles = "".join(f"""<figure class="lp-lay"><div class="lp-laybox" style="height:{150 if kind != "retail" else 150}px">{plan_svg(k, s)}</div>
          <figcaption><b>{k.split("-")[1]}</b><span>{M2[kind][k.split("-")[1][0]]:,} m² · {dims(k)[0]:g} × {dims(k)[1]:g} m</span><span>{PLANS[k]["doors"]} {doors_word(kind, PLANS[k]["doors"])}{f" · {PLANS[k]['bays']} bay" + ("s" if PLANS[k]["bays"] != 1 else "") if PLANS[k]["bays"] else ""}</span></figcaption></figure>""" for k in keys)
        parts.append(f'<section class="lp-kind"><h2>{KIND_LABEL[kind]} <small>{len(keys)} layouts · one scale · {scale_bar(s)}</small></h2><div class="lp-lays">{tiles}</div></section>')
    return f"""<div class="lp-sheet"><div class="lp-sheethead"><h1>The 24 finder layouts</h1>
      <p>Drawn from the game's own layout prefabs, one scale a kind. Office C1, C2 and D2 are the same buildings as retail C1, C2 and D2. m² is the game's figure for the size; the outline is the outside of the walls, so it is larger. 67 KB for all 24 as vector paths.</p></div>{"".join(parts)}</div>"""


def phone(kind: str) -> str:
    """Phone: the map is a strip above the list; there is no hover, only a pick."""
    at = max(0, ROWS.index(PICK) - 1)
    rows = ROWS[at:at + 6]
    pick = PICK
    key = pick["plan"]
    kindname, size = key.split("-")[0], pick["layout"][0]
    p = PLANS[key]
    wm, hm = dims(key)
    shift = f"transform:translate({PHONE_TARGET[0] - pick['cx']:.0f}px,{PHONE_TARGET[1] - pick['cy']:.0f}px)"
    fps = footprints(rows, pick)
    s_big = fit(key, 330, 200, 14)
    nums = f"""<div class="lp-nums"><div><b>{M2[kindname][size]:,}</b><span>m²</span></div><div><b>{CAPS[kindname][size]}</b><span>cap</span></div><div><b>{p["doors"]}</b><span>{doors_word(kindname, p["doors"])}</span></div></div>"""
    if kind == "tab":
        stage_inner = f"""<div class="lp-world" style="{shift}"><img src="stage.jpg" alt="" width="{WORLD["w"]}" height="{WORLD["h"]}">{fps}</div>
          <div class="lp-phoneplan" data-planview hidden><div class="lp-ppbox">{plan_svg(key, s_big)}</div>
            <div class="lp-pphead"><span class="lp-code"><b>{pick["layout"]}</b><span>{esc(pick["address"])}</span></span>{nums}<div class="lp-foot">{scale_bar(s_big)}<span class="lp-dim">{wm:g} × {hm:g} m</span></div></div></div>
          <div class="fswitch"><button type="button" class="ibtn" aria-pressed="true">{ICON["pin"]}<span>Find a location</span></button></div>
          <div class="lp-seg" role="group" aria-label="Show"><button type="button" class="on" data-view="map" aria-pressed="true">Map</button><button type="button" data-view="plan" aria-pressed="false">{ICON["plan"]}Plan</button></div>"""
        lst = row_list(rows, pick, start=at)
    else:
        stage_inner = f"""<div class="lp-world" style="{shift}"><img src="stage.jpg" alt="" width="{WORLD["w"]}" height="{WORLD["h"]}">{fps}</div>
          <div class="fswitch"><button type="button" class="ibtn" aria-pressed="true">{ICON["pin"]}<span>Find a location</span></button></div>"""
        lst = row_list(rows, pick, start=at, head_row=False).replace(
            f'data-row="{pick["id"]}"', f'data-row="{pick["id"]}" data-open', 1)
        exp = f"""<div class="lp-rowplan"><div class="lp-rpbox">{plan_svg(key, fit(key, 150, 150, 10))}</div><div class="lp-rpside"><span class="lp-code"><b>{pick["layout"]}</b><span>{KIND_LABEL[kindname]}, size {size}</span></span>{nums}<div class="lp-foot">{scale_bar(fit(key, 150, 150, 10))}</div></div></div>"""
        marker = f'data-row="{pick["id"]}" data-open'
        i = lst.index(marker)
        j = lst.index("</button>", i) + len("</button>")
        lst = lst[:j] + exp + lst[j:]
    return f"""<div class="lp-phone">
      <header class="lp-pmast"><span class="wordmark">Costco</span><span class="dot"></span><span class="lp-pnav">{ICON["map"]}Map</span><span class="lp-pclock">Day 20 · 14:00</span></header>
      <div class="city-map finder lp-finder citymap narrow" data-phone>
        <div class="stage panel finder lp-stage lp-pstage">{stage_inner}</div>
        <aside class="places lp-pplaces"><div class="filters lp-pfilters"><div class="frow"><span class="lab">Kind</span><button type="button" class="fchip on">Retail</button><button type="button" class="fchip">Office</button><button type="button" class="fchip">Warehouse</button></div>
          <div class="frow"><span class="lab">Where</span><button type="button" class="fchip hd on">GD</button><button type="button" class="fchip hd on">MH</button><button type="button" class="fchip hd">MT</button><button type="button" class="fchip hd">HK</button></div></div>
          <div class="list">{lst}</div></aside>
      </div></div>"""


# --------------------------------------------------------------------------
# the stylesheet added here, all under lp-
# --------------------------------------------------------------------------
LP_CSS = r"""
.board.lp-board{padding:0 0 40px;min-height:0}
.board.lp-board.lp-small{min-width:0}
.board svg{flex:none}
.lp-page{padding-top:28px}
.lp-finder .citymap{margin-top:0}
/* the world the stage pans over: the map crop and its footprints */
.lp-stage{background:#0d100f}
.lp-world{position:absolute;left:0;top:0;transition:transform .55s cubic-bezier(.4,0,.2,1);will-change:transform}
.lp-world img{display:block;pointer-events:none}
.lp-world .lp-fps{position:absolute;left:0;top:0}
.lp-fps .fp{fill:transparent}
.lp-fps .fp.cand{fill:#43c07a;fill-opacity:.2;stroke:#65e99b;stroke-width:1.2;vector-effect:non-scaling-stroke}
.lp-fps .fp.hot{fill:#a2f8c4;fill-opacity:.4;stroke:#d9ffe8;stroke-width:2}
.lp-fps .fp.sel{fill:#65e99b;fill-opacity:.45;stroke:#fff7cc;stroke-width:2.5}
.lp-layer{pointer-events:none}
.lp-layer .site{pointer-events:auto}
.city-map .lp-site .st,.city-map .lp-site .facts,.city-map .lp-site .fit{display:grid}
.city-map .lp-site .st{display:inline-flex}
.city-map .lp-site .fit{display:block}
.city-map .lp-site .hood{height:18px;min-width:22px;font-size:9.5px;margin-right:2px}

/* the row's layout tag, and the pin a pinned row wears */
.lp-tag{display:inline-block;margin-right:6px;padding:1px 4px;border-radius:3px;border:1px solid var(--rule);font:500 9.5px/1.2 "IBM Plex Mono",monospace;color:var(--ink-2);letter-spacing:.02em}
.place.on .lp-tag{border-color:color-mix(in srgb,var(--accent) 55%,var(--rule));color:var(--ink)}
.lp-pinmark{display:inline-grid;place-items:center;margin-left:6px;color:var(--accent);vertical-align:-2px}
.lp-pinmark[hidden]{display:none}
.lp-pinmark svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}

/* the plan itself: the board's tokens, nothing louder than the map */
.lp-svg .f{fill:color-mix(in oklab,var(--ink) 15%,var(--surface))}
.lp-svg .b{fill:var(--ground)}
.lp-svg .w{fill:var(--ink-2)}
.lp-svg .n{fill:var(--info)}
.lp-svg .d{fill:var(--accent)}
.lp-scale{display:inline-flex;align-items:center;gap:6px;font:500 10px/1 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap}
.lp-scale i{display:block;height:6px;border:1.5px solid var(--ink-3);border-top:0;box-sizing:border-box}
.lp-lab{display:inline-flex;align-items:center;gap:6px;font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.lp-lab svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}

/* the dock: bottom-left of the map area, where the player asked for it */
.lp-dock{position:absolute;left:16px;bottom:16px;z-index:6}
.lp-card{display:grid;grid-template-columns:236px 164px;gap:0 14px;width:442px;padding:12px 14px 12px 12px;border-radius:10px;border:1px solid var(--rule);background:var(--surface);box-shadow:0 12px 40px #0008;animation:lp-in .22s cubic-bezier(.2,.7,.2,1)}
.lp-card.lp-off{display:none}
@keyframes lp-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.lp-box{height:190px;border-radius:7px;background:var(--ground);display:grid;place-items:center;overflow:hidden}
.lp-side{display:flex;flex-direction:column;gap:9px;min-width:0}
.lp-state{display:flex;align-items:center;gap:6px;font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.lp-state i{width:7px;height:7px;border-radius:50%;background:var(--accent)}
.lp-state .lp-why{margin-left:auto;letter-spacing:0}
.lp-state .lp-why::after{left:auto;right:0;text-transform:none;letter-spacing:0}
.lp-state [data-when="hover"]{display:none}
.lp-card.hover .lp-state i{background:transparent;border:1.5px solid var(--ink-3)}
.lp-card.hover .lp-state [data-when="hover"]{display:inline}
.lp-card.hover .lp-state [data-when="pick"]{display:none}
.lp-code{display:flex;align-items:baseline;gap:8px;min-width:0}
.lp-code>b{font:500 24px/1 "IBM Plex Mono",monospace;letter-spacing:-.02em;color:var(--ink)}
.lp-code>span{font-size:12px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lp-addr{font-size:12.5px;font-weight:500;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:-3px}
.lp-nums{display:flex;gap:14px}
.lp-nums div{display:flex;flex-direction:column;gap:3px}
.lp-nums b{font:500 16px/1 "IBM Plex Mono",monospace;letter-spacing:-.02em;color:var(--ink)}
.lp-nums span{font:500 9.5px/1.1 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)}
.lp-foot{display:flex;align-items:center;gap:10px;margin-top:auto}
.lp-hint2{margin:0;font-size:11.5px;line-height:1.4;color:var(--ink-3)}
.lp-card.hover .lp-hint2{visibility:hidden}
.lp-dim{font:400 10.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap}
.lp-pinbtn{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:6px;border:1px solid var(--rule);background:none;color:var(--ink-2);font:500 11.5px/1 "IBM Plex Mono",monospace;cursor:pointer;width:max-content;transition:color .15s,border-color .15s,background .15s}
.lp-pinbtn:hover{color:var(--ink);border-color:var(--ink-3)}
.lp-pinbtn[aria-pressed="true"]{background:var(--accent-soft);border-color:var(--accent);color:var(--ink)}
.lp-pinbtn svg,.lp-unpin svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.lp-pinbtn.sm{height:22px;padding:0 7px;font-size:10.5px;margin-left:auto}

/* option A: the tray of pinned plans */
.lp-tray{width:max-content;max-width:640px;padding:10px 12px 12px;border-radius:10px;border:1px solid var(--rule);background:var(--surface);box-shadow:0 12px 40px #0008}
.lp-trayhead{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.lp-traynote{font-size:11.5px;color:var(--ink-3)}
.lp-trayhead .lp-scale{margin-left:auto}
.lp-slots{display:flex;gap:10px;align-items:stretch}
.lp-slot{width:196px;display:flex;flex-direction:column;gap:7px;padding:8px;border-radius:8px;background:var(--ground);border:1px solid var(--rule-soft);animation:lp-in .22s cubic-bezier(.2,.7,.2,1)}
.lp-slot.live{border-style:dashed;border-color:var(--rule)}
.lp-slot.live.hover{border-color:var(--ink-3)}
.lp-slotbox{height:160px;display:flex;align-items:flex-end;justify-content:center}
.lp-slothead{display:flex;align-items:baseline;gap:7px;min-width:0}
.lp-slothead>b{font:500 15px/1 "IBM Plex Mono",monospace}
.lp-slothead>span{font-size:11.5px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}
.lp-unpin{flex:none;width:22px;height:22px;display:grid;place-items:center;border:0;border-radius:5px;background:none;color:var(--ink-3);cursor:pointer;padding:0}
.lp-unpin:hover{background:var(--raised);color:var(--ink)}
.lp-slotnums{display:flex;gap:10px;font:400 10.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.lp-slotnums b{font-weight:500;color:var(--ink)}

/* option B: the shelf of layouts */
.lp-shelf{padding:10px 12px 12px;border-radius:10px;border:1px solid var(--rule);background:var(--surface);box-shadow:0 12px 40px #0008;width:max-content;max-width:646px}
.lp-tiles{display:flex;gap:8px;align-items:stretch}
.lp-shelf.wrap .lp-tiles{display:grid;grid-template-columns:repeat(6,auto);justify-content:start}
.lp-tile{display:flex;flex-direction:column;align-items:center;gap:5px;padding:7px 7px 6px;border-radius:8px;border:1px solid transparent;background:var(--ground);color:var(--ink-2);cursor:pointer;font:inherit;transition:border-color .15s,background .15s,transform .2s cubic-bezier(.34,1.56,.64,1)}
.lp-tile:hover{border-color:var(--ink-3);transform:translateY(-2px)}
.lp-tilebox{display:flex;align-items:flex-end;justify-content:center;min-width:34px}
.lp-tilecode{display:flex;align-items:baseline;gap:5px;font:400 10px/1 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap}
.lp-tilecode b{font-size:13px;font-weight:500;color:var(--ink)}
.lp-tilen{font:400 10px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.lp-tile.none{opacity:.55}
.lp-tile.lit{border-color:var(--accent);background:var(--accent-soft)}
.lp-tile.lit .lp-svg .f{fill:color-mix(in oklab,var(--accent) 22%,var(--surface))}
.lp-tile.hover{border-color:var(--ink-3)}
.lp-tile.hover .lp-svg .f{fill:color-mix(in oklab,var(--ink) 16%,var(--surface))}
.lp-tile[aria-pressed="true"]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.lp-laychips{display:flex;flex-wrap:wrap;gap:5px}
.lp-hint{font:400 11.5px/26px Archivo,sans-serif;color:var(--ink-3)}
.place.fr.lp-gone{display:none}
.lp-aside{margin:36px auto 0;width:min(1180px,calc(100% - 80px));display:flex;gap:28px;align-items:flex-start}
.lp-asidehead{width:260px;display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--ink-2);line-height:1.45}
.lp-asidehead b{color:var(--ink);font-size:14px}
.lp-asidebox .lp-shelf{box-shadow:none}

/* phones: the map is a strip over the list; no hover, only a pick */
.lp-phone{width:390px}
.lp-pmast{display:flex;align-items:center;gap:2px;height:56px;padding:0 16px;border-bottom:1px solid var(--rule)}
.lp-pmast .wordmark{font-size:22px}
.lp-pmast .dot{width:8px;height:8px}
.lp-pnav{display:inline-flex;align-items:center;gap:6px;margin-left:16px;font-size:13px;font-weight:500;color:var(--ink)}
.lp-pnav svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.lp-pclock{margin-left:auto;font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.lp-phone .citymap.narrow{display:flex;flex-direction:column;gap:10px;padding:10px 0 0;margin:0}
.lp-phone .stage.lp-pstage{height:360px;border-radius:0;border-left:0;border-right:0}
.lp-phone .fswitch{left:10px;top:10px}
.lp-phone .places.lp-pplaces{position:static;width:auto;max-height:none;backdrop-filter:none;background:var(--surface);border-radius:0;border-left:0;border-right:0}
.lp-phone .places .list{overflow:visible}
.lp-phone .fhead,.lp-phone .place.fr{grid-template-columns:28px 24px 1fr 42px 56px}
.lp-phone .fhead span:nth-child(n+5):nth-child(-n+8),.lp-phone .place.fr>:nth-child(n+5):nth-child(-n+8){display:none}
.lp-phone .place{min-height:44px}
.lp-phone .fchip{height:32px}
.lp-pfilters .frow{flex-wrap:nowrap;overflow:hidden}
.lp-seg{position:absolute;right:10px;top:10px;z-index:6;display:flex;padding:3px;border-radius:9px;background:var(--surface);border:1px solid var(--rule);box-shadow:0 2px 8px #0003}
.lp-seg button{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 13px;border:0;border-radius:6px;background:none;color:var(--ink-2);font:500 13px/1 Archivo,sans-serif;cursor:pointer}
.lp-seg button svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.lp-seg button.on{background:var(--accent-soft);color:var(--ink)}
.lp-phoneplan{position:absolute;inset:0;z-index:5;background:var(--surface);display:flex;flex-direction:column;padding:58px 14px 12px;gap:10px}
.lp-phoneplan[hidden]{display:none}
.lp-ppbox{flex:1;display:grid;place-items:center;border-radius:8px;background:var(--ground);min-height:0;overflow:hidden}
.lp-pphead{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px}
.lp-pphead .lp-code{flex-basis:100%}
.lp-pphead .lp-foot{margin-left:auto;margin-top:0}
.lp-rowplan{display:grid;grid-template-columns:160px 1fr;gap:12px;padding:6px 12px 14px 14px;background:var(--accent-soft);box-shadow:inset 3px 0 var(--accent)}
.lp-rpbox{height:160px;display:grid;place-items:center;border-radius:7px;background:var(--surface)}
.lp-rpside{display:flex;flex-direction:column;gap:10px;padding-top:4px}
.lp-rpside .lp-code>b{font-size:20px}

/* reference sheets: legend, orientation, the 24 layouts */
.lp-sheet{padding:44px 56px 56px}
.lp-sheethead h1{margin:0;font-size:24px;font-weight:600;letter-spacing:-.02em}
.lp-sheethead p{margin:6px 0 0;max-width:820px;font-size:13.5px;line-height:1.5;color:var(--ink-2)}
.lp-sheet h2{margin:28px 0 12px;font-size:15px;font-weight:600;display:flex;align-items:center;gap:12px}
.lp-sheet h2 small{display:inline-flex;align-items:center;gap:12px;font:400 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.lp-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:56px}
.lp-legend{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px;font-size:13px;color:var(--ink-2)}
.lp-legend li{display:flex;align-items:center;gap:10px}
.lp-sw{border-radius:4px;border:1px solid var(--rule)}
.lp-p{margin:12px 0 0;font-size:13px;line-height:1.5;color:var(--ink-2);max-width:520px}
.lp-scales{display:flex;gap:28px;align-items:center}
.lp-themes{display:flex;gap:12px}
.lp-theme.board{min-width:0;min-height:0;padding:0;width:auto;background:transparent}
.lp-legcard{display:flex;gap:14px;align-items:center;padding:12px;border-radius:10px;border:1px solid var(--rule);background:var(--surface);color:var(--ink)}
.lp-legside{display:flex;flex-direction:column;gap:8px;min-width:130px}
.lp-legside>b{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.lp-legside .lp-code>b{font-size:20px}
.lp-orients{display:flex;gap:24px;align-items:flex-start;margin-top:14px}
.lp-orient{margin:0;width:260px;display:flex;flex-direction:column;align-items:center;gap:8px}
.lp-obox{width:260px;height:240px;display:grid;place-items:center}
.lp-street{display:flex;flex-direction:column;align-items:center;gap:4px;font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
.lp-street i{width:180px;height:0;border-top:2px dashed var(--ink-3)}
.lp-orient figcaption{font-size:12px;line-height:1.45;color:var(--ink-2);text-align:center}
.lp-orient figcaption b{display:block;color:var(--ink);font-size:13px;margin-bottom:2px}
.lp-kind h2{margin-top:32px}
.lp-lays{display:flex;flex-wrap:wrap;gap:14px 18px;align-items:flex-end}
.lp-lay{margin:0;display:flex;flex-direction:column;gap:6px;width:max-content;min-width:96px}
.lp-laybox{display:flex;align-items:flex-end}
.lp-lay figcaption{display:flex;flex-direction:column;gap:3px}
.lp-lay figcaption b{font:500 14px/1 "IBM Plex Mono",monospace}
.lp-lay figcaption span{font:400 10.5px/1.35 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap}
"""

# --------------------------------------------------------------------------
# the page script: hover, pick, pin, shelf, the phone's Map/Plan switch
# --------------------------------------------------------------------------
WIRE = r"""
    const $ = (s, el) => (el || document).querySelector(s), $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
    $$('[data-finder]').forEach(root => {
      const mode = root.dataset.mode, rows = JSON.parse(root.dataset.rows || '{}');
      const [tx, ty] = root.dataset.target.split(',').map(Number);
      const world = $('[data-world]', root), list = $('.places .list', root);
      let pick = root.dataset.pick, hover = null;
      const lit = () => {
        const id = hover || pick;
        $$('[data-fp]', root).forEach(p => { p.classList.toggle('hot', p.dataset.fp === hover && hover !== pick); p.classList.toggle('sel', p.dataset.fp === pick); });
        if (mode === 'single' || mode === 'tray') {
          // a row with no plan leaves the picked one on screen, never an empty card
          const show = id && rows[id] && rows[id].plan ? id : (rows[pick] && rows[pick].plan ? pick : null);
          $$('[data-card]', root).forEach(c => { c.classList.toggle('lp-off', c.dataset.card !== show); c.classList.toggle('hover', show === hover && hover !== pick); });
          if (mode === 'tray') tray(show);
        }
        if (mode === 'shelf') {
          const h = hover && rows[hover] ? rows[hover].layout : null, p = rows[pick] ? rows[pick].layout : null;
          $$('[data-tile]', root).forEach(t => { t.classList.toggle('lit', t.dataset.tile === p); t.classList.toggle('hover', t.dataset.tile === h && h !== p); });
        }
      };
      const choose = id => {
        pick = id;
        $$('.place[data-row]', root).forEach(r => { r.classList.toggle('on', r.dataset.row === id); r.setAttribute('aria-pressed', r.dataset.row === id ? 'true' : 'false'); });
        $$('[data-site]', root).forEach(c => c.classList.toggle('in', c.dataset.site === id));
        const r = rows[id]; if (r && world) world.style.transform = `translate(${tx - r.cx}px,${ty - r.cy}px)`;
        lit();
      };
      $$('.place[data-row]', root).forEach(r => {
        r.addEventListener('mouseenter', () => { hover = r.dataset.row; lit(); });
        r.addEventListener('click', () => choose(r.dataset.row));
      });
      if (list) list.addEventListener('mouseleave', () => { hover = null; lit(); });
      $$('[data-site] .x', root).forEach(x => x.addEventListener('click', e => { e.target.closest('[data-site]').classList.remove('in'); }));

      // option A: pins, one shared scale for everything in the tray
      const pins = $$('.lp-slot.pinned', root).map(s => s.dataset.slot);
      const tray = show => {
        const slots = $('[data-slots]', root); if (!slots) return;
        const live = $('[data-live]', slots);
        const want = show && !pins.includes(show) ? show : null;
        if (live && live.dataset.slot !== want) {
          live.remove();
          if (want) { const t = $(`template[data-spare="${want}"]`, root); if (t) slots.appendChild(t.content.firstElementChild.cloneNode(true)); }
          wireLive();
        }
        const cur = $('[data-live]', slots); if (cur) cur.classList.toggle('hover', want === hover);
        // the scale: the largest plan on the tray decides it, capped like the card
        const ms = $$('svg[data-m]', slots).map(s => s.dataset.m.split(',').map(Number));
        const s = Math.min(8, ...ms.map(([w, h]) => Math.min(150 / (w + 1), 150 / (h + 1))));
        $$('svg[data-m]', slots).forEach(sv => { const [w, h] = sv.dataset.m.split(',').map(Number); sv.setAttribute('width', ((w + 1) * s).toFixed(1)); sv.setAttribute('height', ((h + 1) * s).toFixed(1)); });
        const bar = $('[data-trayscale]', root);
        if (bar) { const m = [1, 2, 5, 10, 20, 50].find(m => m * s >= 36) || 50; $('i', bar).style.width = (m * s).toFixed(1) + 'px'; $('span', bar).textContent = m + ' m'; }
        const note = $('[data-traynote]', root); if (note) note.textContent = `${pins.length} pinned · up to 3`;
        $$('[data-pinmark]', root).forEach(m => { m.hidden = !pins.includes(m.dataset.pinmark); });
      };
      const wireLive = () => {
        const b = $('[data-pinlive]', root); if (!b) return;
        b.disabled = pins.length >= 3;
        b.onclick = () => {
          const slot = b.closest('[data-slot]'), id = slot.dataset.slot; if (pins.length >= 3) return;
          pins.push(id); slot.classList.remove('live'); slot.classList.add('pinned'); slot.removeAttribute('data-live');
          b.outerHTML = `<button type="button" class="lp-unpin" data-unpin="${id}" aria-label="Unpin">${root.dataset.x || '×'}</button>`;
          wireUnpin(); tray(hover || pick);
        };
      };
      const wireUnpin = () => $$('[data-unpin]', root).forEach(b => b.onclick = () => {
        const id = b.dataset.unpin; pins.splice(pins.indexOf(id), 1); b.closest('[data-slot]').remove(); tray(hover || pick);
      });
      if (mode === 'tray') { wireLive(); wireUnpin(); }

      // option B: a tile lists only its layout; a second click lists all again
      const chips = $('[data-laychips]', root);
      $$('[data-tile]', root).forEach(t => t.addEventListener('click', () => {
        const on = t.getAttribute('aria-pressed') !== 'true';
        $$('[data-tile]', root).forEach(x => x.setAttribute('aria-pressed', x === t && on ? 'true' : 'false'));
        $$('.place[data-row]', root).forEach(r => r.classList.toggle('lp-gone', on && r.dataset.layout !== t.dataset.tile));
        if (chips) chips.innerHTML = on ? `<button type="button" class="fchip on" data-clear>Layout ${t.dataset.tile}<b>×</b></button>` : '<span class="lp-hint">All layouts</span>';
        const c = $('[data-clear]', root); if (c) c.onclick = () => t.click();
      }));
      lit();
    });
    // the phone: Map or Plan in the same window
    $$('.lp-seg').forEach(seg => $$('button', seg).forEach(b => b.addEventListener('click', () => {
      $$('button', seg).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      const pv = $('[data-planview]', seg.closest('.lp-pstage')); if (pv) pv.hidden = b.dataset.view !== 'plan';
    })));
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
<div class="board lp-board __SMALL__ {{theme}}" style="width: __W__px; height: __H__px;">
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
<body><div class="board lp-board __SMALL__ __THEME__" style="width: __W__px; min-height: 100px;">
__BODY__
</div>
<script>window.addEventListener('load', function () {__WIRE__});</script></body></html>
"""


def with_rows(body: str, no_plan: str = "") -> str:
    """Hand the page script each row's centre and plan, on its finder root."""
    return body.replace('data-mode=', f'data-rows="{rows_json(ROWS, no_plan)}" data-mode=', 1)


# file, title, builder, width, height
D_H = 880
BOARDS = [
    ("Main.dc.html", "1 · A row picked, another hovered", lambda: with_rows(main_board()), 1440, D_H),
    ("CompareTray.dc.html", "2A · Compare: pin plans side by side", lambda: with_rows(compare_tray()), 1440, D_H),
    ("CompareShelf.dc.html", "2B · Compare: the kind's layouts on a shelf", lambda: with_rows(compare_shelf()), 1440, D_H + 420),
    ("NoPlan.dc.html", "3 · A row with no plan", lambda: with_rows(no_plan_board(), PICK["key"]), 1440, D_H),
    ("PhonePlan.dc.html", "4A · Phone: Map / Plan in the map window", lambda: phone("tab"), 390, 844),
    ("PhoneRow.dc.html", "4B · Phone: the plan opens in the picked row", lambda: phone("row"), 390, 844),
    ("Legend.dc.html", "5 · Legend, scale, orientation, themes", legend_board, 1440, 900),
    ("Layouts.dc.html", "Reference · the 24 finder layouts", layouts_board, 1440, 1180),
]

TIPS = {
    "Main.dc.html": "Hover a row: the plan card bottom-left shows its layout (hollow dot = hovered), and falls back to the picked row when you leave the list. Click a row: the map pans it into the free area above the card and its site card opens. The layout code also sits at the start of each row's second line.",
    "CompareTray.dc.html": "Option A. Pinned plans sit side by side at ONE scale, so an A1 really is a third of a C1. The dashed slot is whatever you hover or picked; Pin keeps it (up to 3). The x unpins. Pinned rows wear a pin after the address.",
    "CompareShelf.dc.html": "Option B (recommended). The kind has only 6 retail / 6 office / 12 warehouse layouts, so the dock shows all of them at one scale. Hover a row: its layout lights up. Click a tile: the list keeps only that layout (a Layout chip appears in the filters); click again to clear.",
    "NoPlan.dc.html": "The picked row (54 Fifth Avenue here, as if its version were unknown) has no plan: no card, no layout tag, no placeholder. Hover a row that has one and its card appears; leave the list and it goes again. Cinemas and theatres always look like this.",
    "PhonePlan.dc.html": "Option A (recommended). No hover on a phone. Once a row is picked, a Map / Plan switch sits in the map window; Plan fills the window with the plan and its numbers. Tap Plan.",
    "PhoneRow.dc.html": "Option B. The picked row opens in the list and carries its plan. Costs list height; keeps the map for the map.",
    "Legend.dc.html": "Five colours from the board's tokens. Orientation vs the street is unverified: the plans are in the prefab's own frame.",
    "Layouts.dc.html": "All 24 plans at one scale per kind, with what the card would show. Useful for checking the renders against the game.",
}


def css() -> str:
    base = BOARD_CSS.replace("@import url('" + FONTS + "');", "")
    return base + MAP_CSS + LP_CSS


def build(preview: bool = False) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    boards, order, notes = {}, [], {}
    style = css()
    # layout: desktop artboards in rows, phones to the right of the first row
    place = {
        "Main.dc.html": (0, 0), "PhonePlan.dc.html": (1440 + 120, 0), "PhoneRow.dc.html": (1440 + 120 + 390 + 80, 0),
        "CompareTray.dc.html": (0, D_H + 420), "CompareShelf.dc.html": (1440 + 120, D_H + 420),
        "NoPlan.dc.html": (0, 2 * D_H + 420 + 840), "Legend.dc.html": (1440 + 120, 2 * D_H + 420 + 840),
        "Layouts.dc.html": (0, 3 * D_H + 420 + 900 + 840 - D_H + 20),
    }
    for name, title, builder, w, h in BOARDS:
        body = builder()
        small = "lp-small" if w < 1000 else ""
        props = {"dark": {"editor": "boolean", "default": True, "section": "Theme"}, "$preview": {"width": w, "height": h}}
        page = (PAGE.replace("__TITLE__", "Floor plans: " + title).replace("__FONTS__", FONTS.replace("&", "&amp;"))
                .replace("__CSS__", style).replace("__W__", str(w)).replace("__H__", str(h)).replace("__SMALL__", small)
                .replace("__BODY__", body)
                .replace("__PROPS__", json.dumps(props, separators=(",", ":"), ensure_ascii=False).replace("'", "&#39;"))
                .replace("__LOGIC__", LOGIC))
        (ROOT / name).write_text(page, encoding="utf-8", newline="\n")
        if preview:
            out = HERE / "_preview"
            out.mkdir(exist_ok=True)
            shutil.copyfile(ROOT / "stage.jpg", out / "stage.jpg")
            for theme in ("", "light"):
                (out / f"{name.split('.')[0]}{'-light' if theme else ''}.html").write_text(
                    PREVIEW.replace("__TITLE__", title).replace("__FONTS__", FONTS.replace("&", "&amp;")).replace("__CSS__", style)
                    .replace("__THEME__", theme).replace("__SMALL__", small).replace("__W__", str(w)).replace("__BODY__", body)
                    .replace("__WIRE__", WIRE), encoding="utf-8", newline="\n")
        x, y = place[name]
        boards[name] = {"x": x, "y": y, "w": w, "h": h, "title": title, "is_interactive": True}
        order.append(name)
        notes["try-" + name.split(".")[0].lower()] = {"x": x, "y": y - 250, "w": 560 if w > 390 else 390, "maxH": 190, "text": TIPS[name]}
    notes["title-row1"] = {"x": 0, "y": -560, "text": "Floor plans in the finder (issue #70)", "kind": "title1", "maxW": 2400}
    index = {"v": 3, "createdOnFiles": {"v": 1, "at": CREATED_AT}, "title": "Big Copilot Floor Plans", "launch": {"view": "canvas"},
             "pages": [], "boards": boards, "order": order, "notes": notes, "designSystems": []}
    (ROOT / "canvas.json").write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8", newline="\n")
    print("wrote", len(order), "artboards;", ", ".join(f"{n} {(ROOT / n).stat().st_size // 1024} KB" for n in order))
    print("rows:", [(r["address"], r["layout"], r["score"]) for r in ROWS], "pick:", PICK["address"])


if __name__ == "__main__":
    build("--preview" in sys.argv)
