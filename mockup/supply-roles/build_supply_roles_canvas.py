"""Generates the "Plans & contracts" canvas for the Supply page: project/*.dc.html and project/canvas.json.

Peter, 10 Oct 2026: "The current supply chain view has a bunch of views but the most important
one: Showing every logistics managers or purchasing agents configuration in one view is missing."
This canvas draws that view: one table of every Logistics Manager's delivery plan, one of every
Purchasing Agent's import contract, each row opening to its full destination or product list,
with the problems the board already finds and the new role-level ones flagged inline.

Like mockup/secondary-products, the generator takes the board's REAL stylesheet out of
template/board.html, so the sidebar, the Supply tables (sb-t), the status chips (sb-v), the
object heads (sb-obj) and the Goods flow cards (sbf-card) are the shipped classes. The older
mockup/revamp CSS predates the sidebar (PR #169). Every class added here carries the sr- prefix
(unused on the board when this was written).

Data shapes follow mockup/supply-roles/NOTES.md (checked against three real saves): 12 managers
of which 5 run factory plans (two with a pier export stop), 0-16 destinations each, 8 agents
with 14-18 products each. Round 2 (11 Oct 2026) applied the review; see NOTES.md.

Never hand-edit project/: change this and rerun. `--preview` also writes plain HTML copies into
_preview/ (both themes) for screenshots; do not commit _preview/.

The canvas is published at https://claude.ai/artifact/Jr4kSCLZhxqQkWQ7Kv3yuZ.
All names (company, people, sites) are invented. Never put a real save's names here.
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE / "project"
REPO = HERE.parent.parent
CREATED_AT = "2026-10-10T18:00:00Z"
FONTS = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"


def board_css() -> str:
    """The board's own stylesheet: the one <style> block of template/board.html, map and wiki tokens dropped."""
    src = (REPO / "template" / "board.html").read_text(encoding="utf-8")
    s = src.index("<style>") + len("<style>")
    e = src.index("</style>", s)
    return src[s:e].replace("/*__MAP_CSS__*/", "").replace("/*__WIKI_CSS__*/", "")


# --------------------------------------------------------------------------
# the view's own stylesheet, all under sr-
# --------------------------------------------------------------------------
SR_CSS = r"""
html,body{margin:0}
.sr-board{position:relative;overflow:hidden}
.sr-board .sd{height:100%}
.sr-board .orb{opacity:1}

/* group heads: the noun, then the counts the rows add up to */
.sr-gh{display:flex;align-items:baseline;gap:14px;margin:30px 0 0;padding-bottom:10px;border-bottom:1px solid var(--rule)}
.sr-gh h3{display:flex;align-items:center;gap:9px;margin:0;font:500 11px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-2)}
.sr-gh h3 svg{width:15px;height:15px;stroke:var(--ink-3);fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.sr-gh .n{display:flex;gap:22px;margin-left:auto;font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.sr-gh .n b{color:var(--ink);font-weight:500;font-size:14px;margin-right:5px}

/* the two tables */
#pageSupply table.sr-t{table-layout:auto}
#pageSupply .sr-t thead th{border-bottom:1px solid var(--rule-soft)}
#pageSupply .sr-t td{padding-top:11px;padding-bottom:11px}
#pageSupply .sr-t tr.sr-row{cursor:pointer}
#pageSupply .sr-t tr.sr-row td.who b{display:block;font-weight:600;font-size:14px;color:var(--ink)}
#pageSupply .sr-t tr.sr-row td.who .sub{font-family:"IBM Plex Mono",monospace;font-size:11px}
#pageSupply .sr-t td.site{white-space:nowrap}
#pageSupply .sr-t td.site .nm{display:inline-flex;align-items:center;gap:7px;font-weight:500}
#pageSupply .sr-t td.to{white-space:normal;color:var(--ink-2);font-size:12.5px;line-height:1.5;max-width:300px}
#pageSupply .sr-t td.to em{font-style:normal;color:var(--ink-3);font-family:"IBM Plex Mono",monospace;font-size:11.5px}
#pageSupply .sr-t td.st{min-width:120px}
#pageSupply .sr-t td.tg{width:30px;padding-right:2px}
#pageSupply .sr-t tr.sr-part td{padding:18px 0 6px;border-bottom:0;background:none;font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
#pageSupply .sr-t tr.sr-part:hover{background:none}
#pageSupply .sr-t tr.sr-part td b{color:var(--ink-2);font-weight:500}
#pageSupply .sr-t tr.sr-gap td.who b{color:var(--ink-3);font-weight:500}
#pageSupply .sr-t tr.sr-opened > td{border-bottom-color:transparent;background:var(--surface)}
#pageSupply .sr-t tr.sr-lit > td{background:color-mix(in srgb,var(--accent) 8%,transparent)}
#pageSupply .sr-t tr.sr-lit > td:first-child{box-shadow:inset 3px 0 0 var(--accent)}
.sr-tog{width:24px;height:24px;border-radius:50%;border:1px solid var(--rule);display:grid;place-items:center;color:var(--ink-3);transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.sr-tog svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
tr.sr-opened .sr-tog{transform:rotate(90deg);color:var(--ink)}

/* destinations against what the source's vehicles reach */
.sr-cap{display:inline-flex;flex-direction:column;align-items:flex-end;gap:5px}
.sr-cap span{font:500 14px/1 "IBM Plex Mono",monospace;color:var(--ink)}
.sr-cap span small{font-size:11px;color:var(--ink-3);margin-left:4px}
.sr-cap i{display:flex;gap:2px}
.sr-cap i b{width:5px;height:6px;border-radius:1px;background:var(--rule)}
.sr-cap i b.on{background:var(--ink-3)}

/* the opened row */
#pageSupply .sr-t tr.sr-detail > td{padding:0 0 18px;background:var(--surface);border-bottom:1px solid var(--rule)}
#pageSupply .sr-t tr.sr-detail:hover{background:none}
.sr-det{padding:4px 18px 0 18px;text-align:left;white-space:normal;font-family:Archivo,sans-serif}
.sr-veh{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;padding:6px 0 12px;font-size:12.5px;color:var(--ink-3)}
.sr-veh .v{display:inline-flex;align-items:center;gap:7px;height:26px;padding:0 10px;border-radius:13px;background:var(--raised);color:var(--ink-2)}
.sr-veh .v svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.sr-veh .v b{font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink)}
.sr-veh .v.off{background:none;box-shadow:inset 0 0 0 1px var(--rule);color:var(--ink-3)}
.sr-veh .v.off b{color:var(--ink-3)}
.sr-veh .eq{font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.sr-veh .eq b{color:var(--ink);font-weight:600}
.sr-veh .go{margin-left:auto;display:flex;gap:16px}
.sr-veh .link{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.sr-veh .link svg,.sr-dt .link svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.7;flex:none}

/* destination list / product list inside an opened row */
#pageSupply table.sr-dt{background:var(--ground);border-radius:10px;overflow:hidden}
#pageSupply .sr-dt th,#pageSupply .sr-dt td{padding:8px 10px}
#pageSupply .sr-dt td.no{width:26px;color:var(--ink-3);font-size:11.5px;text-align:right;padding-right:4px}
#pageSupply .sr-dt td.nm{white-space:nowrap}
#pageSupply .sr-dt td.nm .nm{display:inline-flex;align-items:center;gap:7px}
#pageSupply .sr-dt td.tl{white-space:normal;color:var(--ink-3);font-size:12.5px;font-family:Archivo,sans-serif;line-height:1.55;max-width:520px}
#pageSupply .sr-dt td.tl b{font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink);margin-left:3px}
#pageSupply .sr-dt td.tl em{font-style:normal;color:var(--ink-3)}
#pageSupply .sr-dt td.ln{width:1%;white-space:nowrap}
#pageSupply .sr-dt tr.sr-dr{cursor:pointer}
#pageSupply tr.sr-hide{display:none}
#pageSupply .sr-dt tr.sr-tgrow > td{padding:2px 10px 14px 36px;background:var(--ground)}
#pageSupply .sr-dt tr.sr-tgrow:hover{background:none}
#pageSupply .sr-dt tr.sr-dopen > td{border-bottom-color:transparent}
.sr-dt .sr-dtog{display:inline-block;width:12px;margin-right:4px;color:var(--ink-3);transition:transform .2s}
.sr-dt .sr-dtog svg{width:10px;height:10px;stroke:currentColor;fill:none;stroke-width:2.2}
.sr-dt tr.sr-dopen .sr-dtog{transform:rotate(90deg)}
#pageSupply table.sr-tt{background:none}
#pageSupply .sr-tt th,#pageSupply .sr-tt td{padding:6px 10px;font-size:12.5px}
#pageSupply .sr-tt thead th{font-size:9.5px}
.sr-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 28px}
.sr-more{display:flex;gap:14px;align-items:center;margin:10px 0 0 4px;font-size:12.5px;color:var(--ink-3)}
.sr-more button{border:0;background:none;padding:0;color:var(--ink-2);font:500 12.5px/1 Archivo,sans-serif;cursor:pointer;border-bottom:1px solid var(--rule)}
.sr-more button:hover{color:var(--ink);border-color:var(--ink-3)}
.sr-tag{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:4px;background:var(--raised);font:500 10px/1.5 "IBM Plex Mono",monospace;letter-spacing:.04em;color:var(--ink-2);vertical-align:1px}
.sr-tag.info{background:color-mix(in srgb,var(--info) 16%,transparent);color:var(--info)}
.sr-flow{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:7px;color:var(--ink-3);border:1px solid transparent;transition:all .15s}
.sr-flow:hover{border-color:var(--rule);color:var(--accent)}
.sr-flow svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.sr-map{display:inline-grid;place-items:center;width:22px;height:22px;border:0;border-radius:6px;background:none;color:var(--ink-3);cursor:pointer;opacity:.0;transition:opacity .15s}
tr:hover .sr-map,.sr-show .sr-map{opacity:1}
.sr-map svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.7}
.sr-dash{color:var(--ink-3)}
#pageSupply .sr-t .sb-v,#pageSupply .sr-dt .sb-v{white-space:normal}
#pageSupply .sr-tt td.l:first-child{min-width:170px}
.sr-cols{column-gap:40px}
#pageSupply .sr-t td.dl{white-space:nowrap}
.sr-cap small{display:block;font:400 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.sr-q{display:inline-grid;place-items:center;min-width:22px;height:16px;margin-left:6px;padding:0 4px;border-radius:8px;border:1px dashed var(--info);color:var(--info);font:600 9.5px/1 "IBM Plex Mono",monospace;letter-spacing:.02em;text-transform:none;vertical-align:1px;cursor:help}

#pageSupply .sr-dt td.ln .link{opacity:0;transition:opacity .15s}
#pageSupply .sr-dt tr:hover td.ln .link,#pageSupply .sr-dt tr.sr-show td.ln .link{opacity:1}
.sr-bands .sbf-panel{align-items:start}
#pageSupply .sr-t .sb-v,#pageSupply .sr-dt .sb-v{margin:2px 4px 2px 0}
a.sb-v{text-decoration:none;cursor:pointer}
a.sb-v:hover{filter:brightness(1.15)}

/* empty state: the board's sbp-none, with the two roles named */
.sr-empty{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:22px}
.sr-empty>div{display:flex;gap:14px;padding:18px 20px;border:1px dashed var(--rule);border-radius:12px}
.sr-empty svg{width:22px;height:22px;stroke:var(--ink-3);fill:none;stroke-width:1.6;flex:none;stroke-linecap:round;stroke-linejoin:round}
.sr-empty h3{margin:0 0 6px;font-size:15px;font-weight:600}
.sr-empty p{margin:0;font-size:13px;color:var(--ink-2)}
.sr-empty p b{color:var(--ink);font-weight:600}

/* E: the link fragments, one band each */
.sr-bands{padding:40px 56px 56px;display:flex;flex-direction:column;gap:46px}
.sr-band{display:grid;grid-template-columns:230px minmax(0,1fr);gap:32px;align-items:start}
.sr-band > div:first-child b{display:block;font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.sr-band > div:first-child p{margin:10px 0 0;font-size:13px;line-height:1.45;color:var(--ink-2);text-wrap:pretty}
.sr-band .frame{position:relative;padding:4px 20px 16px;border:1px solid var(--rule-soft);border-radius:12px;background:var(--ground)}
.sr-new{position:relative;border-radius:5px;box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 55%,transparent);padding:1px 3px}
.sr-newnote{position:absolute;right:14px;top:-10px;padding:2px 8px;border-radius:4px;background:var(--accent);color:var(--on-accent,#08130d);font:600 9.5px/1.4 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase}
.sr-who{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px;font-size:13px;color:var(--ink-2)}
.sr-who li{display:grid;grid-template-columns:112px minmax(0,1fr);gap:10px;align-items:baseline}
.sr-who li span:first-child{font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.sr-who b{color:var(--ink);font-weight:600}
.sr-sp{max-width:560px}
.sr-sp .sechead{margin-bottom:12px}
.sr-sp .sechead h2{margin:0;font-size:16px}
"""

