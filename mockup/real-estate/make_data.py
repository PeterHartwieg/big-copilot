"""Writes data.json for the Real estate canvas from Peter's day-329 save. Owner only.

Inputs (paths as arguments, none of them in the repository):
  payload.json        the board's payload for the save (`let D = ...` cut out of dashboard.html)
  re_rows.json        the research rows per owned building (research/real-estate-2026-10-12, scripts/analyse.py)
  buildings_game.json totalSqm, traffic and type per building, read from the game's bundle (scripts/read_buildings.py)

    python mockup/real-estate/make_data.py PAYLOAD RE_ROWS BUILDINGS_GAME

The formulas are research/real-estate-2026-10-12/rules.md ("Core formulas", "Occupancy dynamics", "Tax and building
purchases"). The addresses are the game's own map; nothing here names a person or a company.
"""
from __future__ import annotations

import itertools
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).parent
HOOD = {"midtown": 2.2, "hellskitchen": 1.3, "murrayhill": 0.9, "garmentdistrict": 0.65, "lowermanhattan": 0.55,
        "industrycity": 0.5, "thehamptons": 0.5}
CODE = {"midtown": "MT", "hellskitchen": "HK", "murrayhill": "MH", "garmentdistrict": "GD", "lowermanhattan": "LM",
        "industrycity": "IC", "thehamptons": "HA"}
TYPE = {"retail": 1.0, "office": 0.75, "residential": 1.5, "warehouse": 0.5, "cinema": 1.0, "theater": 1.0, "special": 0.0}
DEDUCTIBLE = {"retail", "office", "cinema", "theater", "warehouse"}
DPY, DAY, TAX_DAY, RATE = 60, 329, 360, 51
BASE = 99_900_000          # projected taxable base to day 360 (rules.md, Peter's save)
STEP = 0.21 * 4.5          # occupancy points a day just under market: P(move-in) 21%, mean +4.5


def tfac(t: str, traffic: int) -> float:
    return 1 + max(30 - traffic, 0) / 100 if t == "residential" else 0.3 + traffic / 100


def market_rent(t: str, hood: str, traffic: int) -> float:
    return 20554 * TYPE[t] * HOOD[hood] * tfac(t, traffic) * 0.00056


def best_of(m: float) -> float:
    return (math.ceil(m * 100 - 1e-9) - 1) / 100


def tax_day(sqm: float, t: str, hood: str) -> float:
    return sqm * TYPE[t] * HOOD[hood] * 3.5 / DPY


def fill_days(occ: float) -> int:
    return int(5 * round((100 - occ) / STEP / 5)) if occ < 100 else 0


