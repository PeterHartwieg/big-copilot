"""Build data.json for the finder mockup from the HART. YT save and a rendered market payload."""
import json, sys, collections, os
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, ROOT)
from ba_save import load_save
S = r"C:\Users\Peter\AppData\Local\Temp\claude\C--Users-Peter-Coding-Projects-Big-Ambitions\691b7b4a-e0db-425c-8ccb-f1ce5fd186ef\scratchpad"
D = json.load(open(S + r"\hart.json"))
save = load_save(r"C:\Users\Peter\AppData\LocalLow\Hovgaard Games\Big Ambitions\SaveGames\Big Ambitions\GP36BrwpAEaWepTscnr0Q==\HART. YT.hsg")
bl = {(b["s"], b["n"]): b for b in json.load(open(os.path.join(ROOT, "ba_buildings.json")))}
loc = json.load(open(os.path.join(ROOT, "web", "maps", "locations.json"))); geo = {b["key"]: b for b in loc["buildings"]}
g = json.load(open(os.path.join(ROOT, "web", "py", "gametext.json"))); names = {k: v for k, v in g.items() if isinstance(v, str)}
ADDR = {b["key"]: b["address"] for b in loc["buildings"]}
def addr(slug, n):
    return ADDR.get(f"{slug}#{n}") or f"{n} " + names.get(slug, slug.replace("ba:street_", "").title())
RATE = {"Midtown": 0.02482, "Hell's Kitchen": 0.01468, "Murray Hill": 0.01020, "Garment District": 0.00734, "Lower Manhattan": 0.00621, "The Hamptons": 0.00568, "Industry City": 0.00566}
CAPS = {"retail": {"A": 15, "C": 30, "D": 40, "M": 75}, "office": {"A": 4, "C": 8, "D": 10, "J": 10, "K": 50}, "cinema": {"S": [100, 150]}, "theater": {"R": [150, 200]}}
TAG = {"Garment District": "GD", "Hell's Kitchen": "HK", "Industry City": "IC", "Lower Manhattan": "LM", "Midtown": "MT", "Murray Hill": "MH", "The Hamptons": "HA"}
rows = []
for r in save.items(save.root["BuildingRegistrations"]):
    if not r: continue
    b = bl.get((r.get("StreetName"), r.get("StreetNumber")))
    if not b: continue
    key = f'{r["StreetName"]}#{r["StreetNumber"]}'
    t = b["t"]; bt = r.get("businessTypeName") or ""
    if r.get("RentedByPlayer"): st = "mine"
    elif bt and bt != "ba:businesstype_empty": st = "rival"
    elif r.get("AvailableForRent") and t in ("retail", "office", "warehouse", "cinema", "theater"): st = "vacant"
    else: st = "unavailable"
    rent = None if t == "residential" else round(b["m"] * (30 + b["x"]) * RATE[b["h"]] * (1.033 if t == "office" else 1))
    cap = (CAPS.get(t) or {}).get(b["z"])
    occ = None
    if st in ("rival", "mine") and bt and bt != "ba:businesstype_empty":
        occ = {"name": r.get("BusinessName"), "type": names.get(bt, bt.split("_")[-1].title()), "typeSlug": bt}
    ge = geo.get(key)
    rows.append({"key": key, "address": addr(r["StreetName"], r["StreetNumber"]), "hood": b["h"], "code": TAG[b["h"]], "type": t, "size": b["z"], "m2": b["m"], "traffic": b["x"], "cap": cap, "rent": rent, "status": st, "occupant": occ, "bounds": [round(v, 1) for v in ge["bounds"]] if ge else None})
forsale = []
for f in save.items(save.root["buildingsForSale"]):
    a = (f or {}).get("address") or {}
    b = bl.get((a.get("streetName"), a.get("streetNumber")))
    if b: forsale.append({"key": f'{a["streetName"]}#{a["streetNumber"]}', "address": addr(a["streetName"], a["streetNumber"]), "hood": b["h"], "code": TAG[b["h"]], "type": b["t"], "m2": b["m"], "price": f["buildingPrice"]})
demand = collections.defaultdict(list)
for r in D["market"]["types"]:
    for c in r["cells"]:
        if c and c.get("demand") is not None: demand[c["hood"]].append({"slug": r["slug"], "type": r["type"], "demand": c["demand"], "providers": c["providers"], "mine": c.get("here", False), "category": "cinema" if "cinema" in r["slug"] else "theater" if "theater" in r["slug"] else "retail"})
for r in D["market"].get("offices", []):
    for c in r["cells"]:
        if c and c.get("demand") is not None: demand[c["hood"]].append({"slug": r["slug"], "type": r["type"], "demand": c["demand"], "providers": c["providers"], "mine": c.get("here", False), "category": "office"})
out = {"buildings": rows, "forSale": forsale, "demand": demand, "caps": CAPS, "rates": RATE, "regions": loc.get("regions", []), "labels": loc.get("districtLabels", [])}
json.dump(out, open(os.path.join(HERE, "data.json"), "w"), separators=(",", ":"))
print(len(rows), collections.Counter((r["type"], r["status"]) for r in rows).most_common(12))
print("forsale", len(forsale), "demand hoods", list(demand), "types HK", len(demand["Hell's Kitchen"]))
print([(r["address"], r["hood"], r["traffic"], r["rent"], r["cap"]) for r in rows if r["status"] == "vacant" and r["type"] == "retail"][:6])
print("mine", [(r["address"], r["occupant"]) for r in rows if r["status"] == "mine"][:3])