# --------------------------------------------------------------------------
# icons (the board's stroke set, SP_ICON in template/board.js)
# --------------------------------------------------------------------------
I = {
    "crate": '<path d="M3.5 8.5 12 4l8.5 4.5v8L12 21l-8.5-4.5z"></path><path d="M3.5 8.5 12 13l8.5-4.5M12 13v8"></path>',
    "gear": '<circle cx="12" cy="12" r="3.2"></circle><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"></path>',
    "truck": '<path d="M2 7h11v9H2zM13 10h4l3 3v3h-7z"></path><circle cx="6.5" cy="17.5" r="1.8"></circle><circle cx="16.5" cy="17.5" r="1.8"></circle>',
    "route": '<circle cx="6" cy="18" r="2"></circle><circle cx="18" cy="5" r="2"></circle><path d="M8 18h7a3.25 3.25 0 0 0 0-6.5H9a3.25 3.25 0 0 1 0-6.5h7"></path>',
    "chev": '<path d="M9 6l6 6-6 6"></path>',
    "person": '<circle cx="12" cy="8" r="3.5"></circle><path d="M5 20a7 7 0 0 1 14 0"></path>',
    "crew": '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path><circle cx="17" cy="9" r="2.5"></circle><path d="M15.5 14.5a5 5 0 0 1 6 5"></path>',
    "ship": '<path d="M3 15l2 5h14l2-5z"></path><path d="M6 15V9h12v6M12 9V4M9 6h6"></path>',
    "map": '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"></path><circle cx="12" cy="10" r="2"></circle>',
    "down": '<path d="M12 5v14M6 13l6 6 6-6"></path>',
    "alert": '<path d="M12 4l9 16H3z"></path><path d="M12 10v4.5M12 17.5v.01"></path>',
    "pause": '<path d="M9 5v14M15 5v14"></path>',
    "pipe": '<path d="M3 8h6v8h12M3 12h2M17 20v-2M21 20v-2"></path>',
    "building": '<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"></path><path d="M14 10h5a1 1 0 0 1 1 1v10M4 21h17M8 8h2M8 12h2M8 16h2M17 14h1M17 18h1"></path>',
    "shelves": '<path d="M4 3v18M20 3v18M4 8h16M4 14h16M4 20h16"></path><path d="M8 8V5.5M12 8V5M16 14v-2.5M9 14v-3"></path>',
}


def svg(name: str, cls: str = "") -> str:
    c = f' class="{cls}"' if cls else ""
    return f'<svg{c} viewBox="0 0 24 24" aria-hidden="true">{I[name]}</svg>'


def spi(name: str) -> str:
    return f'<span class="sp-i">{svg(name)}</span>'


def n(v: float) -> str:
    return f"{v:,.0f}"


# --------------------------------------------------------------------------
# the invented company. Shape from three real saves (NOTES.md, "Data facts"):
# 7 warehouse plans and 5 factory plans, 0-16 destinations, 8 import contracts.
# --------------------------------------------------------------------------
COMPANY = "BRIGHTWELL"
HOODS = {"GD": "garmentdistrict", "HK": "hellskitchen", "IC": "industrycity", "LM": "lowermanhattan",
         "MT": "midtown", "MH": "murrayhill", "TH": "thehamptons"}
HOOD_NAME = {"GD": "Garment District", "HK": "Hell's Kitchen", "IC": "Industry City", "LM": "Lower Manhattan",
             "MT": "Midtown", "MH": "Murray Hill", "TH": "The Hamptons"}

# shop brands: (name, type, products the shelves are set with)
BRANDS = {
    "burger": ("Brightwell Burger", "Fast Food Restaurant",
               ["Burger", "French Fries", "Soda Can", "Hotdog", "Pizza", "Salad", "Ice Cream", "Chicken Kabob Skewer", "Apple", "Banana"]),
    "coffee": ("Bean &amp; Co", "Coffee Shop",
               ["Cup of Coffee", "Cup of Tea", "Croissant", "Cupcake", "Donut", "Soda Can", "Ice Cream"]),
    "market": ("Brightwell Market", "Supermarket",
               ["Fresh Food", "Frozen Food", "Soda Can", "Energy Drink", "Ice Cream", "Apple", "Banana", "Carrot",
                "Lettuce", "Pear", "Tomato", "Bottle of Wine", "Croissant", "Cupcake", "Donut"]),
    "thread": ("Thread", "Clothing Store",
               ["Clothing (Classic Cheap Male)", "Clothing (Classic Cheap Female)", "Clothing (Modern Cheap Male)",
                "Clothing (Modern Cheap Female)", "Clothing (Classic Expensive Male)", "Clothing (Classic Expensive Female)",
                "Clothing (Modern Expensive Male)", "Clothing (Modern Expensive Female)", "Jewelry (Cheap)"]),
    "volt": ("Volt", "Electronics Store",
             ["Arty Fish Phone", "ZanaMan Phone", "ZanaMan Smartwatch", "Noize Boss Earbuds", "Rhythm By Tre",
              "Soda Can", "Energy Drink"]),
    "gleam": ("Gleam", "Jewelry Store", ["Jewelry (Cheap)", "Jewelry (Expensive)", "ZanaMan Smartwatch"]),
}

DEPOTS = {  # key: name, hood, products held (for the factory plans and contracts)
    "harbor": ("Harbor Depot", "IC"), "north": ("North Depot", "MH"), "fresh": ("Fresh Depot", "LM"),
    "voltd": ("Volt Depot", "GD"), "threadd": ("Thread Depot", "GD"), "midd": ("Midtown Depot", "MT"),
    "hamd": ("Hamptons Depot", "TH"),
}
FACTORIES = {"bakery": ("Food Works", "IC"), "bottling": ("Bottling Plant", "IC"), "voltp": ("Volt Plant", "IC"),
             "textile": ("Textile Mill", "IC"), "jewel": ("Jewel Works", "IC")}

VEHICLES = {"T1": ("Freight Truck T1", 8), "D500": ("Vord Courier D500", 6), "V150": ("Vord V150", 4),
            "Dash": ("Mersaidi Dash", 4), "UMC": ("UMC Nunavut", 4)}

FIRST = ["Rosa", "Femi", "Ines", "Nils", "Kaia", "Lior", "Edda", "Bram", "Cleo", "Dario", "Greta", "Hollis",
         "Mara", "Jonas", "Ada", "Tomas", "Priya", "Oskar", "Selma", "Ugo", "Yara", "Kofi", "Wren", "Pia"]
