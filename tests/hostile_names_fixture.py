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
# A factory input, drawn on Supply, the factory's page and the chain planner.
INGREDIENT = "Water <bc-xss> & <img src=x onerror=window.__xss=8>"
# Text the board makes from a slug rather than game text: the gift shop's
# street, house number and business type are ones the game never wrote.
STREET = "ba:street_broadway<bc-xss>street"
HOUSE = "19<bc-xss>"
TYPE = "ba:businesstype_<bc-xss>giftshop"
RECIPE = "<bc-xss>\" onmouseover=\"window.__xss=9"
NAMES = {f.LIQUOR: SHOP, f.GIFTS: GIFTS, f.HUB: DEPOT, f.BREWERY: FACTORY, f.RIVAL: RIVAL_SHOP}


def _move_gifts(node):
    """Every reference to the gift shop's address, to the hostile one."""
    if isinstance(node, dict):
        if node.get("streetName") == f.GIFTS[0] and node.get("streetNumber") == f.GIFTS[1]:
            node.update(streetName=STREET, streetNumber=HOUSE)
        for v in node.values():
            _move_gifts(v)
    elif isinstance(node, list):
        for v in node:
            _move_gifts(v)


def hostile_company(day: int = f.DAY) -> dict:
    company = f.data_company(day)
    _move_gifts(company)
    for site in company["BuildingRegistrations"]:
        at = (site.get("StreetName"), site.get("StreetNumber"))
        if at in NAMES:
            site["BusinessName"] = NAMES[at]
        if at == f.GIFTS:
            site.update(StreetName=STREET, StreetNumber=HOUSE, businessTypeName=TYPE)
        if at == f.BREWERY:
            # A machine on a recipe the board cannot name: the line picker.
            site["itemInstances"].append(f._item(
                "MACHINEthree", "ba:itemname_bottlingmachine", priority=2, selectedRecipeId=RECIPE,
                workstationType="ba:factoryworkstationtype_bottledgoodsworkstation"))
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
    names[f.WATER] = INGREDIENT
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
