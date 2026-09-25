"""The trading company of tests/save_fixtures.py with hostile names, as a board.

Every name the player types, or a crafted save carries, is text: a shop, a
depot, a factory and a product here are named with markup, an ampersand, a
script end tag and a comment opener, so a board that lets any of them reach
innerHTML unescaped grows a <bc-xss> element or sets window.__xss. Synthetic
only: never a real save.

    python tests/hostile_names_fixture.py out.html
"""
from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import save_fixtures as f  # noqa: E402
from es3_fixture import encode  # noqa: E402

# Each name carries an element no board draws (<bc-xss>), a handler that would
# run, an ampersand, and one of the two ways out of the inlined <script>.
SHOP = "[<bc-xss>] Tom & Jerry <img src=x onerror=window.__xss=1> </script>"
GIFTS = "<!--<script> Gifts <bc-xss></bc-xss> & Co"
DEPOT = "Depot & <img src=x onerror=window.__xss=2><bc-xss>"
FACTORY = "Brew <bc-xss>&amp;</bc-xss> <img src=x onerror=window.__xss=3></script>"
PRODUCT = "Beer <img src=x onerror=window.__xss=4> & <bc-xss>"
# Other text a save carries: a person, a rival's shop and company, a uniform.
PERSON = "Ana <bc-xss> & <img src=x onerror=window.__xss=5>"
RIVAL_SHOP = "Corner <bc-xss> & <img src=x onerror=window.__xss=6>"
RIVAL = "Holdings <bc-xss> & Co"
UNIFORM = "Black <bc-xss> & <img src=x onerror=window.__xss=7>"
NAMES = {f.LIQUOR: SHOP, f.GIFTS: GIFTS, f.HUB: DEPOT, f.BREWERY: FACTORY, f.RIVAL: RIVAL_SHOP}


def hostile_company(day: int = f.DAY) -> dict:
    company = f.data_company(day)
    for site in company["BuildingRegistrations"]:
        at = (site.get("StreetName"), site.get("StreetNumber"))
        if at in NAMES:
            site["BusinessName"] = NAMES[at]
    for person in company["EmployeeInstances"]:
        if person["id"] == "EMPana":
            person["characterData"]["name"] = PERSON
    for event in company["marketEvents"]:
        if event.get("rivalName"):
            event.update(rivalName=RIVAL, businessName=RIVAL_SHOP)
    company["employeePresets"][0]["name"] = UNIFORM
    company["SaveGameName"] = "Hostile <bc-xss> & </script> Co"
    return company


def hostile_names() -> dict:
    names = dict(f.data_names())
    names[f.BEER] = PRODUCT
    return names


def hostile_payload(path: str) -> dict:
    import ba_dashboard
    from ba_save import Names, load_save

    with open(path, "wb") as fh:
        fh.write(encode(hostile_company()))
    return ba_dashboard.extract(load_save(path), Names(hostile_names()), None)


if __name__ == "__main__":
    import tempfile

    import ba_dashboard

    with tempfile.TemporaryDirectory() as tmp:
        data = hostile_payload(os.path.join(tmp, "hostile.hsg"))
    with open(sys.argv[1], "w", encoding="utf-8") as fh:
        fh.write(ba_dashboard.render(data))