LAST = ["Duvall", "Hartley", "Gallo", "Brandt", "Ilves", "Castell", "Farrow", "Achterberg", "Jansen", "Kestrel",
        "Engstrom", "Moreau", "Okafor", "Lindqvist", "Brandauer", "Wrenfield", "Lund", "Vey", "Ruiz", "Marr",
        "Holm", "Addo", "Sato", "Navarro"]
PEOPLE = [f"{f} {l}" for f, l in zip(FIRST, LAST)]

RNG = random.Random(41)


def shop(brand: str, hood: str) -> dict:
    name, typ, items = BRANDS[brand]
    return {"name": f"{name} · {HOOD_NAME[hood]}", "short": f"{name} · {HOOD_NAME[hood]}", "hood": hood, "type": typ,
            "items": items, "kind": "shop"}


def depot(key: str) -> dict:
    name, hood = DEPOTS[key]
    return {"name": name, "short": name, "hood": hood, "type": "Warehouse", "kind": "wh", "key": key}


def factory(key: str) -> dict:
    name, hood = FACTORIES[key]
    return {"name": name, "short": name, "hood": hood, "type": "Factory", "kind": "fac", "key": key}


def targets_for(dest: dict, scale: int = 1) -> list[tuple[str, int, int, int]]:
    """(product, stock target, on hand, sells a day) for a shop's shelves, highest target first."""
    out = []
    for k, item in enumerate(dest["items"]):
        sells = max(8, int(RNG.gauss(120, 50) / (1 + k * .18)))
        target = int(round(sells * RNG.choice([3, 4, 4, 5]) / 10.0) * 10) * scale
        hand = int(target * RNG.uniform(.35, .95))
        out.append((item, target, hand, sells))
    return sorted(out, key=lambda t: -t[1])


FAC_GOODS = {"bakery": ["Croissant", "Cupcake", "Donut", "Burger", "Hotdog", "Pizza"],
             "bottling": ["Soda Can", "Energy Drink", "Cup of Coffee", "Cup of Tea"],
             "voltp": ["Arty Fish Phone", "ZanaMan Phone", "ZanaMan Smartwatch", "Noize Boss Earbuds", "Rhythm By Tre"],
             "textile": ["Clothing (Classic Cheap Male)", "Clothing (Classic Cheap Female)", "Clothing (Modern Cheap Male)",
                         "Clothing (Modern Cheap Female)", "Clothing (Classic Expensive Male)", "Clothing (Classic Expensive Female)",
                         "Clothing (Modern Expensive Male)", "Clothing (Modern Expensive Female)"],
             "jewel": ["Jewelry (Cheap)", "Jewelry (Expensive)", "ZanaMan Smartwatch"]}


def depot_targets(fac: str, dep: dict) -> list[tuple[str, int, int, int]]:
    out = []
    for item in FAC_GOODS[fac]:
        sells = int(RNG.uniform(900, 4200))
        target = int(round(sells * 3 / 1000.0)) * 1000
        out.append((item, target, int(target * RNG.uniform(.4, .9)), sells))
    return sorted(out, key=lambda t: -t[1])


def hood_html(h: str) -> str:
    return f'<span class="hood" data-hood-color="ba:neighborhood_{HOODS[h]}">{h}</span>'


def site_html(d: dict, mapb: bool = True) -> str:
    m = f'<button type="button" class="sr-map" aria-label="Show on map" title="Show on map">{svg("map")}</button>' if mapb else ""
    if d["kind"] == "pier":
        return f'<span class="nm"><span class="sp-i" style="color:var(--ink-3)">{svg("ship")}</span><span>{d["short"]}</span>{m}</span>'
    return f'<span class="nm">{hood_html(d["hood"])}<a class="ss-sl" href="#" data-tip="Open its page">{d["short"]}</a>{m}</span>'


def qmark(k: int) -> str:
    """A drawn default that is still an open question (NOTES.md, Open questions)."""
    return f'<span class="sr-q" data-tip="Default, open question {k}">Q{k}</span>'


# --------------------------------------------------------------------------
# the plans: one Logistics Manager each, a source, its vehicles, its destinations
# --------------------------------------------------------------------------
SHOPS = {}
for b, hoods in {"burger": ["MT", "MH", "HK", "LM", "GD", "TH", "IC"], "coffee": ["MT", "MH", "HK", "LM", "GD", "TH"],
                 "market": ["MT", "MH", "HK", "LM", "GD", "TH", "IC"], "thread": ["MT", "MH", "HK", "LM", "GD", "TH", "IC"],
                 "volt": ["MT", "MH", "HK", "LM", "GD", "TH", "IC"], "gleam": ["MT", "MH", "HK", "LM", "TH"]}.items():
    for h in hoods:
        SHOPS[f"{b}-{h}"] = shop(b, h)

# Hamptons Depot is a second-tier warehouse: Harbor Depot's plan stocks it with what the
# Hamptons shops sell, so one stop carries 26 minimum stock amounts (real stops reach 33).
HAMPTONS_ITEMS = list(dict.fromkeys(BRANDS["burger"][2] + BRANDS["coffee"][2] + BRANDS["thread"][2] + BRANDS["gleam"][2]))


def finding(kind: str, item: str) -> dict:
    """An existing Deliveries/Imports finding on a stop or product, by its kind's own label."""
    return {"kind": kind, "item": item}


KIND_LABEL = {"outruns": "Outsells its top-up", "topup": "Depot top-up too low", "target": "Top-up target too high",
              "shortfall": "Import shortfall", "order": "Weekly order too small", "feed": "Factory inputs"}


def dest(key: str, finds: list = None, empty: bool = False) -> dict:
    """A destination with its minimum stock amounts, and the existing findings on it."""
    if key in SHOPS:
        d = dict(SHOPS[key])
        d["targets"] = [] if empty else targets_for(d)
    else:
        d = depot(key)
        d["items"] = HAMPTONS_ITEMS
        d["targets"] = [(i, t * 6, h * 6, s * 6) for i, t, h, s in targets_for(d)]
    d["finds"] = finds or []
    return d


def fac_dest(fac: str, dep: str, finds: list = None) -> dict:
    d = depot(dep)
    d["targets"] = depot_targets(fac, d)
    d["finds"] = finds or []
    return d


def pier_dest(pier: str, items: list) -> dict:
    """An export stop: a factory plan delivering to a pier (HubSpoke has four, 2-3 items, 5,000-10,000)."""
    return {"name": pier, "short": pier, "hood": None, "type": "Pier", "kind": "pier", "finds": [],
            "targets": [(i, t, None, None) for i, t in items]}


def plan(who: str, src: dict, vehicles: list, dests: list, skill: int = 100) -> dict:
    return {"who": who, "src": src, "veh": vehicles, "dests": dests, "skill": skill}


def full_company() -> tuple[list, list]:
    RNG.seed(41)
    p = PEOPLE
    managers = [
        plan(p[0], depot("harbor"), [("T1", "Kai Rasmus"), ("T1", "Kofi Addo")],
             [dest(k) for k in ["burger-MT", "burger-MH", "burger-HK"]] + [dest("hamd")]
             + [dest(k) for k in ["burger-LM", "burger-GD", "burger-TH", "coffee-MT", "coffee-MH", "coffee-HK", "coffee-LM",
                                  "coffee-GD", "coffee-TH", "market-MT", "market-MH", "market-HK"]]),
        plan(p[1], depot("north"), [("T1", "Wren Sato"), ("T1", "Pia Navarro")],
             [dest("market-LM"), dest("market-GD", finds=[finding("outruns", "Frozen Food")]), dest("market-TH"), dest("market-IC"),
              dest("volt-MT"), dest("volt-MH", finds=[finding("target", "Energy Drink")]), dest("volt-HK"), dest("volt-LM"),
              dest("volt-GD"), dest("volt-TH"), dest("volt-IC"), dest("gleam-MT"), dest("gleam-MH")]),
        plan(p[2], depot("fresh"), [("T1", "Tove Lindahl")],
             [dest(k) for k in ["market-MT", "market-MH", "market-HK", "market-LM", "market-GD", "market-TH", "market-IC"]]),
        plan(p[3], depot("voltd"), [("T1", "Arne Basso")],
             [dest(k) for k in ["volt-MT", "volt-MH", "volt-HK", "volt-LM", "volt-GD", "volt-TH", "volt-IC"]], skill=85),
        plan(p[4], depot("threadd"), [("T1", "Mina Oduya"), ("D500", "Rafe Quill")],
             [dest(k) for k in ["thread-MT", "thread-MH", "thread-HK", "thread-LM", "thread-GD", "thread-TH", "thread-IC",
                                "gleam-HK", "gleam-LM", "gleam-TH"]]),
        plan(p[5], depot("midd"), [("V150", "Joss Ferro")], [dest("gleam-MT"), dest("gleam-MH")]),
        plan(p[6], depot("hamd"), [("Dash", "Lena Voss")],
             [dest("thread-TH"), dest("gleam-TH"), dest("coffee-TH"), dest("burger-TH")]),
        plan(p[7], factory("bakery"), [("Dash", "Ivo Brenner")], [fac_dest("bakery", "harbor"), fac_dest("bakery", "north")]),
        plan(p[8], factory("bottling"), [("V150", "Sana Iqbal")], [fac_dest("bottling", "harbor"), fac_dest("bottling", "fresh")]),
        plan(p[9], factory("voltp"), [("UMC", "Odile Faure")],
             [fac_dest("voltp", "voltd"), pier_dest("10 Pier", [("ZanaMan Phone", 10000), ("Arty Fish Phone", 8000), ("Noize Boss Earbuds", 5000)])]),
        plan(p[10], factory("textile"), [("Dash", "Teo Marsh")], [fac_dest("textile", "threadd")]),
        plan(p[11], factory("jewel"), [("Dash", "Ruth Kell")],
             [fac_dest("jewel", "threadd"), fac_dest("jewel", "midd"), pier_dest("7 Pier", [("Jewelry (Expensive)", 6000), ("Jewelry (Cheap)", 5000)])]),
    ]
    return managers, agents_full()