def main(payload: str, rows: str, game: str) -> None:
    D = json.loads(Path(payload).read_text(encoding="utf-8"))
    R = json.loads(Path(rows).read_text(encoding="utf-8"))
    G = {k.replace("|", "#"): v for k, v in json.loads(Path(game).read_text(encoding="utf-8")).items()}
    addr = {b["key"]: b["address"] for b in D["ownedBuildings"]}
    keyof = {}
    for k, a in addr.items():
        street, no = k.split("street_")[1].split("#")
        keyof[f"{no} {street}"] = k

    owned = []
    for r in R:
        key = keyof[r["addr"]]
        t, hood, sqm = r["type"], r["hood"], r["sqm"]
        villa = bool(r.get("hamptons"))
        price = round(r["price"], 2)
        m = r["market"]
        best = best_of(m)
        now = 0 if villa else price * sqm * r["occ"] / 100
        full = best * sqm
        hist = r["hist"] or {}
        occ_hist = [max(0, min(100, round(hist[d] / (price * sqm) * 100))) if price else 0 for d in sorted(hist, key=int)]
        row = {"key": key, "address": addr[key], "hood": CODE[hood], "type": t, "size": r["size"], "sqm": sqm,
               "occ": round(r["occ"]), "price": price, "market": round(m, 3), "best": best, "now": round(now),
               # Under market a building fills on its own (nobody moves out): only the cents up to the best price count.
               "full": round(full), "gain": round(full - now) if price >= m else round((best - price) * sqm), "tax": round(tax_day(sqm, t, hood)),
               "paid": round(r["purchase"]), "day": r["pday"], "rented": r["rented"], "villa": villa,
               "fill": fill_days(r["occ"]), "hist": occ_hist}
        row["payback"] = None if villa else round(row["paid"] / (row["full"] - row["tax"]))
        full_now = row["occ"] >= 100
        row["flag"] = (not villa) and ((row["gain"] >= 100 and row["gain"] >= 0.05 * row["now"]) or (full_now and price >= m))
        row["risk"] = (not villa) and full_now and price >= m
        owned.append(row)
    owned.sort(key=lambda x: (x["villa"], not x["flag"], -x["gain"]))

    rent_by = {b["key"]: (b["rent"], b["name"]) for b in D["businesses"] if b.get("rent")}
    own_keys = set(addr)
    listed = {s["key"]: s for s in D["premises"]["forSale"]}
    cash = D["kpi"]["cash"]
    buy = []
    keys = set(listed) | {k for k in rent_by if k not in own_keys}
    for k in keys:
        g = G.get(k)
        if not g or g["BuildingType"].endswith("special"):
            continue
        t = g["BuildingType"].split("_")[1]
        hood = g["Neighbourhood"].split("_")[1]
        sqm, traffic = g["totalSqm"], g["trafficIndex"]
        villa = g["customMarketPrice"] > 0
        mv = g["customMarketPrice"] if villa else sqm * 20554 * TYPE[t] * HOOD[hood] * tfac(t, traffic)
        s = listed.get(k)
        price = s["price"] if s else round(mv * 1.01)
        m = market_rent(t, hood, traffic)
        income = 0 if villa else best_of(m) * sqm
        saves, biz = rent_by.get(k, (0, None))
        tx = tax_day(sqm, t, hood)
        net = income + saves - tx
        a = s["address"] if s else next(b["address"] for b in D["businesses"] if b["key"] == k)
        buy.append({"key": k, "address": a, "hood": CODE[hood], "type": t, "size": g["BuildingSize"][-1].upper(),
                    "sqm": sqm, "price": round(price), "listed": bool(s), "income": round(income), "saves": round(saves),
                    "biz": biz, "villa": villa, "payback": None if villa or net <= 0 else round(price / net),
                    "deductible": t in DEDUCTIBLE and not villa, "unit": s["m2"] if s else None, "layout": s.get("layout") if s else None})
    buy.sort(key=lambda x: x["price"])

    # Before tax day: listed deductible buildings whose prices sum closest to the target from below; ties, fewer.
    target = min(cash, BASE)
    cand = [b for b in buy if b["listed"] and b["deductible"] and b["price"] <= target]
    best_pick, best_sum = (), 0
    for n in (1, 2, 3):
        prices = sorted(cand, key=lambda b: b["price"])
        for combo in itertools.combinations(range(len(prices)), n) if n < 3 else []:
            tot = sum(prices[i]["price"] for i in combo)
            if best_sum < tot <= target:
                best_pick, best_sum = tuple(prices[i]["key"] for i in combo), tot
        if n == 3:  # pairs + one, through a sorted pair table
            pairs = sorted((prices[i]["price"] + prices[j]["price"], i, j) for i in range(len(prices)) for j in range(i + 1, len(prices)))
            import bisect
            sums = [p[0] for p in pairs]
            for k_, c in enumerate(prices):
                at = bisect.bisect_right(sums, target - c["price"]) - 1
                while at >= 0 and k_ in pairs[at][1:]:
                    at -= 1
                if at >= 0:
                    tot = sums[at] + c["price"]
                    if tot > best_sum + 50_000:  # a third building only for a real step closer
                        best_pick, best_sum = (prices[pairs[at][1]]["key"], prices[pairs[at][2]]["key"], c["key"]), tot
    pick = [next(b for b in buy if b["key"] == k) for k in best_pick]
    pick.sort(key=lambda b: -b["price"])
    tax = {"day": DAY, "taxDay": TAX_DAY, "rate": RATE, "cash": round(cash), "base": BASE, "target": round(target),
           "bound": "cash" if cash <= BASE else "base", "spend": best_sum, "saves": round(best_sum * RATE / 100),
           "left": round(cash - best_sum), "pick": [b["key"] for b in pick]}
    out = {"day": DAY, "cash": round(cash), "owned": owned, "buy": buy, "tax": tax,
           "totals": {"now": sum(o["now"] for o in owned), "full": sum(o["full"] for o in owned if not o["villa"])}}
    (HERE / "data.json").write_text(json.dumps(out, indent=0, ensure_ascii=False), encoding="utf-8", newline="\n")
    print(len(owned), "owned,", sum(o["flag"] for o in owned), "flagged,", len(buy), "to buy; pick", [b["address"] for b in pick], best_sum)


if __name__ == "__main__":
    main(*sys.argv[1:4])
