"""Compare DEMANDS_NOT_MADE, STATION_SKILLS and JOB_DEMANDS with the game's bundles.

    python -m pip install --target <scratch folder outside this repo> UnityPy
    $env:PYTHONPATH = '<that folder>'      # PowerShell
    export PYTHONPATH=<that folder>        # bash
    python tools/game_update/bundles.py

The three tables in ba_dashboard.py were read by hand from the installed game's
Addressables bundles, under <game>/Big Ambitions_Data/StreamingAssets/aa/
StandaloneWindows64/:

  defaultlocalgroup_assets_businesstypes_*.bundle
      customerDemandSets[].type per businessTypeName -> DEMANDS_NOT_MADE, the
      amenity and uniform demands a retail type's customers never make
  defaultlocalgroup_assets_items_*.bundle
      suitableSkills per itemName, in the game's order -> STATION_SKILLS
  defaultlocalgroup_assets_jobdemands_*.bundle
      demandName, priority and itemNames -> JOB_DEMANDS

This re-reads them with the helpers make_demand_curves.py uses, so it needs
UnityPy and the installed game, found the same way (BA_LOCALE, then the usual
Steam locations). It prints one line per difference and a closing count. A
business type in the bundle that the board does not know is a difference too:
RETAIL_TYPES, OFFICE_TYPES and COST_CENTRE_TYPES in ba_dashboard.py, plus
OTHER_TYPES below, the types the game has but a player's company does not run as
its own kind of site, read at build 3682. So 0 differences means the three
tables match and the game has no new business type. Hour windows, day counts and the
other JOB_DEMANDS settings are not compared: check the jobdemands fields
(betweenHours, shiftPeriod, daysWorkingPerWeek, freeDays and the minimums) by
eye when a demand changes. Nothing is written. See docs/game-update.md.
"""
from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

import make_demand_curves as curves  # noqa: E402  (exits with install steps without UnityPy)
from ba_dashboard import (  # noqa: E402
    AMENITY_DEMANDS, COST_CENTRE_TYPES, DEMANDS_NOT_MADE, EMPTY_TYPE, JOB_DEMANDS,
    OFFICE_TYPES, RETAIL_TYPES, STATION_SKILLS, UNIFORM_DEMAND,
)

ITEM_PREFIX = "ba:itemname_"

# Business types in the build-3682 bundle that the board has no set for: the
# city's own businesses (banks, the wholesalers, the importers, the IRS) and the
# ones it does not model. A new type the game adds lands in neither these nor
# the board's sets, and is reported. Classify it: a walk-in business goes into
# RETAIL_TYPES (and gets its DEMANDS_NOT_MADE row), an office into
# OFFICE_TYPES; anything else is added here.
OTHER_TYPES = {
    "ba:businesstype_appliancestore",
    "ba:businesstype_bank",
    "ba:businesstype_cardealership",
    "ba:businesstype_casino",
    "ba:businesstype_clinic",
    "ba:businesstype_furniturestore",
    "ba:businesstype_gasstation",
    "ba:businesstype_hospital",
    "ba:businesstype_importexport",
    "ba:businesstype_interiorinstallationfirm",
    "ba:businesstype_irs",
    "ba:businesstype_marketingagency",
    "ba:businesstype_movingservice",
    "ba:businesstype_officesupplystore",
    "ba:businesstype_privatedriverservice",
    "ba:businesstype_recruitmentagency",
    "ba:businesstype_school",
    "ba:businesstype_truckgarage",
    "ba:businesstype_wholesalestore",
}


def main() -> None:
    game_root = curves._game_root()

    def read(stem: str) -> list:
        return list(curves._behaviours(curves._bundle(game_root, "defaultlocalgroup_assets_" + stem)))

    differences = 0

    def report(*parts) -> None:
        nonlocal differences
        differences += 1
        print(*parts)

    # DEMANDS_NOT_MADE: which of the six demands each retail type lacks.
    six = set(AMENITY_DEMANDS) | {UNIFORM_DEMAND}
    types = {t.get("businessTypeName"): t for t in read("businesstypes")}
    known = RETAIL_TYPES | OFFICE_TYPES | COST_CENTRE_TYPES | OTHER_TYPES | {EMPTY_TYPE}
    for name in sorted(n for n in types if n and n not in known):
        report("BUSINESS TYPE", name, "is new: the board does not know it")
    for name in sorted(RETAIL_TYPES):
        if name not in types:
            report("DEMANDS_NOT_MADE", name, "is not in the bundle")
            continue
        made = {d["type"] for d in types[name].get("customerDemandSets") or []}
        if six - made != DEMANDS_NOT_MADE.get(name, set()):
            report("DEMANDS_NOT_MADE", name, "never makes", sorted(six - made))
        extra = sorted(made - six)
        if extra:
            print("  note:", name, "also makes", extra)

    # STATION_SKILLS: every item with a suitableSkills list, order kept.
    stations = {t["itemName"]: tuple(t["suitableSkills"])
                for t in read("items") if t.get("suitableSkills")}
    for item in sorted(set(stations) | set(STATION_SKILLS)):
        if stations.get(item) != STATION_SKILLS.get(item):
            report("STATION_SKILLS", item, "game", stations.get(item),
                   "board", STATION_SKILLS.get(item))

    # JOB_DEMANDS: names, priorities and the item lists of desk/building demands.
    demands = {t["demandName"]: t for t in read("jobdemands") if t.get("demandName")}
    for slug in sorted(set(demands) ^ set(JOB_DEMANDS)):
        report("JOB_DEMANDS", slug, "only in the", "game" if slug in demands else "board")
    for slug, (kind, setting, priority) in sorted(JOB_DEMANDS.items()):
        t = demands.get(slug)
        if not t:
            continue
        if t.get("priority") != priority:
            report("JOB_DEMANDS", slug, "priority", t.get("priority"), "board", priority)
        if kind in ("desk", "building"):
            items = {i[len(ITEM_PREFIX):] if i.startswith(ITEM_PREFIX) else i
                     for i in t.get("itemNames") or []}
            if items != set(setting):
                report("JOB_DEMANDS", slug, "items", sorted(items), "board", sorted(setting))

    print(f"{len([n for n in types if n])} business types, {len(RETAIL_TYPES)} retail types, {len(stations)} stations, "
          f"{len(demands)} job demands read; {differences} difference(s)")


if __name__ == "__main__":
    main()