# --------------------------------------------------------------------------
# the contracts: one Purchasing Agent each, one importer, products to depots.
# Four retail importers (3, 4, 6, 8 Pier) for depots, four raw-goods importers
# (1, 2, 5, 9 Pier) for factories: one importer kind per contract.
# --------------------------------------------------------------------------
RETAIL = ["French Fries", "Salad", "Ice Cream", "Chicken Kabob Skewer", "Apple", "Banana", "Popcorn", "Cotton Candy", "Slushie",
          "Gift (Cheap)", "Fresh Food", "Frozen Food", "Carrot", "Lettuce", "Pear", "Tomato", "Bottle of Wine", "Umbrella"]
FRESH = ["Fresh Food", "Frozen Food", "Ice Cream", "Apple", "Banana", "Carrot", "Lettuce", "Pear", "Tomato", "Bottle of Wine",
         "Salad", "French Fries", "Gift (Cheap)", "Gift (Expensive)", "Umbrella", "Paper Bag"]
DAY = 333            # the board's day: (333 - 1) % 7 = 3, a Thursday
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def weekday(day: int) -> str:
    return WEEKDAYS[(day - 1) % 7]


def product(item: str, to: dict | None, smart: bool = True, finds: list = None) -> dict:
    uses = int(RNG.uniform(4, 60)) * 1000 if to and to["kind"] == "fac" else int(RNG.uniform(6, 90)) * 100
    level = int(round(uses * RNG.uniform(1.05, 1.4) / 100.0)) * 100
    last = int(uses * RNG.uniform(.85, 1.05))
    if finds:
        level = int(uses * .82 / 100) * 100
    return {"item": item, "to": to, "smart": smart, "amount": level, "last": last, "uses": uses, "finds": finds or []}


def contract(who: str | None, pier: str, products: list, smart: bool = True, skill: int = 100, active: bool = True,
             repeating: bool = True, next_day: int | None = 337, seated: bool = True) -> dict:
    return {"who": who, "pier": pier, "products": products, "smart": smart, "skill": skill, "active": active,
            "repeating": repeating, "next": next_day, "seated": seated}


def agents_full() -> list:
    RNG.seed(7)
    p = PEOPLE
    H, N, F, V, T, HA, MD = depot("harbor"), depot("north"), depot("fresh"), depot("voltd"), depot("threadd"), depot("hamd"), depot("midd")
    B, BO, VP, TX, J = factory("bakery"), factory("bottling"), factory("voltp"), factory("textile"), factory("jewel")
    return [
        contract(p[12], "3 Pier", [product(i, H) for i in RETAIL[:10]]
                 + [product(i, N, finds=[finding("shortfall", i)] if i == "Frozen Food" else None) for i in RETAIL[10:]]),
        contract(p[13], "4 Pier", [product(i, F) for i in FRESH]),
        contract(p[14], "6 Pier", [product(i, V) for i in ["Arty Fish Phone", "ZanaMan Phone", "Arty Fish Smartwatch", "Noize Boss Earbuds",
                                                         "Rhythm By Tre", "Paper Bag", "Energy Drink", "Umbrella"]]
                 + [product(i, HA) for i in ["Ice Cream", "French Fries", "Salad", "Apple", "Banana", "Paper Bag"]], skill=80),
        contract(p[15], "8 Pier", [product(i, T) for i in BRANDS["thread"][2]] + [product(i, MD) for i in ["Jewelry (Expensive)", "Arty Fish Smartwatch", "Paper Bag"]]
                 + [product(i, HA) for i in ["Jewelry (Cheap)", "Gift (Expensive)", "Umbrella"]]),
        contract(p[16], "1 Pier", [product(i, B) for i in ["Baking Mix", "Butter", "Dough", "Yeast", "Sugar", "Milk", "Ground Beef", "Raw Sausage", "Cheese"]]
                 + [product(i, BO, finds=[finding("feed", i)] if i == "Sugar" else None)
                    for i in ["Water", "Sugar", "Cola Flavoring", "Carbon Dioxide", "Caffeine Extract", "Flavor Syrup", "Ground Coffee Beans", "Tea Leaves"]]),
        contract(p[17], "2 Pier", [product(i, VP) for i in ["Plastic", "Metal Wire", "Glass", "Battery", "Capacitors", "Resistors", "Transistors",
                                                          "Integrated Circuits", "Copper Clad Laminate", "Microphone", "Speaker", "Metal Band"]]
                 + [product(i, J) for i in ["Plastic", "Metal Wire"]]),
        contract(p[18], "5 Pier", [product(i, TX) for i in ["Fabric (Cheap)", "Fabric (Expensive)", "Plastic", "Metal Wire", "Metal Band"]]
                 + [product(i, J) for i in ["Uncut Gems (Cheap)", "Uncut Gems (Expensive)", "Metal Band", "Clay", "Glass"]]
                 + [product(i, BO) for i in ["Lime Juice", "Caffeine Extract", "Hops", "Barley"]]),
        contract(p[19], "9 Pier", [product(i, B, smart=False) for i in ["Onion", "Pepper", "Russet Potatoes", "Vinaigrette", "Milk", "Butter",
                                                                      "Raw Sausage", "Ground Beef", "Cheese"]]
                 + [product(i, BO, smart=False) for i in ["Grapes", "Hops", "Barley", "Juniper Berries", "Blue Agave"]], smart=False),
    ]


# --------------------------------------------------------------------------
# rows
# --------------------------------------------------------------------------
def reach(pl: dict) -> int:
    """Locations the source's vehicles reach: only a vehicle with a driver counts. The skill limit
    is not drawn (the skill table is unknown: open question 9)."""
    return sum(VEHICLES[v][1] for v, drv in pl["veh"] if drv)


def chip(cls: str, text: str, tip: str = "", icon: str = "", href: bool = False) -> str:
    t = f' data-tip="{tip}"' if tip else ""
    i = svg(icon) if icon else ""
    tag = "a" if href else "span"
    h = ' href="#"' if href else ""
    return f'<{tag} class="sb-v {cls}"{h}{t}>{i}{text}</{tag}>'


def find_chip(f: dict, with_item: bool = True) -> str:
    """An existing finding, by its kind's label; it belongs to Deliveries or Imports and links there."""
    where = "Imports" if f["kind"] in ("shortfall", "order", "feed", "paused") else "Deliveries"
    text = f'{f["item"]} · {KIND_LABEL[f["kind"]].lower()}' if with_item else KIND_LABEL[f["kind"]]
    return chip("bad", text, f"Open the row in {where}", "down", href=True)


def plan_role_flags(pl: dict) -> list[str]:
    """The new role-level flags: these, and only these, count in the nav badge."""
    if pl.get("noplan"):
        return [chip("warn", "No plan", "A Logistics Manager at the headquarters with no delivery plan")]
    if pl.get("nomgr"):
        return [chip("bad", "Logistics Manager not assigned", "The game's words. Volt Depot needs what this factory makes")]
    out = []
    if not pl.get("seated", True):
        out.append(chip("warn", "Not seated", "Only seated Logistics Managers can be accessed") + qmark(10))
    r, d = reach(pl), len(pl["dests"])
    if d == 0:
        out.append(chip("warn", "No destinations", "The plan delivers nowhere"))
    if d > r:
        out.append(chip("warn", f"{d} stops · vehicles reach {r}", "Your current warehouse vehicles and drivers cannot support this many deliveries (the game's words)"))
    empty = sum(1 for x in pl["dests"] if not x["targets"])
    if empty:
        out.append(chip("warn", "Stop with no products" if empty == 1 else f"{empty} stops with no products", "A destination with nothing set to deliver"))
    return out


def plan_find_flags(pl: dict) -> list[str]:
    k = sum(len(x.get("finds", [])) for x in pl["dests"])
    return [chip("bad", f"{k} in Deliveries", "Existing findings on this plan's stops", "down", href=True)] if k else []


def dest_cell(pl: dict) -> str:
    r, d = reach(pl), len(pl["dests"])
    sub = "" if d > r else f'<small>vehicles reach {r}</small>'
    return f'<span class="sr-cap"><span>{d}</span>{sub}</span>'


def to_summary(dests: list) -> str:
    """Where a plan delivers, by brand with a count (a shop's hood tag is in the opened list), depots by name."""
    by: dict = {}
    for x in dests:
        key = x["short"].split(" · ")[0] if x["kind"] == "shop" else (f'{x["short"]} <em>export</em>' if x["kind"] == "pier" else x["short"])
        by[key] = by.get(key, 0) + 1
    parts = [f'{k}{f" <em>×{c}</em>" if c > 1 else ""}' for k, c in by.items()]
    return " · ".join(parts) if parts else '<span class="sr-dash">—</span>'


def skill_sub(skill: int, usual: int = 100, agent: bool = False) -> str:
    """Skill only where it differs from the rest (100%)."""
    if skill == usual:
        return ""
    extra = f" · −{round(25 * skill / 100)}% on prices" if agent else ""
    return f'<span class="sub">skill {skill}%{extra}</span>'


