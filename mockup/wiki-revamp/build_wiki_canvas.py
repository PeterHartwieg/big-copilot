"""Generate the Wiki tab mockup as Claude Design artboards.

Reuses the board's tokens, masthead and sphere from mockup/revamp/build_canvas.py so the
wiki reads as one more page of the same board. Content is the Gift Shop sample from
mockup/wiki/wiki-data.js (extracted 13 Sep 2026); nothing here is a price or a guess.
Run, then seed with the design helper.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "revamp"))
import build_canvas as bc  # noqa: E402

bc.ICON["map"] = '<svg viewBox="0 0 24 24"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"></path><circle cx="12" cy="10" r="2"></circle></svg>'
bc.ICON["wiki"] = '<svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"></path><path d="M4 20.5V5.5M20 18v3H6.5"></path><path d="M9 8h7M9 11.5h5"></path></svg>'
bc.ICON["search"] = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4.2-4.2"></path></svg>'
bc.ICON["x"] = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"></path></svg>'
for key, label in (("map", "Map"), ("wiki", "Wiki")):
    if (key, label) not in bc.PAGES:
        bc.PAGES.append((key, label))

# category icons, one stroke style, 24 grid
CAT_ICON = {
    "general": '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v.5M12 11v5"></path></svg>',
    "finance": '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"></rect><circle cx="12" cy="12" r="2.5"></circle><path d="M3 10h2M19 10h2M3 14h2M19 14h2"></path></svg>',
    "buildings": bc.ICON["company"],
    "business": '<svg viewBox="0 0 24 24"><path d="M4 9l1.5-5h13L20 9"></path><path d="M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0"></path><path d="M5 11v9h14v-9M10 20v-5h4v5"></path></svg>',
    "employees": bc.ICON["people"],
    "management": '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="15" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path><path d="M8 15l2 2 4-4"></path></svg>',
    "products": '<svg viewBox="0 0 24 24"><path d="M4 8h16v12H4z"></path><path d="M4 8l2-4h12l2 4M12 4v4M9 13h6"></path></svg>',
    "suppliers": bc.ICON["supply"],
    "furniture": '<svg viewBox="0 0 24 24"><path d="M4 12h16v8H4z"></path><path d="M6 12V6h12v6M6 20v1M18 20v1M4 16h16"></path></svg>',
    "rivals": '<svg viewBox="0 0 24 24"><path d="M6 3h12v6a6 6 0 0 1-12 0z"></path><path d="M6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3M12 15v3M8 21h8M9 18h6"></path></svg>',
    "recipes": '<svg viewBox="0 0 24 24"><path d="M5 4h10l4 4v12H5z"></path><path d="M15 4v4h4M8 12h8M8 16h5"></path></svg>',
    "machines": '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"></path></svg>',
    "ingredients": '<svg viewBox="0 0 24 24"><path d="M9 3h6v4l4 12H5L9 7z"></path><path d="M9 7h6M7 15h10"></path></svg>',
    "vehicles": '<svg viewBox="0 0 24 24"><path d="M3 16V9a1 1 0 0 1 1-1h10l3 4h3a1 1 0 0 1 1 1v3"></path><circle cx="7" cy="17" r="2"></circle><circle cx="17" cy="17" r="2"></circle><path d="M9 17h6M3 16h2M19 16h2"></path></svg>',
}

CATEGORIES = [
    ("business", "Business types", 24), ("products", "Products", 76), ("furniture", "Furniture", 522),
    ("suppliers", "Wholesalers & importers", 17), ("recipes", "Factory recipes", 62),
    ("machines", "Factory machines", 17), ("ingredients", "Factory ingredients", 61),
    ("buildings", "Buildings", 10), ("employees", "Employee types", 21), ("management", "Employee management", 7),
    ("vehicles", "Vehicles", 19), ("rivals", "Rivals", 4), ("finance", "Finance", 3), ("general", "General", 9),
]

# a small page index so the search on the home artboard has something to find
PAGES_INDEX = [
    ("Gift Shop", "Business types"), ("Florist", "Business types"), ("Bookstore", "Business types"),
    ("Supermarket", "Business types"), ("Gift (Cheap)", "Products"), ("Gift (Expensive)", "Products"),
    ("Umbrella", "Products"), ("Paper Bag", "Products"), ("Rounded Shelf", "Furniture"),
    ("Product Panel", "Furniture"), ("Cash Register", "Furniture"), ("Checkout Counter (Left)", "Furniture"),
    ("Stack of Shopping Baskets", "Furniture"), ("Storage Shelf", "Furniture"),
    ("Gift (Cheap) Recipe", "Factory recipes"), ("Umbrella Recipe", "Factory recipes"),
    ("Consumer Goods Assembly Machine", "Factory machines"), ("Laser Cutting Machine", "Factory machines"),
    ("Clay", "Factory ingredients"), ("Plastic", "Factory ingredients"), ("Metal Wire", "Factory ingredients"),
    ("Bluestone Imports", "Wholesalers & importers"), ("Global Harvest Traders", "Wholesalers & importers"),
    ("Hudson Wholesale", "Wholesalers & importers"), ("AJ Pederson & Son", "Wholesalers & importers"),
    ("Cashier", "Employee types"), ("Cleaner", "Employee types"), ("Building types", "Buildings"),
]

CSS = r"""
/* wiki: provenance chips extend the board's chip vocabulary ------------------ */
.chip.help{background:#6ea8ff1f;color:var(--info)}
.chip.save{background:#ffffff10;color:var(--ink-2);border:1px dashed var(--rule)}
.light .chip.save{background:#00000008}
.chip i{width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block;flex:none}
.srch{display:flex;align-items:center;gap:8px;height:32px;padding:0 10px;border-radius:7px;border:1px solid var(--rule);background:var(--surface);color:var(--ink-3);width:250px;transition:border-color .15s,width .25s}
.srch:focus-within{border-color:var(--ink-3);color:var(--ink-2);width:300px}
.srch svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none}
.srch input{flex:1;min-width:0;border:0;background:none;color:var(--ink);font:inherit;font-size:13px;outline:none}
.srch input::placeholder{color:var(--ink-3)}
.srch .cnt{font-size:11px;color:var(--ink-3);flex:none}
.srch.big{width:420px;height:40px}.srch.big:focus-within{width:520px}
.srch.big input{font-size:14px}

/* home: the shelf of categories ------------------------------------------------ */
.shelf{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:22px}
.cat{position:relative;padding:18px 18px 16px;border-radius:12px;background:var(--surface);border:1px solid var(--rule-soft);
  text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:12px;
  transform:perspective(900px) rotateX(var(--rx,0)) rotateY(var(--ry,0));transition:transform .12s ease-out,border-color .2s,opacity .25s;transform-style:preserve-3d}
.cat:hover{border-color:var(--rule);color:inherit}
.cat .ic{width:40px;height:40px;border-radius:10px;background:var(--raised);display:grid;place-items:center;color:var(--accent);transition:transform .2s}
.cat .ic svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.cat:hover .ic{transform:translateZ(24px)}
.cat b{font-size:15px;font-weight:600;transition:transform .2s}
.cat:hover b{transform:translateZ(16px)}
.cat .n{position:absolute;top:16px;right:16px;font:500 11px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;color:var(--ink-3);transition:color .2s}
.cat:hover .n{color:var(--accent)}
.cat.off{opacity:.18;pointer-events:none}
.hits{display:flex;flex-direction:column;border-top:1px solid var(--rule);margin-top:22px}
.hits[hidden]{display:none}
.hit{display:grid;grid-template-columns:22px 1fr auto 28px;gap:0 14px;align-items:center;padding:11px 6px 11px 0;border-bottom:1px solid var(--rule-soft);text-decoration:none;color:inherit;border-radius:0 6px 6px 0;transition:background .15s}
.hit:hover{background:var(--surface);color:inherit}
.hit .mark{width:8px;height:8px;border-radius:50%;background:var(--accent);justify-self:center;transition:transform .2s cubic-bezier(.34,1.56,.64,1)}
.hit:hover .mark{transform:scale(1.6)}
.hit .what{font-weight:600;font-size:14px}
.hit .what em{font-style:normal;color:var(--accent)}
.hit .cat2{font:500 11px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;color:var(--ink-3);white-space:nowrap}
.hit .go{color:var(--ink-3);display:grid;place-items:center;transition:transform .2s,color .15s}
.hit .go svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.hit:hover .go{color:var(--accent);transform:translateX(3px)}
.hits .none{padding:18px 0;font:400 12px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.legend{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:36px;align-items:center}
.legend .why{margin-left:2px}
.sechead .link{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}

/* page head ----------------------------------------------------------------- */
.crumb{display:flex;align-items:center;gap:8px;margin-top:28px;font:500 11px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}
.crumb a{color:var(--ink-3);text-decoration:none}.crumb a:hover{color:var(--ink)}
.crumb svg{width:10px;height:10px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.titlerow{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:10px}
.titlerow h1{margin:0;font-size:34px;letter-spacing:-.025em;font-weight:600;line-height:1.1}
.titlerow .chips{display:flex;gap:6px;flex-wrap:wrap}
.lede{font-size:15.5px;line-height:1.6;color:var(--ink-2);margin:12px 0 0;max-width:62ch}
.lede b{color:var(--ink);font-weight:600}
.kpi .v.t{font-size:22px;padding-top:4px}

/* setup: four groups, squares to tick --------------------------------------- */
.groups{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.group{border:1px solid var(--rule-soft);border-radius:12px;background:var(--surface);padding:16px 18px 18px;display:flex;flex-direction:column;gap:12px}
.group h3{margin:0;font-size:13.5px;font-weight:600;display:flex;align-items:center;gap:8px}
.group h3 .k{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.14em;color:var(--ink-3);text-transform:uppercase}
.group h3 .k b{color:var(--accent);font-weight:500}
.item{display:grid;grid-template-columns:16px minmax(0,1fr);gap:10px;font-size:13px;line-height:1.45;cursor:pointer;user-select:none;-webkit-user-select:none}
.item .tick{width:14px;height:14px;margin-top:3px;border:1.5px solid var(--ink-3);border-radius:3px;position:relative;transition:border-color .15s,transform .25s cubic-bezier(.34,1.56,.64,1)}
.item .tick::after{content:"";position:absolute;inset:2.5px;border-radius:1px;background:var(--accent);opacity:0;transform:scale(.4);transition:opacity .15s,transform .25s cubic-bezier(.34,1.56,.64,1)}
.item.req .tick{border-color:var(--accent)}
.item.req .tick::after{opacity:.35;transform:scale(1)}
.item:hover .tick{transform:scale(1.15)}
.item.done .tick{border-color:var(--accent);animation:tickpop .35s cubic-bezier(.34,1.56,.64,1)}
.item.done .tick::after{opacity:1;transform:scale(1)}
.item.done strong{color:var(--ink-3);text-decoration:line-through;text-decoration-color:var(--rule)}
@keyframes tickpop{40%{transform:scale(1.5) rotate(-8deg)}}
.item strong{font-weight:600;color:var(--ink);display:block}
.item .m{display:block;color:var(--ink-3);font-size:11.5px;margin-top:2px;font-family:"IBM Plex Mono",monospace}
.item .m b{font-weight:500;color:var(--ink-2)}
.group .ph{margin-top:auto;padding-top:4px;display:flex;align-items:center;gap:8px;font:400 11px "IBM Plex Mono",monospace;color:var(--ink-3)}
.group .ph .track{height:3px;width:44px;border-radius:3px;background:var(--rule);overflow:hidden}
.group .ph .track i{display:block;height:100%;background:var(--accent);transform:scaleX(var(--done,0));transform-origin:left;transition:transform .45s cubic-bezier(.2,.8,.2,1)}
.group .ph.complete{color:var(--accent)}
.item i.catch{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--warn);margin-left:7px;vertical-align:2px;animation:pulse 2.4s infinite}

/* products: three cards, five facts ------------------------------------------ */
.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.card{border:1px solid var(--rule-soft);border-radius:12px;background:var(--surface);overflow:hidden;display:flex;flex-direction:column;transition:border-color .2s}
.card:hover{border-color:var(--rule)}
.card .top{padding:16px 18px 12px;display:flex;align-items:center;gap:10px}
.card h3{margin:0;font-size:15.5px;font-weight:600;letter-spacing:-.01em;flex:1}
.card dl{margin:0;padding:6px 18px 16px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px 14px;font-size:13px;border-top:1px solid var(--rule-soft)}
.card dt{color:var(--ink-3);font:500 10px/1.8 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;padding-top:6px}
.card dd{margin:0;min-width:0;display:flex;flex-wrap:wrap;gap:5px;padding-top:4px}
.pill{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:999px;border:1px solid var(--rule);font-size:12px;color:var(--ink-2);background:var(--raised);white-space:nowrap;transition:border-color .15s,color .15s,transform .2s cubic-bezier(.34,1.56,.64,1)}
.pill:hover{border-color:var(--ink-3);color:var(--ink);transform:translateY(-1px)}
.pill b{font:500 11px "IBM Plex Mono",monospace;color:var(--ink-3)}
.pill.on{border-color:var(--accent);color:var(--accent);background:var(--accent-soft)}
.pill.on b{color:var(--accent);opacity:.8}
.pill.no{border-style:dashed;color:var(--neg);background:#ff625714}

/* the fit graph: product, fixture, supply ------------------------------------ */
.graph{position:relative;border:1px solid var(--rule-soft);border-radius:12px;background:var(--surface);padding:18px 20px 16px}
.graph .lanes{position:relative;z-index:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:110px}
.lane h3{margin:0 0 10px;font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
.lane .stack{display:flex;flex-direction:column;gap:10px}
.node{width:100%;text-align:left;text-decoration:none;font:inherit;font-size:13px;color:var(--ink);background:var(--raised);border:1px solid var(--rule);border-radius:9px;padding:10px 12px;cursor:pointer;
  transition:opacity .18s,border-color .18s,background .18s,transform .2s cubic-bezier(.34,1.56,.64,1);position:relative}
.node span{color:var(--ink)}
.node small{display:block;color:var(--ink-3);font:400 11px "IBM Plex Mono",monospace;margin-top:2px}
.node:hover{border-color:var(--ink-3);transform:translateX(2px)}
.node.on{border-color:var(--accent);background:var(--accent-soft)}
.graph.picked .node:not(.lit){opacity:.28}
.graph.picked .node.lit{border-color:var(--accent)}
.wires{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:visible}
.wires path{fill:none;stroke:var(--rule);stroke-width:1.5;transition:stroke .18s,opacity .18s}
.wires path.hop{stroke-dasharray:3 5}
.graph.picked .wires path{opacity:.12}
.graph.picked .wires path.lit{opacity:1;stroke:var(--accent);stroke-width:2}
.graph.picked .wires path.lit.hop{animation:march 1.2s linear infinite}
.wires path.hot{stroke:var(--ink-2)}
@keyframes march{to{stroke-dashoffset:-16}}
.graphfoot{display:flex;align-items:center;gap:10px;margin-top:16px;padding-top:12px;border-top:1px solid var(--rule-soft);min-height:40px}
.graphfoot .say{font:400 12px "IBM Plex Mono",monospace;color:var(--ink-3);display:flex;gap:10px;align-items:center}
.graphfoot .say b{color:var(--ink);font-weight:500}
.graphfoot .say .n{color:var(--accent)}
.graphfoot .ibtn{margin-left:auto;opacity:0;transition:opacity .2s}
.graph.picked .graphfoot .ibtn{opacity:1}
.graphfoot .key2{display:flex;gap:14px;align-items:center;font:400 11px "IBM Plex Mono",monospace;color:var(--ink-3)}
.graphfoot .key2 i{display:inline-block;width:22px;height:0;border-top:1.5px solid var(--ink-3);vertical-align:middle;margin-right:6px}
.graphfoot .key2 i.d{border-top-style:dashed}

/* the ball rides the wires: parked on the rule, rolling along whatever is lit --- */
.gball{position:absolute;left:0;top:0;width:44px;height:44px;z-index:1;cursor:pointer;will-change:transform;transform-origin:50% 100%}
.gball i{display:block;width:100%;height:100%;border-radius:50%;
  background:radial-gradient(circle at var(--hx,32%) var(--hy,30%),#d9ffe8 0%,#7fe3a8 14%,var(--accent) 38%,#146b3c 78%,#0b3d23 100%);
  box-shadow:0 10px 24px #43c07a3d,inset -8px -12px 20px #00000066,inset 4px 5px 10px #ffffff22}
.gball u{position:absolute;inset:0;border-radius:50%;pointer-events:none;
  background:radial-gradient(circle at 72% 28%,#0003 0 4.5%,transparent 5.5%),radial-gradient(circle at 26% 62%,#0003 0 3.5%,transparent 4.5%),radial-gradient(circle at 62% 80%,#0002 0 3%,transparent 4%)}
.gball .squish{animation:squish .7s cubic-bezier(.34,1.56,.64,1)}
.gshadow{position:absolute;left:0;top:0;width:44px;height:8px;border-radius:50%;background:#000;opacity:.45;filter:blur(4px);z-index:1;pointer-events:none;transform-origin:50% 50%}
.board.phone .gball,.board.phone .gshadow{display:none}

/* recipes: left to right --------------------------------------------------- */
.flows{display:flex;flex-direction:column;gap:14px}
.flow{border:1px solid var(--rule-soft);border-radius:12px;background:var(--surface);display:grid;grid-template-columns:minmax(0,1.3fr) 60px minmax(0,1fr) 60px minmax(0,.9fr);align-items:center;gap:0 12px;padding:14px 18px;transition:border-color .2s}
.flow:hover{border-color:var(--rule)}
.flow .box{border:1px solid var(--rule);border-radius:9px;background:var(--raised);padding:10px 13px;min-width:0}
.flow .box.mid{border-color:var(--accent);background:var(--accent-soft);text-align:center;cursor:help}
.flow .box .t{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px}
.flow .ing{display:flex;justify-content:space-between;gap:12px;font-size:13px;padding:3px 0;align-items:baseline}
.flow .ing .r{font:500 12px "IBM Plex Mono",monospace;color:var(--ink-2);white-space:nowrap}
.flow .ing .src{display:block;font:400 11px "IBM Plex Mono",monospace;color:var(--ink-3)}
.flow .mid b{display:block;font-size:14px;font-weight:600}
.flow .mid small{display:block;font:400 11px "IBM Plex Mono",monospace;color:var(--ink-2);margin-top:3px}
.flow .arrow{position:relative;height:2px;background:var(--rule);border-radius:2px}
.flow .arrow::after{content:"";position:absolute;right:-1px;top:-4px;width:8px;height:8px;border-top:1.5px solid var(--ink-3);border-right:1.5px solid var(--ink-3);transform:rotate(45deg)}
.flow .arrow i{position:absolute;top:-2px;left:0;width:6px;height:6px;border-radius:50%;background:var(--accent);opacity:0}
.flow:hover .arrow i{animation:travel 1.1s linear infinite}
.flow:hover .arrow i:nth-child(2){animation-delay:.37s}.flow:hover .arrow i:nth-child(3){animation-delay:.74s}
@keyframes travel{0%{left:0;opacity:0}15%{opacity:1}85%{opacity:1}100%{left:calc(100% - 6px);opacity:0}}
.flow .out{display:flex;flex-direction:column;gap:4px}
.flow .out b{font:500 22px/1 "IBM Plex Mono",monospace;letter-spacing:-.02em;color:var(--accent)}
.flow .out span{font-size:13px}
.flow .out small{font:400 11px "IBM Plex Mono",monospace;color:var(--ink-3)}
.flow .out .chip{align-self:flex-start;margin-top:2px}

/* suppliers: rows with a place ----------------------------------------------- */
.places{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 40px;border-top:1px solid var(--rule)}
.place{display:grid;grid-template-columns:30px minmax(0,1fr) auto 32px;gap:0 12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--rule-soft);text-decoration:none;color:inherit}
.place:hover{color:inherit}
.place .nm{font-size:13.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.place .nm small{display:block;font:400 11px "IBM Plex Mono",monospace;color:var(--ink-3);margin-top:1px}
.place .role{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);white-space:nowrap}
.place .ibtn{opacity:.55;transition:opacity .15s,color .15s,border-color .15s}
.place:hover .ibtn{opacity:1}
.place .ibtn svg{transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.place .ibtn:hover svg{transform:translateY(-2px) rotate(-6deg)}
.place .flag{width:7px;height:7px;border-radius:50%;background:var(--warn);display:inline-block;margin-left:6px;vertical-align:middle}

/* from your save: the only part that changes --------------------------------- */
.savebox{border:1px dashed var(--rule);border-radius:12px;padding:18px 20px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.slot{border:1px solid var(--rule-soft);border-radius:9px;padding:12px 14px;background:var(--surface);display:flex;flex-direction:column;gap:6px}
.slot .lab{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
.slot .v{font:500 24px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.slot .w{font-size:11.5px;color:var(--ink-3)}

/* provenance ------------------------------------------------------------------ */
.gaps{border-top:1px solid var(--rule);max-width:560px}
.gap{display:grid;grid-template-columns:22px minmax(0,1fr);gap:0 12px;align-items:center;padding:9px 0;border-bottom:1px solid var(--rule-soft);font-size:13px;cursor:help}
.gap i{width:7px;height:7px;border-radius:50%;background:var(--neg);justify-self:center;transition:transform .2s cubic-bezier(.34,1.56,.64,1)}
.gap:hover i{transform:scale(1.6)}
.stamp{display:flex;gap:14px;align-items:center;margin-top:14px;font:400 11px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;color:var(--ink-3)}
.stamp .chip{letter-spacing:.02em}

/* phone: the same page at 390 -------------------------------------------------- */
.board.phone{min-width:0}
.board.phone .wrap{width:calc(100% - 32px)}
.board.phone .mast{height:64px;gap:14px}
.board.phone .wordmark{font-size:22px}
.board.phone .nav{gap:0;margin-left:0}
.board.phone .nav a{padding:8px 6px}
.board.phone .nav a span{display:none}
.board.phone .nav a.on span{display:inline}
.board.phone .clock,.board.phone .orb{display:none}
.board.phone .titlerow h1{font-size:28px}
.board.phone .lede{max-width:none}
.board.phone .kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.board.phone .kpi{padding:12px 14px}
.board.phone .kpi .v.t{font-size:18px}
.board.phone .groups,.board.phone .cards,.board.phone .savebox,.board.phone .places{grid-template-columns:minmax(0,1fr)}
.board.phone .graph .lanes{grid-template-columns:minmax(0,1fr);gap:18px}
.board.phone .wires{display:none}
.board.phone .flow{grid-template-columns:minmax(0,1fr);gap:10px}
.board.phone .flow .arrow{width:2px;height:28px;margin:0 auto}
.board.phone .flow .arrow::after{right:-3px;top:auto;bottom:-1px;transform:rotate(135deg)}
.board.phone .flow:hover .arrow i{animation:none;opacity:0}
.board.phone .sechead .why{order:2}
.board.phone .sechead .aside{margin-left:0}
.board.phone .foot{flex-wrap:wrap;gap:10px}
.board.phone .foot span:last-child{margin-left:0}
"""

SCRIPT = r"""
    // ---- wiki home: tilt the shelf, search the index --------------------------
    $$('.cat').forEach(c => {
      c.addEventListener('mousemove', (e) => { const r = c.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        c.style.setProperty('--ry', (x * 10) + 'deg'); c.style.setProperty('--rx', (-y * 8) + 'deg'); });
      c.addEventListener('mouseleave', () => { c.style.setProperty('--ry', '0deg'); c.style.setProperty('--rx', '0deg'); });
    });
    const wsearch = $('.wsearch input');
    if (wsearch) {
      const hits = $('.hits'), cnt = $('.wsearch .cnt'), cats = $$('.cat');
      const draw = () => {
        const q = wsearch.value.trim().toLowerCase();
        cats.forEach(c => c.classList.toggle('off', !!q && !c.dataset.name.includes(q) && !WIKIPAGES.some(p => p[1] === c.dataset.label && p[0].toLowerCase().includes(q))));
        if (!q) { hits.hidden = true; cnt.textContent = ''; return; }
        const found = WIKIPAGES.filter(p => p[0].toLowerCase().includes(q));
        cnt.textContent = found.length;
        hits.hidden = false;
        hits.innerHTML = found.slice(0, 8).map(p => { const i = p[0].toLowerCase().indexOf(q);
          const nm = p[0].slice(0, i) + '<em>' + p[0].slice(i, i + q.length) + '</em>' + p[0].slice(i + q.length);
          return '<a class="hit" href="#page"><i class="mark"></i><span class="what">' + nm + '</span><span class="cat2">' + p[1].toUpperCase() + '</span><span class="go">' + GO + '</span></a>'; }).join('')
          + (found.length ? '' : '<div class="none">NOTHING CALLED THAT</div>');
      };
      wsearch.addEventListener('input', draw);
      if (wsearch.value) draw();
    }

    // ---- setup: tick things off; each group keeps its own score ----------------
    $$('.group').forEach(g => {
      const items = $$('.item', g), ph = $('.ph', g);
      const score = () => { const done = items.filter(i => i.classList.contains('done')).length;
        if (ph) { ph.style.setProperty('--done', done / items.length); $('b', ph).textContent = done + '/' + items.length; ph.classList.toggle('complete', done === items.length); } };
      items.forEach(i => i.addEventListener('click', () => { i.classList.toggle('done'); score(); }));
      score();
    });

    // ---- the fit graph: pick a node, its lines light and march -----------------
    const graph = $('.graph');
    if (graph) {
      const svg = $('.wires', graph), nodes = $$('.node', graph), say = $('.graphfoot .say'), clear = $('.graphfoot .ibtn');
      const EDGES = WIKIEDGES; let picked = null; let onPick = () => {};
      const byId = {}; nodes.forEach(n => byId[n.dataset.id] = n);
      const draw = () => {
        const g0 = graph.getBoundingClientRect();
        svg.innerHTML = EDGES.map((e, i) => { const a = byId[e[0]].getBoundingClientRect(), b = byId[e[1]].getBoundingClientRect();
          const x1 = a.right - g0.left, y1 = a.top + a.height / 2 - g0.top, x2 = b.left - g0.left, y2 = b.top + b.height / 2 - g0.top;
          const hop = e[2] === 'hop', c = hop ? 90 : 55;
          const d = hop ? 'M' + x1 + ' ' + y1 + ' C ' + (x1 + c) + ' ' + y1 + ', ' + (x2 - c) + ' ' + (y2 + 10) + ', ' + x2 + ' ' + y2
                       : 'M' + x1 + ' ' + y1 + ' C ' + (x1 + c) + ' ' + y1 + ', ' + (x2 - c) + ' ' + y2 + ', ' + x2 + ' ' + y2;
          return '<path class="' + (hop ? 'hop' : '') + '" data-a="' + e[0] + '" data-b="' + e[1] + '" d="' + d + '"></path>'; }).join('');
      };
      const paint = () => {
        graph.classList.toggle('picked', !!picked);
        const lit = new Set(); if (picked) { lit.add(picked); EDGES.forEach(e => { if (e[0] === picked || e[1] === picked) { lit.add(e[0]); lit.add(e[1]); } }); }
        nodes.forEach(n => { n.classList.toggle('lit', lit.has(n.dataset.id)); n.classList.toggle('on', n.dataset.id === picked); });
        $$('path', svg).forEach(p => p.classList.toggle('lit', !!picked && (p.dataset.a === picked || p.dataset.b === picked)));
        if (say) { const n = picked ? EDGES.filter(e => e[0] === picked || e[1] === picked).length : EDGES.length;
          say.innerHTML = picked ? '<b>' + $('span', byId[picked]).textContent + '</b><span class="n">' + n + ' LINKS</span>' : ''; }
        onPick();
      };
      nodes.forEach(n => {
        n.addEventListener('click', () => { picked = picked === n.dataset.id ? null : n.dataset.id; paint(); });
        n.addEventListener('mouseenter', () => $$('path', svg).forEach(p => p.classList.toggle('hot', p.dataset.a === n.dataset.id || p.dataset.b === n.dataset.id)));
        n.addEventListener('mouseleave', () => $$('path', svg).forEach(p => p.classList.remove('hot')));
      });
      if (clear) clear.addEventListener('click', () => { picked = null; paint(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && picked) { picked = null; paint(); } });

      // ---- the ball: parked on the rule; while something is picked it rides the lit wires ----
      const ball = $('.gball', graph), gsh = $('.gshadow', graph);
      if (ball) {
        const SZ = 44, SPEED = 230;
        let pos = null, seam = 0, seq = [], si = 0, mode = 'idle', from = null, to = null, t0 = 0, dur = 0, lift = 0;
        const home = () => { const g0 = graph.getBoundingClientRect(), f = $('.graphfoot', graph).getBoundingClientRect();
          return { x: g0.width - 20 - 32 - 14 - SZ / 2, y: f.top - g0.top - SZ / 2 + 1 }; };
        const paintBall = () => { if (!pos) return;
          ball.style.transform = 'translate(' + (pos.x - SZ / 2).toFixed(1) + 'px,' + (pos.y - SZ / 2 - lift).toFixed(1) + 'px)';
          $('u', ball).style.transform = 'rotate(' + seam.toFixed(1) + 'deg)';
          const k = Math.max(.35, 1 - lift / 60);
          gsh.style.transform = 'translate(' + (pos.x - SZ / 2).toFixed(1) + 'px,' + (pos.y + SZ / 2 - 5).toFixed(1) + 'px) scale(' + k.toFixed(2) + ')';
          gsh.style.opacity = (.45 * k).toFixed(2); };
        const squishBall = () => [$('i', ball), $('u', ball)].forEach(el => { el.classList.remove('squish'); void el.offsetWidth; el.classList.add('squish'); });
        const build = () => { if (!picked) return []; const ps = $$('path.lit', svg);
          return ps.filter(p => p.classList.contains('hop')).map(p => ({ p, rev: true })).concat(ps.filter(p => !p.classList.contains('hop')).map(p => ({ p, rev: false }))); };
        const at = (sg, k) => { const L = sg.p.getTotalLength(); const pt = sg.p.getPointAtLength(sg.rev ? L * (1 - k) : L * k); return { x: pt.x, y: pt.y }; };
        const arc = (a, b, ms) => { mode = 'arc'; from = { x: a.x, y: a.y }; to = b; t0 = performance.now(); dur = ms; };
        onPick = () => { if (!pos) pos = home(); seq = build(); si = 0; if (seq.length) arc(pos, at(seq[0], 0), 520); else arc(pos, home(), 620); };
        ball.addEventListener('click', () => { squishBall(); const r = ball.getBoundingClientRect(), i = document.createElement('i'); i.className = 'ring';
          i.style.left = (r.left + window.scrollX) + 'px'; i.style.top = (r.top + window.scrollY) + 'px'; i.style.width = r.width + 'px'; i.style.height = r.height + 'px';
          document.body.appendChild(i); setTimeout(() => i.remove(), 900); });
        document.addEventListener('mousemove', (e) => { const r = ball.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1;
          ball.style.setProperty('--hx', (34 + dx / d * 20) + '%'); ball.style.setProperty('--hy', (32 + dy / d * 20) + '%'); });
        const tick = (t) => {
          if (!pos) { pos = home(); }
          if (mode === 'arc') { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
            const nx = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }; seam += (nx.x - pos.x) / (Math.PI * SZ) * 360; pos = nx; lift = Math.sin(p * Math.PI) * 26;
            if (p >= 1) { lift = 0; if (seq.length && picked) { mode = 'run'; t0 = t; dur = Math.max(650, seq[si].p.getTotalLength() / SPEED * 1000); } else { mode = 'idle'; squishBall(); } } }
          else if (mode === 'run') { const p = Math.min(1, (t - t0) / dur); const nx = at(seq[si], p); seam += (nx.x - pos.x) / (Math.PI * SZ) * 360; pos = nx;
            if (p >= 1) { squishBall(); si = (si + 1) % seq.length; arc(pos, at(seq[si], 0), 460); } }
          else { lift = (1 + Math.sin(t / 700)) * 1.2; }
          paintBall(); requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        window.addEventListener('resize', () => { if (mode === 'idle' && !picked) pos = home(); });
      }
      const boot = () => { draw(); picked = graph.dataset.start || null; paint(); };
      boot(); setTimeout(boot, 300); setTimeout(boot, 1200);
      window.addEventListener('resize', () => { draw(); paint(); });
    }
"""

EDGES = [
    ("cheap", "shelf", "on"), ("cheap", "panel", "on"), ("exp", "shelf", "on"), ("umb", "panel", "on"),
    ("cheap", "whole", "hop"), ("cheap", "blue", "hop"), ("cheap", "fact", "hop"),
    ("exp", "blue", "hop"), ("exp", "fact", "hop"),
    ("umb", "whole", "hop"), ("umb", "blue", "hop"), ("umb", "fact", "hop"),
]


def data_js() -> str:
    pages = json.dumps(PAGES_INDEX)
    edges = json.dumps(EDGES)
    return f"const WIKIPAGES = {pages};\nconst WIKIEDGES = {edges};\nconst GO = {json.dumps(bc.ICON['go'])};\n"


CHEV = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"></path></svg>'


def chip(kind: str, text: str, tip: str = "") -> str:
    t = f' data-tip="{tip}"' if tip else ""
    return f'<span class="chip {kind}"{t}><i></i>{text}</span>'


# --------------------------------------------------------------------------
# home
# --------------------------------------------------------------------------
def home(query: str = "") -> str:
    tiles = "".join(
        f'<a class="cat rv" href="#cat-{key}" data-name="{label.lower()}" data-label="{label}"><span class="ic">{CAT_ICON[key]}</span><b>{label}</b><span class="n">{n}</span></a>'
        for key, label, n in CATEGORIES
    )
    legend = (chip("help", "game help", "What the game's own F1 page claims. A claim about the game, not a measurement of it.")
              + chip("ok", "asset-checked", "Confirmed in a second game file, or agreed by both directions of the same file.")
              + chip("warn", "Big Copilot", "Our reading, with the evidence named. The one that changes when the model changes.")
              + chip("save", "your save", "Only knowable once a save is open. Never shipped as a value.")
              + chip("bad", "gap", "The game files do not say. Recorded rather than filled."))
    return bc.shell("wiki", f"""
<div class="sechead rv" style="margin-top:36px">
  <label class="srch big wsearch">{bc.ICON["search"]}<input type="text" placeholder="Search" value="{query}"><span class="cnt mono"></span></label>
  <span class="why" data-tip="Everything the game's own help menu knows, read straight out of the installed game: 851 pages in 14 categories. Every fact carries a badge saying where it came from: blue is the game's help text, green is checked against a second game file, amber is Big Copilot's reading, dashed is your save, red is a gap. No prices anywhere; the game files have none.">?</span>
  <span class="aside">{chip("dim", "build 3675", "The save build this extraction was checked against. If your save reports a newer build, the page says so.")}</span>
</div>
<div class="hits" hidden></div>
<div class="shelf">{tiles}</div>
""")


# --------------------------------------------------------------------------
# the gift shop page
# --------------------------------------------------------------------------
def head() -> str:
    return f"""
<div class="crumb rv"><a href="#wiki">Wiki</a>{CHEV}<a href="#cat-business">Business types</a></div>
<div class="titlerow rv"><h1>Gift Shop</h1><span class="chips">{chip("ok", "3 shipped shops", "Checked against the three gift shop layouts the game ships: the M1 rival shop and the golf and tennis area shops.")}</span></div>
<p class="lede rv">Two of its three products come from any wholesaler. <b>Expensive gifts do not.</b></p>
<div class="kpis" style="margin-top:28px">
  <div class="kpi rv" data-tip="Any retail size code, A1 to M1. The door limit rises with the code."><span class="lab">Building</span><span class="v t">Retail</span><span class="sub">A1 – M1</span></div>
  <div class="kpi rv" data-tip="Customers pick from the shelves themselves. No waiter, no table service."><span class="lab">Customers</span><span class="v t">Self-serve</span></div>
  <div class="kpi rv" data-tip="Gift (Cheap), Gift (Expensive), Umbrella. Eight more may be carried on the side; they belong to other types' pages."><span class="lab">Core range</span><span class="v">3</span><span class="sub">+8 on the side</span></div>
  <div class="kpi rv tr" data-tip="Customer Service and Cleaning. Hired at Anderson Recruitment Corp., 16 5th Avenue."><span class="lab">Staff skills</span><span class="v">2</span><span class="sub">service · cleaning</span></div>
</div>"""


def setup() -> str:
    def item(req: bool, name: str, meta: str, tip: str = "", catch: bool = False) -> str:
        t = f' data-tip="{tip}"' if tip else ""
        c = '<i class="catch"></i>' if catch else ""
        return f'<div class="item {"req" if req else ""}"{t}><span class="tick"></span><span><strong>{name}{c}</strong><span class="m">{meta}</span></span></div>'

    def group(title: str, items: str) -> str:
        return f'<div class="group rv"><h3>{title}</h3>{items}<div class="ph"><span class="track"><i></i></span><b>0/0</b></div></div>'

    g1 = group("The room", item(True, "Retail building", "A1 – M1", "Rented before anything else. Traffic index is fixed to the address; capacity rises with the size code."))
    g2 = group("Fixtures",
               item(True, "Shopping Baskets", "cap <b>30</b>/h · 4 vendors", "Stack of Shopping Baskets. Required in every self-serve shop. Square, Pederson, Essentials, Hampton.")
               + item(True, "A point of sale", "register <b>20</b>/h · counter <b>30</b>/h", "Cash Register sits on cabinets or a cocktail bar; Checkout Counters stand alone. Both need Paper Bags.")
               + item(False, "Rounded Shelf", "holds <b>300</b> · Pederson only", "Gifts 300, flowers 100. Customer capacity 15/h. Only AJ Pederson & Son sells it.")
               + item(False, "Product Panel", "holds <b>100</b> · Pederson only", "Any product, 100 units. Customer capacity 10/h. Shipped shops put umbrellas on every one of theirs.")
               + item(False, "Storage Shelf", "<b>16</b> boxes · 5 vendors", "Where wholesale deliveries land. Pederson, Essentials, Ika Bohag, Square, Hampton."))
    g3 = group("Stock",
               item(True, "One product", "any wholesaler", "The shop opens with either of the two wholesale lines, cheap gifts or umbrellas. Expensive gifts need Bluestone Imports, 4 Pier.")
               + item(True, "Paper Bags", "any wholesaler", "No bags, no sale; every wholesaler carries them. The register's own help page says so; the Gift Shop page does not. A shop full of gifts and no bags has a till that cannot ring.", catch=True))
    g4 = group("People",
               item(False, "Customer Service", "Anderson Recruitment", "The skill the register asks for. 16 5th Avenue.")
               + item(False, "Cleaning", "Anderson Recruitment", "Keeps the shop's cleanliness up. 16 5th Avenue."))
    return f"""
<section class="sec" style="margin-top:44px">
  <div class="sechead"><h2>To open</h2>
    <span class="why" data-tip="What the help page calls required, grouped by when you do it. Filled squares are required, hollow ones optional; the amber dot marks the one requirement the business page forgets. Tick things off as you buy them; nothing is saved.">?</span>
    <span class="aside">{chip("help", "game help", "Straight from the game's own help page for the Gift Shop.")}</span></div>
  <div class="groups">{g1}{g2}{g3}{g4}</div>
</section>"""


def products() -> str:
    def card(name: str, key: str, goes: str, comes: str, also: str) -> str:
        return f'<div class="card rv"><div class="top"><h3>{name}</h3></div><dl><dt>Goes on</dt><dd>{goes}</dd><dt>Comes from</dt><dd>{comes}</dd><dt>Also sold by</dt><dd>{also}</dd></dl></div>'

    def pill(text: str, n: str = "", cls: str = "", tip: str = "") -> str:
        t = f' data-tip="{tip}"' if tip else ""
        return f'<span class="pill {cls}"{t}>{text}{f"<b>{n}</b>" if n else ""}</span>'

    shelf = pill("Rounded Shelf", "300", tip="Gifts 300, flowers 100. Customer capacity 15 an hour.")
    panel = pill("Product Panel", "100", tip="Any product, 100 units. Customer capacity 10 an hour.")
    whole = pill("Any wholesaler", "6", "on", "Hudson, Metro, NY Distro, StockCo, Titans of Industry, Total Produce. All six carry it.")
    nowhole = pill("No wholesaler", "", "no", "On no wholesaler's list, and its own page names no wholesaler. Import it or make it.")
    blue = pill("Bluestone Imports", "4 Pier", tip="Importer, retail inventory. 14 items on its list.")
    fact = pill("Your factory", "100/h", tip="Consumer Goods Workstation. See the recipe below.")
    c1 = card("Gift (Cheap)", "ba:itemname_cheapgift", shelf + panel, whole + blue + fact, pill("Florist") + pill("Bookstore"))
    c2 = card("Gift (Expensive)", "ba:itemname_expensivegift", shelf, nowhole + blue + fact, pill("Florist"))
    c3 = card("Umbrella", "ba:itemname_umbrella", panel, whole + blue + fact, pill("Florist") + pill("Bookstore"))
    return f"""
<section class="sec">
  <div class="sechead"><h2>Sells</h2>
    <span class="why" data-tip="One card per product: what it goes on, where it comes from, who else sells it. The capacity rides inside the fixture pill. The one red pill is the whole story: expensive gifts have no wholesaler.">?</span>
    <span class="aside">{chip("dim", "+8 on the side", "Arty Fish Smartwatch, Energy Drink, Flower (Cheap), Flower (Expensive), Picture Book, Rhythm By Tre, Soda Can, ZanaMan Smartwatch. Each belongs to another type's main range and is documented there.")}</span></div>
  <div class="cards">{c1}{c2}{c3}</div>
</section>"""


def graph(start: str = "") -> str:
    def node(nid: str, name: str, sub: str) -> str:
        return f'<a class="node" href="#{nid}" data-id="{nid}"><span>{name}</span>{f"<small>{sub}</small>" if sub else ""}</a>'

    lanes = f"""
<div class="lane"><h3>Product</h3><div class="stack">{node("cheap", "Gift (Cheap)", "")}{node("exp", "Gift (Expensive)", "")}{node("umb", "Umbrella", "")}</div></div>
<div class="lane"><h3>Goes on</h3><div class="stack">{node("shelf", "Rounded Shelf", "holds 300 · 15/h")}{node("panel", "Product Panel", "holds 100 · 10/h")}</div></div>
<div class="lane"><h3>Comes from</h3><div class="stack">{node("whole", "Any wholesaler", "6 · Mon 08:00")}{node("blue", "Bluestone Imports", "4 Pier · import")}{node("fact", "Consumer Goods Workstation", "100/h each")}</div></div>"""
    return f"""
<section class="sec">
  <div class="sechead">
    <span class="why" data-tip="Product, the fixture it goes on, where it comes from. Solid lines are goes-on; dashed lines are comes-from and pass behind the middle column, because supply reaches a product without touching its shelf. Click anything to keep only its lines; click again or press Escape to let go.">?</span>
    <span class="aside">{chip("ok", "checked both ways", "The only furniture pages that name a cheap gift are Rounded Shelf and Product Panel, exactly what the product page claims. But the three shipped shops put umbrellas on all 16 of their panels and never a gift: the help says what is allowed, not what is normal.")}</span></div>
  <div class="graph rv" data-start="{start}">
    <svg class="wires"></svg>
    <div class="gshadow"></div><div class="gball" data-tip="The ball follows the supply: from where it comes, into the product, onto its shelf."><i></i><u></u></div>
    <div class="lanes">{lanes}</div>
    <div class="graphfoot"><span class="say"></span><span class="ibtn" data-tip="Let go">{bc.ICON["x"]}</span></div>
  </div>
</section>"""


def recipes() -> str:
    def ing(name: str, per: int, src: str) -> str:
        return f'<div class="ing"><span>{name}<span class="src">{src}</span></span><span class="r">{per}/h</span></div>'

    def flow(name: str, ings: str, out: str, day: str) -> str:
        return f"""<div class="flow rv">
  <div class="box">{ings}</div>
  <span class="arrow"><i></i><i></i><i></i></span>
  <div class="box mid" data-tip="Consumer Goods Assembly Machine + Laser Cutting Machine, both from Factory Supply Depot, 2 25th Street. The same workstation runs 12 recipes, so one line covers the whole gift shop range."><b>Consumer Goods Workstation</b><small>2 machines · 12 recipes</small></div>
  <span class="arrow"><i></i><i></i><i></i></span>
  <div class="out"><b>100<small>/h</small></b><span>{out}</span>{chip("warn", day + "/day", "Big Copilot's model: the game's hourly rate times 24. Machines never idle; measured factory draw landed within 0.1% of it at two factories.")}</div>
</div>"""
    f1 = flow("Gift (Cheap)", ing("Clay", 50, "Global Harvest · 9 Pier"), "Gift (Cheap)", "2,400")
    f2 = flow("Gift (Expensive)", ing("Glass", 100, "Maritime Freight · 7 Pier") + ing("Plastic", 250, "Maritime Freight · 7 Pier") + ing("Water", 100, "Aquatic Bay · 8 Pier"), "Gift (Expensive)", "2,400")
    f3 = flow("Umbrella", ing("Plastic", 50, "Maritime Freight · 7 Pier") + ing("Metal Wire", 100, "Global Harvest · 9 Pier"), "Umbrella", "2,400")
    return f"""
<section class="sec">
  <div class="sechead"><h2>Make it</h2>
    <span class="why" data-tip="Ingredients with their hourly rate and the importer that carries each, the workstation, the output. Rates are the game's rated maximum per hour; the per-day chip is Big Copilot's 24-hour model. Hover a line to see it run.">?</span>
    <span class="aside"><a class="link" href="#plan" data-tip="Hand these three lines to Plan a chain on Growth, which already knows your standing import orders">Plan a chain {bc.ICON["chev"]}</a></span></div>
  <div class="flows">{f1}{f2}{f3}</div>
</section>"""


def suppliers() -> str:
    def place(name: str, hood: str, addr: str, role: str, flag: str = "") -> str:
        f = f'<span class="flag" data-tip="{flag}"></span>' if flag else ""
        return f'<div class="place"><span class="hood">{hood}</span><span class="nm">{name}{f}<small>{addr}</small></span><span class="role">{role}</span><span class="ibtn tr" data-tip="Show on the map">{bc.ICON["pin"]}</span></div>'
    left = (place("AJ Pederson & Son", "GD", "13 5th Avenue · M · traffic 45", "shelves · panels")
            + place("Square Appliances", "HK", "16 4th Avenue · C · traffic 50", "baskets · tills")
            + place("Essentials Appliances", "LM", "16 11th Street · M · traffic 23", "baskets · tills")
            + place("Hampton Supplies", "HA", "13 7th Avenue · D · traffic 53", "baskets · tills")
            + place("Anderson Recruitment", "GD", "16 5th Avenue · C · traffic 50", "people"))
    right = (place("Bluestone Imports", "MH", "4 Pier · H · traffic 18", "import · products", "The building table puts 4 Pier in Murray Hill while 7, 8 and 9 Pier are Lower Manhattan. Worth one in-game check.")
             + place("Global Harvest Traders", "LM", "9 Pier · H · traffic 18", "clay · metal wire")
             + place("Maritime Freight Line", "LM", "7 Pier · H · traffic 18", "glass · plastic")
             + place("Aquatic Bay Cargo", "LM", "8 Pier · H · traffic 18", "water")
             + place("Factory Supply Depot", "IC", "2 25th Street · M · traffic 37", "machines"))
    return f"""
<section class="sec">
  <div class="sechead"><h2>Where to go</h2>
    <span class="why" data-tip="Every address in the help text resolves to a building Big Copilot already knows (63 of 63), so each carries its neighbourhood, size code and traffic index, and the pin opens the map. Wholesale orders close Sunday 20:00 and land Monday 08:00; the weekly limit resets then too, and the help never gives its number.">?</span>
    <span class="aside">{chip("dim", "6 wholesalers", "Hudson, Metro, NY Distro, StockCo, Titans of Industry, Total Produce. All six carry cheap gifts and umbrellas; none carries expensive gifts.")}</span></div>
  <div class="places"><div>{left}</div><div>{right}</div></div>
</section>"""


def save_panel() -> str:
    def slot(lab: str, w: str) -> str:
        return f'<div class="slot" data-tip="{w}"><span class="lab">{lab}</span><span class="v">—</span></div>'
    return f"""
<section class="sec">
  <div class="sechead">
    <span class="why" data-tip="Nothing above changes when you load a save; this strip is the only part that does. Empty until a save is open, never a placeholder number.">?</span>
    <span class="aside">{chip("save", "no save open")}</span></div>
  <div class="savebox rv">{slot("Demand", "Demand per neighbourhood, 0 to 100, from the stored demand snapshot.")}{slot("You sell it", "Which of your shops carry it, and at what shelf pressure.")}{slot("Unit cost", "Only for materials you already buy: goods cost over units drawn. No save, no honest price.")}{slot("Rivals", "Rival sellers per neighbourhood, from the save's rival price lists.")}</div>
</section>"""


def provenance() -> str:
    gaps = [
        ("Prices", "The game's help gives no price anywhere: not rent, not furniture, not wholesale or import cost."),
        ("Weekly delivery limits", "Every importer and wholesaler caps each item per week, resetting Monday 08:00. The help never gives a number."),
        ("Rated rate is a ceiling", "Nothing says what a line achieves in practice, or what happens when an input runs out mid-hour."),
        ("Capacity by size code", "C1 is 30 customers as retail and 8 as office in the same table; the building table stores only the letter."),
    ]
    grows = "".join(f'<div class="gap" data-tip="{d}"><i></i><span>{w}</span></div>' for w, d in gaps)
    return f"""
<section class="sec">
  <div class="sechead"><h2>Source</h2>
    <span class="why" data-tip="Everything on this page is read from the game's own help text and checked against the game build a save reports. Red dots are gaps: things the game does not say, recorded rather than filled.">?</span>
    <span class="aside">{chip("bad", "4 gaps")}{chip("ok", "size codes agree", "Every size letter in the help's building table matches the board's building table on floor area exactly, and the customer capacities match what saves report.")}</span></div>
  <div class="gaps">{grows}</div>
  <div class="stamp"><span>GAME HELP</span><span>·</span><span>CHECKED ON BUILD 3675</span><span>·</span><span>13 SEP 2026</span></div>
</section>"""


def page(start: str = "", parts: tuple = ("head", "setup", "products", "graph", "recipes", "suppliers", "save", "prov"), phone: bool = False) -> str:
    body = ""
    if "head" in parts: body += head()
    if "setup" in parts: body += setup()
    if "products" in parts: body += products()
    if "graph" in parts: body += graph(start)
    if "recipes" in parts: body += recipes()
    if "suppliers" in parts: body += suppliers()
    if "save" in parts: body += save_panel()
    if "prov" in parts: body += provenance()
    out = bc.shell("wiki", body)
    if phone:
        out = out.replace('<div class="board {{theme}}">', '<div class="board phone {{theme}}">', 1)
    return out


def alt_reader() -> str:
    body = """
<div class="row" style="align-items:flex-start">
  <div class="col" style="width:180px;flex:none">
    <div class="bx"><div class="sm">CONTENTS</div><div class="ln m" style="margin:8px 0"></div>Business types<br>Products<br>Furniture<br>Suppliers<br>Recipes<br>Machines<br>Ingredients<br>Buildings<br>…</div>
  </div>
  <div class="col" style="flex:1">
    <div class="bx"><span class="big">Gift Shop</span><div class="sm">Wiki / Business types</div><p style="margin:8px 0 0">A paragraph lede, a legend of five badges, then the game's bullet lists rendered as bullet lists with a source key after each one.</p></div>
    <div class="bx"><div class="sm">REQUIREMENTS</div>• Stack of Shopping Baskets<br>• Point of Sales<br>• At least one product</div>
    <div class="bx"><div class="sm">PRIMARILY SELLS</div>• Gift (Cheap) · • Gift (Expensive) · • Umbrella</div>
    <div class="bx dash">Three tables: products × five axes, size codes, build metadata</div>
    <div class="bx dash">Nine disclosures, closed at rest</div>
  </div>
</div>"""
    return bc.lofi("Reader with a contents rail", "The prototype's shape: a sticky contents rail and one long article per page. Faithful to the help text, and the rail scales to 851 pages. Trade-off: it reads as a document, not as the board; the relationships stay flattened into lists and nothing on it rewards the mouse.", body)


def main() -> None:
    bc.CSS = bc.CSS + CSS
    assert "[100, 72, 54]" in bc.SCRIPT and "n.right - p0.left + 40" in bc.SCRIPT
    bc.SCRIPT = bc.SCRIPT.replace("[100, 72, 54]", "[82, 60, 46]", 1).replace("n.right - p0.left + 40", "n.right - p0.left + 22", 1)
    tail = bc.SCRIPT.rstrip()
    assert tail.endswith("}\n}"), "unexpected script shape"
    body = tail[:-1].rstrip()[:-1]
    bc.SCRIPT = body + SCRIPT + "  }\n}\n"
    bc.SCRIPT = bc.SCRIPT.replace("class Component extends DCLogic {", data_js() + "class Component extends DCLogic {", 1)
    files = {
        "Main.dc.html": home(),
        "Search.dc.html": home(query="gift"),
        "GiftShop.dc.html": page(),
        "GiftShopPicked.dc.html": page(start="cheap", parts=("graph", "recipes")),
        "Phone.dc.html": page(phone=True),
        "AltReader.dc.html": alt_reader(),
    }
    for name, src in files.items():
        with open(os.path.join(HERE, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(src)
    XR = 1440 + 120
    artboards = [
        {"file": "Main.dc.html", "title": "Wiki", "x": 0, "y": 0, "w": 1440, "h": 1000, "is_interactive": True, "expand": "fill"},
        {"file": "Search.dc.html", "title": "Wiki · searching", "x": XR, "y": 0, "w": 1440, "h": 1000, "is_interactive": True, "expand": "fill"},
        {"file": "GiftShop.dc.html", "title": "Wiki · Gift Shop", "x": 0, "y": 1180, "w": 1440, "h": 3180, "is_interactive": True, "expand": "fill"},
        {"file": "GiftShopPicked.dc.html", "title": "Gift Shop · a product picked", "x": XR, "y": 1180, "w": 1440, "h": 1160, "is_interactive": True, "expand": "fill"},
        {"file": "Phone.dc.html", "title": "Gift Shop · phone", "x": XR, "y": 2520, "w": 390, "h": 1840, "is_interactive": True},
        {"file": "AltReader.dc.html", "title": "Alternative · reader with a rail", "x": XR + 520, "y": 2520, "w": 720, "h": 760},
    ]
    notes = [
        {"id": "try-wiki", "x": 0, "y": -170, "w": 600, "text": "The Wiki tab, in the board's own vocabulary. Home is a shelf of the 14 categories the game's help menu has, with the page counts read from helpstructure.json; the cards tilt under the mouse like Next moves. Type in the search and pages come up as findings-style rows while the shelf dims to the categories that still match. Sentences live behind the ? marks; the badge colours are explained there too. Nothing from the game files shows by name: no keys, no file names."},
        {"id": "note-search", "x": XR, "y": -110, "w": 460, "text": "The search state, for reading: 'gift' finds five pages, the shelf keeps only the categories that hold one."},
        {"id": "note-page", "x": 0, "y": 1070, "w": 600, "text": "The Gift Shop page. One authored line, four glance tiles, then: To open (tick the squares; each card keeps a score; the amber dot is the Paper Bags catch), Sells (three cards, the one red pill is the story), Fits together (click a node, its lines light, the dashed ones march, and the ball parked on the rule rolls along them: supplier into product, product onto shelf, looping until you let go), Make it (hover a recipe and the dots travel), Where to go (pins open the map), Yours (empty until a save is open), and where it all came from. Hover any chip or fact for where it comes from."},
        {"id": "note-picked", "x": XR, "y": 1070, "w": 460, "text": "The picked state: Gift (Cheap). Five links stay lit, everything else steps back, and the ball rides them in turn: three suppliers into the gift, the gift onto its two fixtures. The x lets go and it rolls home. The 'Plan a chain' link hands the three recipes to Growth."},
        {"id": "note-phone", "x": XR, "y": 2410, "w": 420, "text": "At 390 the nav keeps icons only, tiles go two-up, the lanes stack and the wires are dropped: the picked state still reads from the dimming alone. Recipes run top to bottom."},
        {"id": "note-alt", "x": XR + 520, "y": 2410, "w": 460, "text": "Alternative kept for comparison: the prototype's reader with a contents rail. Low-fi on purpose; pick it if the wiki should read as a document rather than as another page of the board."},
    ]
    canvas = {"artboards": artboards, "annotations": notes, "launch": {"view": "canvas"}}
    with open(os.path.join(HERE, "canvas.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(canvas, f, indent=2)
    print("wrote", len(files), "artboards and canvas.json")


if __name__ == "__main__":
    main()