def manager_row(pl: dict, i: int, opened: bool = False, lit: bool = False) -> str:
    gap = pl.get("noplan") or pl.get("nomgr")
    cls = "sr-row" + (" sr-opened" if opened else "") + (" sr-gap" if gap else "") + (" sr-lit" if lit else "")
    who = ('<b>—</b>' if pl.get("nomgr") else f'<b>{pl["who"]}</b>{skill_sub(pl["skill"])}')
    src = '<span class="sr-dash">—</span>' if pl.get("noplan") else site_html(pl["src"])
    if gap:
        dcell = tcell = tocell = '<span class="sr-dash">—</span>'
    else:
        dcell = dest_cell(pl)
        tcell = n(sum(len(x["targets"]) for x in pl["dests"]))
        tocell = to_summary(pl["dests"])
    tog = "" if gap else f'<span class="sr-tog">{svg("chev")}</span>'
    return (f'<tr class="{cls}" data-sr="m{i}"><td class="l who">{who}</td><td class="l site">{src}</td>'
            f'<td>{dcell}</td><td>{tcell}</td><td class="l to">{tocell}</td>'
            f'<td class="l st">{"".join(plan_role_flags(pl) + plan_find_flags(pl))}</td><td class="tg">{tog}</td></tr>')


def target_line(d: dict, k: int = 4) -> str:
    if not d["targets"]:
        return '<em>none set</em>'
    k = 3 if any(len(t[0]) > 18 for t in d["targets"][:4]) else k
    parts = [f'{t[0]}<b>{n(t[1])}</b>' for t in d["targets"][:k]]
    more = f' <em>+{len(d["targets"]) - k}</em>' if len(d["targets"]) > k else ""
    return " · ".join(parts) + more


def target_table(d: dict) -> str:
    """Every minimum stock amount of an opened stop, never cut (real stops reach 33). Sorted by amount (default, open question 8)."""
    pier = d["kind"] == "pier"
    shop_ = d["kind"] == "shop"
    lab = "Deliver up to" if pier else "Minimum stock amount"
    rate = "Sells / day" if shop_ else "Uses / day"
    rows = []
    finds = {f["item"]: f for f in d.get("finds", [])}
    for item, tgt, hand, sells in d["targets"]:
        st = find_chip(finds[item], with_item=False) if item in finds else ""
        if pier:
            rows.append(f'<tr><td class="l">{item}</td><td>{n(tgt)}</td></tr>')
        else:
            stc = f'<td class="l st">{st}</td>' if finds else ""
            rows.append(f'<tr><td class="l">{item}</td><td>{n(tgt)}</td><td>{n(hand)}</td><td>{n(sells)}</td>{stc}</tr>')
    if pier:
        head = f'<thead><tr><th class="l">Product</th><th>{lab}</th></tr></thead>'
    else:
        sth = '<th class="l">Status</th>' if finds else ""
        head = (f'<thead><tr><th class="l">Product {qmark(8)}</th><th>{lab}</th><th>On hand</th><th>{rate}</th>{sth}</tr></thead>')
    if len(rows) > 12:
        half = (len(rows) + 1) // 2
        return (f'<div class="sr-cols"><table class="sr-tt">{head}<tbody>{"".join(rows[:half])}</tbody></table>'
                f'<table class="sr-tt">{head}<tbody>{"".join(rows[half:])}</tbody></table></div>')
    return f'<table class="sr-tt"{" style=\"max-width:420px\"" if pier else ""}>{head}<tbody>{"".join(rows)}</tbody></table>'


def dest_rows(pl: dict, show: int = 8, open_dest: int | None = None, show_all: bool = False) -> str:
    rows = []
    for k, d in enumerate(pl["dests"]):
        hide = "" if show_all or k < show else " sr-hide"
        flags = []
        if not d["targets"]:
            flags.append(chip("warn", "No products", "Nothing set to deliver here"))
        flags += [find_chip(f) for f in d.get("finds", [])]
        is_open = open_dest == k
        cls = "sr-dr" + (" sr-dopen" if is_open else "") + hide
        kind = {"shop": "", "wh": '<span class="sr-tag">warehouse</span>', "pier": '<span class="sr-tag info">export</span>'}[d["kind"]]
        rows.append(f'<tr class="{cls}" data-srd="{k}"><td class="no">{k + 1}</td>'
                    f'<td class="l nm"><span class="sr-dtog">{svg("chev")}</span>{site_html(d)}{kind}</td>'
                    f'<td>{len(d["targets"])}</td><td class="l tl">{target_line(d)}</td>'
                    f'<td class="l st">{"".join(flags)}</td>'
                    f'<td class="ln"><a class="sr-flow" href="#" data-tip="Follow it in Goods flow" aria-label="Follow in Goods flow">{svg("route")}</a></td></tr>')
        if d["targets"]:
            rows.append(f'<tr class="sr-tgrow{"" if is_open else " sr-hide"}" data-srt="{k}"><td colspan="6">{target_table(d)}</td></tr>')
    more = ""
    if not show_all and len(pl["dests"]) > show:
        more = (f'<p class="sr-more"><button type="button" data-sr-all>Show all {len(pl["dests"])} destinations</button>'
                f'<span>{len(pl["dests"]) - show} more</span></p>')
    head = ('<thead><tr><th class="no"></th><th class="l">Destination, in delivery order</th><th>Products</th>'
            '<th class="l">Minimum stock amount</th><th class="l">Status</th><th></th></tr></thead>')
    return f'<table class="sr-dt">{head}<tbody>{"".join(rows)}</tbody></table>{more}'


def vehicles_html(pl: dict) -> str:
    chips = []
    for v, drv in pl["veh"]:
        name, loc = VEHICLES[v]
        if drv:
            chips.append(f'<span class="v">{svg("truck")}{name} · {drv}<b>{loc}</b></span>')
        else:
            chips.append(f'<span class="v off" data-tip="No driver (the game\'s words): it reaches no location">{svg("truck")}{name} · No driver<b>0</b></span>')
    return (f'<div class="sr-veh"><span>Vehicles at {pl["src"]["short"]}</span>{"".join(chips)}'
            f'<span class="eq">= <b>{reach(pl)}</b> locations {qmark(9)}</span>'
            f'<span class="go"><a class="link" href="#">{svg("route")}Follow in Goods flow</a></span></div>')


def manager_detail(pl: dict, i: int, open_dest: int | None = None, show_all: bool = False) -> str:
    return (f'<tr class="sr-detail" data-srx="m{i}"><td colspan="7"><div class="sr-det">{vehicles_html(pl)}'
            f'{dest_rows(pl, open_dest=open_dest, show_all=show_all)}</div></td></tr>')


def managers_table(managers: list, opened: dict | None = None, lit: int | None = None, marks: bool = False) -> str:
    """opened: {index: (open_dest, show_all)}. marks: the open-question markers on the overview."""
    opened = opened or {}
    body = []
    parts = [("wh", "From warehouses · daily <b>02:00</b>"), ("fac", "From factories · daily <b>08:00</b>")]
    for kind, label in parts:
        rows = [(i, pl) for i, pl in enumerate(managers) if (pl["src"] or {}).get("kind") == kind]
        if not rows:
            continue
        q7 = qmark(7) if marks and kind == "wh" else ""
        body.append(f'<tr class="sr-part"><td colspan="7">{label} {q7}</td></tr>')
        for i, pl in rows:
            body.append(manager_row(pl, i, opened=i in opened, lit=lit == i))
            if not (pl.get("noplan") or pl.get("nomgr")):
                od, sa = opened.get(i, (None, False))
                det = manager_detail(pl, i, od, sa)
                body.append(det if i in opened else det.replace('class="sr-detail"', 'class="sr-detail sr-hide"', 1))
    idle = [(i, pl) for i, pl in enumerate(managers) if pl.get("noplan")]
    if idle:
        body.append('<tr class="sr-part"><td colspan="7">No plan</td></tr>')
        for i, pl in idle:
            body.append(manager_row(pl, i))
    q6 = qmark(6) if marks else ""
    q9 = qmark(9) if marks else ""
    head = (f'<thead><tr><th class="l">Logistics Manager {q6}</th><th class="l">From</th>'
            f'<th>Destinations {q9}</th><th>Products</th><th class="l">Delivers to</th><th class="l">Status</th><th></th></tr></thead>')
    return f'<div class="scrollx"><table class="sb-t sr-t" data-sr-table="managers">{head}<tbody>{"".join(body)}</tbody></table></div>'


def agent_role_flags(c: dict) -> list[str]:
    """The new role-level flags (counted in the nav badge)."""
    if c.get("idle"):
        return [chip("warn", "No contract", "The game's words: a Purchasing Agent with no import contract")]
    out = []
    if c["who"] is None:
        out.append(chip("bad", "Purchasing Agent not assigned", "The game cancels the order: “We couldn't find your Purchasing Agent to deliver your imports”") + qmark(4))
    if not c.get("seated", True):
        out.append(chip("warn", "Not seated", "Only seated Purchasing Agents can be accessed") + qmark(10))
    nowh = sum(1 for p in c["products"] if p["to"] is None)
    if nowh:
        out.append(chip("warn", f"{nowh} with no designated warehouse", "One or more products has no assigned designated warehouse (the game's words)"))
    return out


def agent_find_flags(c: dict) -> list[str]:
    """Existing Imports findings: not counted in this view's badge. A paused contract whose products
    are still needed is the existing `paused` finding, shown by its own label."""
    out = []
    if not c["active"] and c["repeating"] and c.get("needed"):
        out.append(chip("bad", "Import paused · in Imports", "The existing finding: paused while its products are still needed", "pause", href=True))
    k = sum(len(p["finds"]) for p in c["products"])
    if k:
        out.append(chip("bad", f"{k} in Imports", "Existing findings on this contract's products", "down", href=True))
    return out


def delivers(c: dict) -> bool:
    """A delivery is coming: active, and an agent to run it (with none the game cancels the order)."""
    return c["active"] and c["who"] is not None


def next_cell(c: dict) -> str:
    if not delivers(c):
        return '<span class="sr-dash">—</span>'
    return f'Day {c["next"]} · {weekday(c["next"])}'


def delivery_cell(c: dict) -> str:
    if not c["repeating"]:
        return 'One-time delivery' + ('<span class="sub">delivered</span>' if not c["active"] else "")
    paused = '<span class="sub">paused</span>' if not c["active"] else ""
    return ("Smart Delivery" if c["smart"] else "Weekly amount") + paused


def agent_row(c: dict, i: int, opened: bool = False, lit: bool = False) -> str:
    idle = c.get("idle")
    cls = "sr-row" + (" sr-opened" if opened else "") + (" sr-gap" if idle or c["who"] is None else "") + (" sr-lit" if lit else "")
    who = ('<b>—</b>' if c["who"] is None else f'<b>{c["who"]}</b>{skill_sub(c["skill"], agent=True)}')
    dash = '<span class="sr-dash">—</span>'
    if idle:
        return (f'<tr class="{cls}" data-sr="a{i}"><td class="l who">{who}</td><td class="l">{dash}</td><td class="l">{dash}</td>'
                f'<td class="l">{dash}</td><td>{dash}</td><td class="l to">{dash}</td>'
                f'<td class="l st">{"".join(agent_role_flags(c))}</td><td class="tg"></td></tr>')
    by: dict = {}
    for p in c["products"]:
        if p["to"]:
            by.setdefault(p["to"]["short"], [p["to"], 0])
            by[p["to"]["short"]][1] += 1
    items = list(by.items())
    to = " · ".join(f'{name} <em>×{k}</em>' for name, (d, k) in items[:3]) + (f' <em>+{len(items) - 3}</em>' if len(items) > 3 else "")
    pier = f'<span class="nm"><span class="sp-i" style="color:var(--ink-3)">{svg("ship")}</span>{c["pier"]}</span>'
    return (f'<tr class="{cls}" data-sr="a{i}"><td class="l who">{who}</td><td class="l site">{pier}</td>'
            f'<td class="l dl">{delivery_cell(c)}</td><td class="l">{next_cell(c)}</td><td>{len(c["products"])}</td><td class="l to">{to}</td>'
            f'<td class="l st">{"".join(agent_role_flags(c) + agent_find_flags(c))}</td><td class="tg"><span class="sr-tog">{svg("chev")}</span></td></tr>')


def product_rows(c: dict, show: int = 10, show_all: bool = False) -> str:
    unit = "in stock" if c["smart"] else "a week"
    rows, prev = [], object()
    for k, p in enumerate(c["products"]):
        hide = "" if show_all or k < show else " sr-hide"
        flags = []
        if p["to"] is None:
            flags.append(chip("warn", "No designated warehouse", "Nothing is delivered for it"))
        flags += [find_chip(f, with_item=False) for f in p["finds"]]
        same = p["to"] is not None and p["to"] is prev
        to = "" if same else site_html(p["to"]) if p["to"] else '<span class="sr-dash">—</span>'
        prev = p["to"]
        link = "" if not p["to"] else '<a class="link" href="#">Imports ›</a>'
        rows.append(f'<tr class="{hide.strip()}"><td class="l">{p["item"]}</td><td class="l nm">{to}</td>'
                    f'<td>{n(p["amount"])} <span class="sb-unit">{unit}</span></td><td>{n(p["last"])}</td><td>{n(p["uses"]) if p["to"] else "—"}</td>'
                    f'<td class="l st">{"".join(flags)}</td><td class="ln">{link}</td></tr>')
    more = ""
    if not show_all and len(c["products"]) > show:
        more = (f'<p class="sr-more"><button type="button" data-sr-all>Show all {len(c["products"])} products</button>'
                f'<span>{len(c["products"]) - show} more</span></p>')
    lab = "# target" if c["smart"] else "Amount a week"
    head = (f'<thead><tr><th class="l">Product</th><th class="l">Designated warehouse</th><th>{lab}</th><th>Previous</th>'
            f'<th>Uses / week</th><th class="l">Status</th><th></th></tr></thead>')
    return f'<table class="sr-dt">{head}<tbody>{"".join(rows)}</tbody></table>{more}'


def agent_detail(c: dict, i: int, show_all: bool = False) -> str:
    when = (f'next delivery Day {c["next"]} · {weekday(c["next"])} 08:00 · order by Day {c["next"] - 1} · {weekday(c["next"] - 1)} 20:00'
            if delivers(c) else "no delivery coming")
    line = (f'<div class="sr-veh"><span class="v">{svg("ship")}{c["pier"]}</span><span>{when}</span>'
            f'<span class="go"><a class="link" href="#">{svg("route")}Follow in Goods flow</a></span></div>')
    return (f'<tr class="sr-detail" data-srx="a{i}"><td colspan="8"><div class="sr-det">{line}'
            f'{product_rows(c, show_all=show_all)}</div></td></tr>')


def agents_table(agents: list, opened: dict | None = None, lit: int | None = None, marks: bool = False) -> str:
    opened = opened or {}
    body = []
    for i, c in enumerate(agents):
        body.append(agent_row(c, i, opened=i in opened, lit=lit == i))
        if not c.get("idle"):
            det = agent_detail(c, i, opened.get(i, False))
            body.append(det if i in opened else det.replace('class="sr-detail"', 'class="sr-detail sr-hide"', 1))
    q3 = qmark(3) if marks else ""
    head = (f'<thead><tr><th class="l">Purchasing Agent</th><th class="l">Importer {q3}</th><th class="l">Delivery</th>'
            '<th class="l">Next delivery</th><th>Products</th><th class="l">To</th><th class="l">Status</th><th></th></tr></thead>')
    return f'<div class="scrollx"><table class="sb-t sr-t" data-sr-table="agents">{head}<tbody>{"".join(body)}</tbody></table></div>'


def group_head(icon: str, title: str, counts: list[tuple[str, str]]) -> str:
    c = "".join(f'<span><b>{v}</b>{lab}</span>' for v, lab in counts)
    return f'<div class="sr-gh"><h3>{svg(icon)}{title}</h3><span class="n">{c}</span></div>'


def managers_group(managers: list, **kw) -> str:
    real = [m for m in managers if not m.get("nomgr")]
    d = sum(len(m["dests"]) for m in real)
    t = sum(len(x["targets"]) for m in real for x in m["dests"])
    counts = [(str(len(real)), "manager" if len(real) == 1 else "managers"), (str(d), "destinations"), (n(t), "products")]
    return group_head("truck", "Logistics Managers", counts) + managers_table(managers, **kw)


def agents_group(agents: list, **kw) -> str:
    real = [a for a in agents if not a.get("idle")]
    p = sum(len(a["products"]) for a in real)
    people = len([a for a in agents if a.get("who")])
    counts = [(str(people), "agent" if people == 1 else "agents"), (str(len(real)), "contract" if len(real) == 1 else "contracts"),
              (str(p), "products")]
    return group_head("ship", "Purchasing Agents", counts) + agents_table(agents, **kw)


# --------------------------------------------------------------------------
# page chrome: the shipped sidebar (PR #169), Supply open, the new view lit
# --------------------------------------------------------------------------
VIEW = "Plans &amp; contracts"


def sidebar(badge: int = 0, current: str = "roles", marks: bool = False) -> str:
    views = [("changes", "Changes", 16), ("roles", VIEW, badge), ("imports", "Imports", 10), ("deliveries", "Deliveries", 6),
             ("production", "Production", 0), ("flow", "Goods flow", 0)]
    qm = (qmark(1) + qmark(2)) if marks else ""
    local = "".join(f'<a href="#supply/{k}"{" class=\"on\" aria-current=\"page\"" if k == current else ""}>{lab}'
                    f'{qm if k == "roles" else ""}{f"<small>{c}</small>" if c else ""}</a>' for k, lab, c in views)
    return f"""<nav class="sd" id="mast" aria-label="Main">
  <div class="sd-in" id="sdIn">
    <div class="sd-head" id="sdHead">
      <div class="brand" id="brand"><span class="wordmark" id="title">{COMPANY}</span><span class="dot"></span></div>
    </div><button type="button" class="ss-q" id="ssField" aria-label="Search the board"><span class="ss-lens"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path></svg></span><span class="ss-ql">Search the board</span><span class="ss-kbd" aria-hidden="true">/</span></button>
    <div class="sd-areas" id="nav"><a href="#overview"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"></path></svg><span>Overview</span></a><a href="#businesses"><svg viewBox="0 0 24 24">{I["building"]}</svg><span>Businesses</span><svg class="nx-i sd-cv" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg></a><a href="#supply" class="on sd-open" aria-current="page"><svg viewBox="0 0 24 24">{I["crate"]}</svg><span>Supply</span><svg class="nx-i sd-cv" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg></a><nav class="nx-local" id="localNav" aria-label="Supply views">{local}</nav><a href="#staffing"><svg viewBox="0 0 24 24">{I["crew"]}</svg><span>Staffing</span><svg class="nx-i sd-cv" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg></a><a href="#expansion"><svg viewBox="0 0 24 24"><path d="M4 18 10 12l4 4 6-7"></path><path d="M15 9h5v5"></path></svg><span>Expansion</span><svg class="nx-i sd-cv" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg></a></div>
    <div class="sd-refs" id="navRefs" role="group" aria-label="Reference"><a href="#map"><svg viewBox="0 0 24 24" aria-hidden="true">{I["map"]}</svg><span>City map</span></a><a href="#wiki"><svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"></path><path d="M4 20.5V5.5M20 18v3H6.5"></path><path d="M9 8h7M9 11.5h5"></path></svg><span>Wiki</span></a></div>
    <div class="sd-foot">
      <div class="clock tr" id="clock"><b>Day {DAY}<i>·</i>{weekday(DAY)} 15:40</b><small>YEAR 1</small></div>
      <div class="sd-row" id="sdRow">
        <button type="button" class="sd-ib" aria-label="More"><svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="18" cy="12" r="1.4"></circle></svg></button>
        <button type="button" class="sd-ib sd-tog" aria-label="Collapse the sidebar"><svg class="nx-i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect><path d="M9 4.5v15"></path></svg></button>
      </div>
    </div>
  </div>
</nav>"""


def toolbar(scope: str = "Whole company") -> str:
    opts = "".join(f"<option>{x}</option>" for x in ["Whole company", "All warehouses", "All factories"])
    sel = f'<option selected>{scope}</option>' if scope not in ("Whole company",) else ""
    return f"""<div class="nx-localrow" id="localRow"><div class="nx-ctl" id="viewCtl"><div class="sbv-bar" data-view-ctl="supply/roles">
      <label class="sbv-scope"><span class="sbv-sel">{svg("building")}<select aria-label="Scope of Plans &amp; contracts">{sel}{opts}
      <optgroup label="Warehouses">{"".join(f"<option>{v[0]}</option>" for v in DEPOTS.values())}</optgroup>
      <optgroup label="Factories">{"".join(f"<option>{v[0]}</option>" for v in FACTORIES.values())}</optgroup></select></span></label>
    </div></div></div>"""


def page(body: str, badge: int = 0, scope: str = "Whole company", crumb: str = "", current: str = "roles", bar: bool = True,
         marks: bool = False) -> str:
    cr = (f'<p class="sb-verdict"><span class="sb-crumb">{crumb}<button type="button" aria-label="Back to the view as it was">&times;</button></span></p>'
          if crumb else "")
    return f"""<div class="sd-app" id="sdApp" style="height:100%">
{sidebar(badge, current, marks)}
<div class="wrap">
  {toolbar(scope) if bar else ""}
  <div class="page" id="pageSupply"><section class="sec sb-view rv in" id="secRoles">{cr}{body}</section></div>
</div>
</div>"""


# --------------------------------------------------------------------------
# artboards
# --------------------------------------------------------------------------
def badge_of(managers: list, agents: list) -> int:
    """The nav badge: the new role-level flags only, never the existing findings."""
    return sum(len(plan_role_flags(m)) for m in managers) + sum(len(agent_role_flags(a)) for a in agents)


def board_main() -> str:
    m, a = full_company()
    return page(managers_group(m, marks=True) + agents_group(a, marks=True), badge=badge_of(m, a), marks=True)


def board_open_manager() -> str:
    m, a = full_company()
    return page(managers_group(m, opened={0: (3, False)}) + agents_group(a), badge=badge_of(m, a))


def board_open_agent() -> str:
    m, a = full_company()
    return page(managers_group(m) + agents_group(a, opened={0: False}), badge=badge_of(m, a))


def problem_company() -> tuple[list, list]:
    m, a = full_company()
    RNG.seed(99)
    # Thread Depot: the Vord Courier lost its driver, so 10 stops on 8 locations
    m[4]["veh"] = [("T1", "Mina Oduya"), ("D500", None)]
    m[4]["dests"][1]["finds"] = [finding("outruns", "Clothing (Modern Cheap Female)")]
    m[4]["dests"][4]["targets"] = []
    # Midtown Depot: a manager whose plan lists nobody
    m[5]["dests"] = []
    # Hamptons Depot's manager is not seated at a Computer Workstation
    m[6]["seated"] = False
    # Volt Plant: its manager left; Volt Depot needs what it makes
    m[9] = {"who": None, "src": factory("voltp"), "veh": [("UMC", "Odile Faure")], "dests": [], "skill": 0, "nomgr": True}
    # a Logistics Manager on staff with no plan at all
    m.append({"who": "Yara Holm", "src": None, "veh": [], "dests": [], "skill": 100, "noplan": True})
    # contracts
    a[2]["active"], a[2]["needed"] = False, True          # paused: isActive false, isRepeatingOrder true
    a[3]["who"] = None                                     # no agent
    a[7]["seated"] = False
    a[0]["products"][4]["to"] = None
    a[0]["products"][7]["to"] = None
    a.append({"who": "Kofi Brandauer", "pier": "", "products": [], "smart": True, "skill": 100, "active": True, "repeating": True,
              "next": None, "idle": True})
    return m, a


def board_problems() -> str:
    m, a = problem_company()
    return page(managers_group(m, opened={4: (1, True)}) + agents_group(a), badge=badge_of(m, a))


def board_empty() -> str:
    body = f"""<div class="sr-empty">
      <div>{svg("truck")}<div><h3>No Logistics Manager yet</h3><p>Delivery plans: <b>BizMan › Logistics Managers</b></p></div></div>
      <div>{svg("ship")}<div><h3>No Purchasing Agent yet</h3><p>Import contracts: <b>BizMan › Purchasing Agents</b></p></div></div>
    </div>"""
    return page(body, bar=False)


def small_company() -> tuple[list, list]:
    RNG.seed(5)
    m = [plan("Rosa Duvall", depot("harbor"), [("T1", "Kofi Addo")],
              [dest(k) for k in ["burger-MT", "burger-MH", "coffee-MT", "coffee-MH", "burger-HK", "coffee-HK"]])]
    RNG.seed(6)
    H = depot("harbor")
    a = [contract("Mara Okafor", "3 Pier", [product(i, H) for i in ["French Fries", "Salad", "Ice Cream", "Chicken Kabob Skewer", "Apple",
                                                                 "Banana", "Popcorn", "Cotton Candy", "Slushie", "Gift (Cheap)",
                                                                 "Umbrella", "Paper Bag", "Fresh Food", "Frozen Food"]]),
         contract("Jonas Lindqvist", "4 Pier", [product(i, H, smart=False) for i in ["Soda Can", "Energy Drink"]], smart=False,
                  active=False, repeating=False, next_day=None)]
    return m, a


def board_small() -> str:
    m, a = small_company()
    return page(managers_group(m, opened={0: (None, False)}) + agents_group(a), badge=0)


# --- E: the links in and out ------------------------------------------------------
def links_board() -> str:
    m, a = full_company()
    pl = m[0]
    d3 = pl["dests"][2]

    def band(label: str, text: str, frag: str) -> str:
        return f'<div class="sr-band"><div><b>{label}</b><p>{text}</p></div><div class="frame">{frag}</div></div>'

    # 1. out of the view: a destination row, its links shown
    row = (f'<table class="sr-dt" style="margin-top:14px"><tbody><tr class="sr-dr sr-show"><td class="no">3</td>'
           f'<td class="l nm"><span class="sr-dtog">{svg("chev")}</span><span class="nm">{hood_html(d3["hood"])}'
           f'<a class="ss-sl sr-new" href="#">{d3["short"]}</a><button type="button" class="sr-map sr-new" aria-label="Show on map">{svg("map")}</button></span></td>'
           f'<td>{len(d3["targets"])}</td><td class="l tl">{target_line(d3)}</td>'
           f'<td class="l st"><a class="sb-v bad sr-new" href="#">{svg("down")}French Fries · outsells its top-up</a></td>'
           f'<td class="ln"><a class="sr-flow sr-new" href="#">{svg("route")}</a></td></tr></tbody></table>'
           f'<table class="sr-dt" style="margin-top:10px"><tbody><tr class="sr-show"><td class="l">Frozen Food</td><td class="l nm">{site_html(depot("north"), False)}</td>'
           f'<td>6,200 <span class="sb-unit">in stock</span></td><td>5,140</td><td>7,560</td>'
           f'<td class="l st"><a class="sb-v bad sr-new" href="#">{svg("down")}Import shortfall</a></td><td class="ln"><a class="link sr-new" href="#">Imports ›</a></td></tr></tbody></table>')
    out = ('Name: the site page. Map pin: the City map. Route icon: Goods flow, following that site. '
           'A finding chip: its row in Deliveries or Imports, with a crumb back here.')

    # 2. Goods flow: the followed site says who delivers it, every source, from the data
    def sources(key: str) -> list[str]:
        lines = []
        for c in a:
            k = sum(1 for p in c["products"] if p["to"] and p["to"].get("key") == key)
            if k:
                lines.append(f'<li><span>Day {c["next"]} · {weekday(c["next"])}</span><span><a class="link" href="#"><b>{c["who"]}</b> · {c["pier"]}, {k} products</a></span></li>')
        for x in m:
            for s, d in enumerate(x["dests"]):
                if d.get("key") == key and d["kind"] == "wh":
                    when = "daily 02:00" if x["src"]["kind"] == "wh" else "daily 08:00"
                    lines.append(f'<li><span>{when}</span><span><a class="link" href="#"><b>{x["who"]}</b> · {x["src"]["short"]}, stop {s + 1} of {len(x["dests"])}</a></span></li>')
        return lines

    harbor = sources("harbor")
    flow = f"""<div class="sbf-panel" style="margin-top:14px">
      <div class="sbf-card"><h3>{d3["short"]}<small>Fast Food Restaurant</small></h3>
        <table class="sb-t sbf-t"><thead><tr><th class="l">Product</th><th>On hand</th><th>Needs before refill</th><th>Refill brings</th></tr></thead>
        <tbody>{"".join(f'<tr><td class="l">{t[0]}</td><td>{n(t[2])}</td><td>{n(t[3])}</td><td>{n(t[1] - t[2])}</td></tr>' for t in d3["targets"][:4])}</tbody></table>
        <a class="link" href="#">See its rows ›</a></div>
      <div class="sbf-card sr-new"><span class="sr-newnote">new</span><h3>{svg("truck")}Delivered by</h3>
        <ul class="sr-who"><li><span>daily 02:00</span><span><a class="link" href="#"><b>{pl["who"]}</b> · {pl["src"]["short"]}, stop 3 of {len(pl["dests"])}</a></span></li></ul></div>
    </div>
    <div class="sbf-panel">
      <div class="sbf-card sr-new"><span class="sr-newnote">new · Harbor Depot followed</span><h3>{svg("truck")}Delivered by · {len(harbor)}</h3>
        <ul class="sr-who">{"".join(harbor)}</ul></div>
      <div class="sbf-card sr-new"><span class="sr-newnote">new · its own plan</span><h3>{svg("route")}Sends</h3>
        <ul class="sr-who"><li><span>daily 02:00</span><span><a class="link" href="#"><b>{pl["who"]}</b> · {len(pl["dests"])} destinations, {sum(len(x["targets"]) for x in pl["dests"])} products</a></span></li></ul></div>
    </div>"""
    flow_t = 'A new card beside "Changes on its route", listing every source of the followed site. Each line opens this view on that plan or contract.'

    # 3. Imports and Deliveries: the head of a site says who, as a link
    heads = f"""<details class="sb-obj" style="margin-top:6px"><summary><span class="ic">{svg("crate")}</span>
      <span class="who"><span class="nm">{hood_html("IC")}<a class="ss-sl" href="#">Harbor Depot</a></span><span class="how"><span>{spi("truck")}<em>weekly from
      <a class="link sr-new" href="#" data-tip="{a[0]["who"]}'s contract · Plans &amp; contracts"><b>3 Pier</b></a>, Monday</em></span>
      <span>{spi("route")}<em>feeds 16 sites · <a class="link sr-new" href="#">{pl["who"]}'s plan</a></em></span></span></span>
      <span class="sb-stats"><span class="sb-stat"><span class="lab">On the floor</span><span class="v">412,880</span></span><span class="sb-stat"><span class="lab">Uses / week</span><span class="v">688,300</span></span></span>
      <span class="cnt red">2 changes to type</span><span class="tog">{svg("chev")}</span></summary></details>
      <details class="sb-obj"><summary><span class="ic">{svg("shelves")}</span>
      <span class="who"><span class="nm">{hood_html("HK")}<a class="ss-sl" href="#">{d3["short"]}</a></span><span class="how"><span>{spi("truck")}<em>each morning from
      <a class="link sr-new" href="#" data-tip="{pl["who"]}'s plan, stop 3 · Plans &amp; contracts"><b>Harbor Depot</b></a></em></span></span></span>
      <span class="sb-stats"><span class="sb-stat"><span class="lab">Sells / day</span><span class="v">1,180</span></span></span>
      <span class="tog">{svg("chev")}</span></summary></details>"""
    heads_t = 'Imports and Deliveries already name the source in each site\'s head. The names become links to the plan or contract.'

    # 4. the site page: Feeds says whose plan
    sp = f"""<div class="sr-sp"><section id="sp-feeds" style="margin-top:12px">
      <div class="sechead"><span class="sp-ico">{svg("pipe")}</span><h2>Feeds</h2><div class="aside"><a class="link sr-new" href="#">{pl["who"]}'s plan · 02:00 ›</a></div></div>
      <div class="sp-feeds">{"".join(f'<div class="sp-feed">{hood_html(x["hood"])}<span>{x["short"]}</span><span class="sp-tr"><i style="--w:{w}%"></i></span><span class="sp-rate">{n(r)}/day</span></div>' for x, w, r in [(pl["dests"][0], 100, 1460), (pl["dests"][14], 88, 1290), (pl["dests"][1], 71, 1040), (pl["dests"][7], 52, 760)])}</div>
    </section></div>"""
    sp_t = 'A warehouse or factory page: one link in the Feeds head. A shop\'s page links the plan that fills it the same way.'

    # 5. arriving: the row lit, opened, with the crumb back
    arr = (f'<p class="sb-verdict" style="margin:14px 0 6px"><span class="sb-crumb" style="margin-left:0">from Goods flow<button type="button">&times;</button></span></p>'
           + managers_table(m[:1], opened={0: (2, False)}, lit=0))
    arr_t = 'Arriving from a link: the plan opens, its row lit, the stop opened. The crumb goes back, as on the other Supply views.'

    return f"""<div class="page" id="pageSupply" style="padding:0"><div class="sr-bands">
      {band("1 · Out of the view", out, row)}
      {band("2 · Goods flow", flow_t, flow)}
      {band("3 · Imports, Deliveries", heads_t, heads)}
      {band("4 · Site page", sp_t, sp)}
      {band("5 · Arriving here", arr_t, arr)}
    </div></div>"""


# --------------------------------------------------------------------------
# wiring: rows open, destinations open, show all
# --------------------------------------------------------------------------
WIRE = r"""
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    document.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a) e.preventDefault(); });
    $$('tr.sr-row').forEach(tr => tr.addEventListener('click', e => {
      if (e.target.closest('a, button, select')) return;
      const det = tr.parentElement.querySelector(`tr[data-srx="${tr.dataset.sr}"]`); if (!det) return;
      const on = det.classList.contains('sr-hide'); det.classList.toggle('sr-hide', !on); tr.classList.toggle('sr-opened', on);
    }));
    $$('tr.sr-dr').forEach(tr => tr.addEventListener('click', e => {
      if (e.target.closest('a, button')) return;
      const t = tr.parentElement.querySelector(`tr[data-srt="${tr.dataset.srd}"]`); if (!t) return;
      const on = t.classList.contains('sr-hide'); t.classList.toggle('sr-hide', !on); tr.classList.toggle('sr-dopen', on);
    }));
    $$('[data-sr-all]').forEach(b => b.addEventListener('click', () => {
      const tbl = b.closest('.sr-det').querySelector('table.sr-dt');
      $$(':scope > tbody > tr.sr-hide', tbl).forEach(r => { if (!r.matches('[data-srt]')) r.classList.remove('sr-hide'); });
      b.closest('.sr-more').remove();
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
<div class="sr-board" data-theme="{{theme}}" style="width: __W__px; height: __H__px; background: var(--ground); color: var(--ink);">
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
<body><div class="sr-board" style="width: __W__px; height: __H__px; background: var(--ground); color: var(--ink);">
__BODY__
</div>
<script>window.addEventListener('load', function () {__WIRE__});</script></body></html>
"""

W = 1440
# file, title, builder, width, height
BOARDS = [
    ("Main.dc.html", "A · Plans & contracts, the whole company", board_main, W, 1500),
    ("OpenManager.dc.html", "B1 · A manager opened: destinations, one stop's targets", board_open_manager, W, 2500),
    ("OpenAgent.dc.html", "B2 · An agent opened: the contract's products", board_open_agent, W, 1980),
    ("Problems.dc.html", "C · Problems flagged", board_problems, W, 2710),
    ("Empty.dc.html", "D1 · No roles yet", board_empty, W, 760),
    ("Small.dc.html", "D2 · Small company: one manager, two agents", board_small, W, 900),
    ("Links.dc.html", "E · Links in and out", links_board, W, 2300),
]
TIPS = {
    "Main.dc.html": "Every Logistics Manager's delivery plan and every Purchasing Agent's import contract, one row each. Click a row to open it. Dashed blue Q-marks: a drawn default that is still an open question (NOTES.md).",
    "OpenManager.dc.html": "Rosa Duvall's plan opened: the vehicles at the source, the destinations in delivery order (8 of 16, Show all), stop 4 (a second-tier warehouse, 26 products) opened to every minimum stock amount. Click any stop.",
    "OpenAgent.dc.html": "Mara Okafor's contract opened: 18 products, their designated warehouse, the Smart Delivery target, last week and use. 10 shown, Show all.",
    "Problems.dc.html": "Every role-level flag at once (these alone count in the nav badge): stops over the vehicles' reach, no destinations, a stop with no products, not seated, a factory with no Logistics Manager while its depot needs it, a manager with no plan; a paused contract, a contract with no agent, products with no designated warehouse, an agent with no contract. Existing findings show as their own label and link to their view.",
    "Empty.dc.html": "No Logistics Manager and no Purchasing Agent on staff.",
    "Small.dc.html": "One manager: the plan is open by default. Two agents, one a finished one-time delivery.",
    "Links.dc.html": "Green outlines are new links. Everything else is the shipped board.",
}


def css() -> str:
    return board_css() + SR_CSS


def build(preview: bool = False) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    style = css()
    boards, order, notes = {}, [], {}
    x, y, col_h = 0, 0, 0
    layout = {"Main.dc.html": (0, 0), "OpenManager.dc.html": (W + 200, 0), "OpenAgent.dc.html": (2 * (W + 200), 0),
              "Problems.dc.html": (0, 2900), "Empty.dc.html": (W + 200, 2900), "Small.dc.html": (W + 200, 2900 + 760 + 360),
              "Links.dc.html": (2 * (W + 200), 2900)}
    for name_, title, builder, w, h in BOARDS:
        body = builder()
        props = {"dark": {"editor": "boolean", "default": True, "section": "Theme"}, "$preview": {"width": w, "height": h}}
        page_ = (PAGE.replace("__TITLE__", "Plans &amp; contracts: " + title.replace("&", "&amp;")).replace("__FONTS__", FONTS.replace("&", "&amp;"))
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
        bx, by = layout[name_]
        boards[name_] = {"x": bx, "y": by, "w": w, "h": h, "title": title, "is_interactive": True}
        order.append(name_)
        notes["try-" + name_.split(".")[0].lower()] = {"x": bx, "y": by - 230, "w": 620, "maxH": 190, "text": TIPS[name_]}
    index = {"v": 3, "createdOnFiles": {"v": 1, "at": CREATED_AT}, "title": "Supply: Plans & contracts", "launch": {"view": "canvas"},
             "pages": [], "boards": boards, "order": order, "notes": notes, "designSystems": []}
    (ROOT / "canvas.json").write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8", newline="\n")
    print("wrote", len(order), "artboards")


if __name__ == "__main__":
    build("--preview" in sys.argv)
