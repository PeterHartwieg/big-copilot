"""A synthetic company with data behind it, as an ES3 save, for extract() end to end.

tests/es3_fixture.py's link_company() is a skeleton: every data source is
empty, so extract() runs without reaching the producers that need history. The
company here trades. An import hub brings in water for a brewery, which tops up
a liquor store with beer; a gift shop is supplied by a wholesale contract. Two
weeks of order history (with hour reports) and three weeks of financial
summaries sit behind them, with staff on schedules, a loan, a rented home, a
bought building, a rival in Midtown, a hype wave and a supplier event, market
demand in four neighbourhoods and a small game text with a recipe, a
workstation and the station pages.

Everything is computed from `day`, so the same company can be saved on two
days a week apart (day N, then N + 7) against one history file, the way a
player's board sees it. `data_company(day)` is the tree, `write_data_save(path,
day)` the .hsg, and `data_names()` the game text to extract it with. The
addresses are real ones from ba_buildings.json, so each site has a
neighbourhood. Never a real save: tests use synthetic fixtures only.

    python tests/save_fixtures.py out.hsg [day]
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from es3_fixture import address, encode  # noqa: E402

DAY = 40  # a Friday: day 1 is a Monday
CHARACTER = "PAYLOADco"

HUB = ("ba:street_eighthavenue", 4)       # a warehouse in Industry City
BREWERY = ("ba:street_eighthavenue", 8)   # a warehouse in Industry City, run as a factory
LIQUOR = ("ba:street_eighthstreet", 5)    # retail size C, Midtown
GIFTS = ("ba:street_broadwaystreet", 19)  # retail size C, Lower Manhattan
HOME = ("ba:street_broadwaystreet", 13)   # residential, Midtown
RIVAL = ("ba:street_broadwaystreet", 9)   # retail, Midtown, a rival's gift shop
FOR_SALE = ("ba:street_broadwaystreet", 11)
BANK = ("ba:street_broadwaystreet", 1)
PIER = ("ba:street_eighthavenue", 2)

BEER, WATER = "ba:itemname_beer", "ba:itemname_water"
GIFT, UMBRELLA, BAG = "ba:itemname_cheapgift", "ba:itemname_umbrella", "ba:itemname_paperbag"
SODA = "ba:itemname_sodacan"
BEER_RECIPE = "LScSWfyqVU+2BYQazKeF6g=="  # RECIPE_ITEMS' id for beer
MIDTOWN, LOWER = "ba:neighborhood_midtown", "ba:neighborhood_lowermanhattan"
INDUSTRY, HELLS = "ba:neighborhood_industrycity", "ba:neighborhood_hellskitchen"
SERVICE, CLEANING, FACTORY_WORKER = "ba:skill_customerservice", "ba:skill_cleaning", "ba:skill_factoryworker"
OPENED = 3  # the day every site opened
RIVAL_ID = "RIVALoneRIVALoneRIVALo=="
PRESET = "PRESETdataAAAAAAAAAAAA=="

# The shape of a week, indexed by day % 7: 0 Sunday, 1 Monday (day 1 is a Monday).
WEEK = (1.3, 0.8, 0.9, 0.9, 1.0, 1.2, 1.4)


def data_names() -> dict:
    """The game text extract() reads the company with: names, and the help
    pages the recipe, workstation, station, building capacity and type catalogues come
    from. Written in the game's own format; the figures are the fixture's."""
    station = ("**{name}** is a special *employee station* that requires employees with"
               " [{skill}](skill-{slug}) skill.\n\n**Customer Capacity:** {cap}")
    return {
        BEER: "Beer", WATER: "Water", GIFT: "Gift (Cheap)", UMBRELLA: "Umbrella",
        BAG: "Paper Bag", SODA: "Soda Can",
        "ba:itemname_cashregister": "Cash Register",
        "ba:itemname_cleaningstation": "Cleaning Station",
        "ba:itemname_bottlingmachine": "Bottling Machine",
        "ba:itemname_shelf": "Shelf",
        "ba:businesstype_liquorstore": "Liquor Store",
        "ba:businesstype_giftshop": "Gift Shop",
        "ba:businesstype_warehouse": "Warehouse",
        "ba:businesstype_factory": "Factory",
        "ba:businesstype_empty": "Empty",
        SERVICE: "Customer Service", CLEANING: "Cleaning", FACTORY_WORKER: "Factory Worker",
        "ba:jobdemand_freeweekends": "Free weekends",
        MIDTOWN: "Midtown", LOWER: "Lower Manhattan", INDUSTRY: "Industry City",
        HELLS: "Hell's Kitchen", "ba:neighborhood_global": "Global",
        "help_ba:itemname_cashregister_content": station.format(
            name="Cash Register", skill="Customer Service", slug="customerservice", cap=20),
        "help_ba:itemname_cleaningstation_content": (
            "**Cleaning Station** is a special *employee station* that requires employees with"
            " [Cleaning](skill-cleaning) skill."),
        "help_recipes_beerrecipe_content": (
            "**Beer Recipe** can be manufactured in a [Factory](businesstypes-factory).\n\n"
            "**Required Workstation**:\n* [Bottled Goods Workstation](furniture-bottledgoodsworkstation)\n\n"
            "**Required Raw Ingredients Per Hour:**\n\n* 25 X [Water](products-water)\n\n"
            "**Max Production Rate Per Hour:**\n\n* 25 [Beer](products-beer)"),
        "help_factory_workstation_bottledgoods_content": (
            "A **Bottled Goods Workstation** is created by adding Production Machines:\n"
            "* [Bottling Machine](furniture-bottlingmachine)\n\n"
            "To an Assembly Machine\n* [Food Assembly Machine](furniture-foodassemblymachine)\n\n"
            "The workstation can be used to create:\n* [Beer](recipes-beerrecipe)"),
        "help_ba:businesstype_liquorstore_content": (
            "**Liquor Store** businesses operate out of retail buildings.\n\n"
            "Businesses of this type primarily sell:\n\n* [Beer](products-beer)\n"
            "* [Soda Can](products-sodacan)\n\nAnd can additionally sell:\n\n* [Umbrella](products-umbrella)"),
        "help_ba:businesstype_giftshop_content": (
            "**Gift Shop** businesses operate out of retail buildings.\n\n"
            "Businesses of this type primarily sell:\n\n* [Gift (Cheap)](products-cheapgift)\n"
            "* [Umbrella](products-umbrella)\n\nAnd can additionally sell:\n\n* [Soda Can](products-sodacan)"),
    }


def _item(item_id: str, name: str, **fields) -> dict:
    return {"$k": item_id, "$v": {"id": item_id, "itemName": name, **fields}}


def _shelf(item_id: str, cargo: dict) -> dict:
    return _item(item_id, "ba:itemname_shelf", cargoInstances=[
        {"itemName": slug, "amount": amount} for slug, amount in cargo.items()])


def _shift(start, end, employee, station, kind=1) -> dict:
    return {"startingHour": start, "endingHour": end, "employeeId": employee,
            "itemInstanceId": station, "type": kind}


def _week(opening, shifts) -> list:
    """Seven schedule days (7 stands for Sunday), each open `opening` with `shifts`."""
    return [{"day": d, "isOpen": True,
             "openingHourSlots": [{"startingHour": opening[0], "endingHour": opening[1]}],
             "workShifts": list(shifts)} for d in range(1, 8)]


def _lift(day: int) -> float:
    """The weekday's shape, and the hype wave's lift on beer in Midtown."""
    return WEEK[day % 7] * (1.2 if WAVE[0] <= day < WAVE[1] else 1.0)


def _sales(day: int, base: dict, customers: int, hours: range, hyped: bool = False,
           rush: dict | None = None) -> dict:
    """One day of a shop's order history: `base` units a day of each item at
    its price, shaped by the weekday (and the wave), with the door count
    spread over `hours`. `rush` fixes the count of some hours ({hour: n}); the
    rest of the day is spread over the others."""
    f = _lift(day) if hyped else WEEK[day % 7]
    seen = round(customers * f)
    rush = rush or {}
    assert set(rush) <= set(hours), "a rush hour outside the open hours"
    rest = [h for h in hours if h not in rush]
    left = seen - sum(rush.values())
    spread = {h: left // len(rest) + (1 if i < left % len(rest) else 0) for i, h in enumerate(rest)}
    per_hour = [rush.get(h, spread.get(h)) for h in hours]
    return {
        "dayNumber": day, "totalCustomers": seen,
        "itemSales": [{"itemName": slug, "amountSold": round(units * f),
                       "totalPrice": float(round(units * f) * price)}
                      for slug, (units, price) in base.items()],
        "hourReports": [{"hour": h, "customers": n} for h, n in zip(hours, per_hour)],
    }


LIQUOR_SALES = {BEER: (250, 6.0)}
# The evening rush at the liquor store: more than its one register serves (20 an hour).
LIQUOR_RUSH = {17: 24, 18: 24}
GIFT_SALES = {GIFT: (80, 12.0), UMBRELLA: (20, 15.0)}
LOAN_PAYMENT = 300.0  # the loan's daily payment, booked in each day's summary
WAVE = (DAY - 5, DAY + 10)  # the days the hype wave on beer runs: over both saves


def _statement(addr, sales, cogs, wages, rent, profit=None, resources=None) -> dict:
    profit = sales - cogs - wages - rent if profit is None else profit
    return {"Address": address(*addr), "TotalSales": float(sales), "TotalResources": float(cogs),
            "SalaryExpenses": float(wages), "RentExpenses": float(rent),
            "MarketingExpenses": 0.0, "Theft": 0.0, "LicensingFees": 0.0,
            "TotalProfit": float(profit),
            # The goods cost line by line, which the planner prices materials from.
            "Resources": [{"ItemName": slug, "Amount": float(amount)}
                          for slug, amount in (resources or {}).items()]}


def _summary(d: int) -> dict:
    f = WEEK[d % 7]
    beer = round(250 * _lift(d)) * 6.0
    gifts = round(80 * f) * 12.0 + round(20 * f) * 15.0
    # A site's statement books its costs as positive figures.
    statements = [
        _statement(LIQUOR, beer, beer * 0.2, 456, 150),
        _statement(GIFTS, gifts, gifts * 0.5, 180, 120),
        _statement(HUB, 0, 200, 0, 90, resources={WATER: 200}),  # 400 water a day at $0.50
        _statement(BREWERY, 0, 60, 192, 110),
    ]
    business = sum(s["TotalProfit"] for s in statements)
    return {
        "dayNumber": d,
        "businessIncomeStatements": statements,
        "residentialStatements": [{"Address": address(*HOME)}],
        "totalBusinessProfit": business,
        # The company's own costs: negative, but for the homes (see _daily_series).
        "totalLoanExpenses": -LOAN_PAYMENT, "totalHealthInsuranceExpenses": -30.0,
        "totalResidentialExpenses": 45.0, "parkingFees": -5.0,
        "totalProfit": business - LOAN_PAYMENT - 30.0 - 45.0 - 5.0,
    }


def _log(d: int) -> tuple[list, list]:
    """A day of the hub's and the brewery's delivery logs (the measured draw)."""
    hub, brewery = [], []
    if d % 7 == 1:  # the import lands on Mondays
        hub.append({"dayOfDelivery": d, "deliveryItems": [{"itemName": WATER, "amountDelivered": 3000}]})
    hub.append({"dayOfDelivery": d, "deliveryItems": [{"itemName": WATER, "amountDelivered": -400}]})
    brewery.append({"dayOfDelivery": d, "deliveryItems": [{"itemName": WATER, "amountDelivered": 400}]})
    brewery.append({"dayOfDelivery": d, "deliveryItems": [{"itemName": BEER, "amountDelivered": -250}]})
    return hub, brewery


def data_company(day: int = DAY) -> dict:
    """The company's save tree on `day` (a Friday by default). See the module doc."""
    past = range(max(OPENED + 1, day - 21), day)        # financial summaries
    orders = range(max(OPENED, day - 14), day)          # a fortnight of order history
    hub_log, brewery_log = [], []
    for d in range(max(OPENED + 1, day - 20), day):
        h, b = _log(d)
        hub_log += h
        brewery_log += b

    liquor = {
        "StreetName": LIQUOR[0], "StreetNumber": LIQUOR[1], "RentedByPlayer": True,
        "BusinessName": "HART. Spirits", "businessTypeName": "ba:businesstype_liquorstore",
        "creationDay": OPENED, "RentPerDay": 150.0, "customerCapacity": 30,  # size C
        "securityLevelPercentage": 40.0,
        "satisfaction": {"overall": 82.0, "customerService": 90.0, "pricing": 75.0,
                         "cleanliness": 88.0, "facility": 70.0},
        "promotion": {"total": 120.0, "trafficIndex": 60.0, "marketing": 20.0},
        "itemInstances": [
            _item("REGliquor", "ba:itemname_cashregister"),
            _item("CLEANliquor", "ba:itemname_cleaningstation"),
            _item("LOCKERliquor", "ba:itemname_uniformlocker"),
            _shelf("SHELFliquor1", {BEER: 260}),
            _shelf("SHELFliquor2", {BEER: 140, SODA: 0}),
        ],
        "uniformsBySkill": [{"$k": SERVICE, "$v": PRESET}],
        "cachedFulfilledCustomerDemands": ["ba:customerdemand_toilet", "ba:customerdemand_sink"],
        "scheduleDays": _week((8, 22), [
            _shift(8, 16, "EMPana", "REGliquor"), _shift(14, 22, "EMPben", "REGliquor"),
            _shift(8, 20, "EMPcy", "CLEANliquor", kind=0)]),
        "orderHistory": [_sales(d, LIQUOR_SALES, 160, range(8, 22), hyped=True, rush=LIQUOR_RUSH) for d in orders],
        "retailPrices": [{"itemName": BEER, "price": 6.0}, {"itemName": SODA, "price": 2.5}],
        "deliveryTransactions": [],
    }
    gifts = {
        "StreetName": GIFTS[0], "StreetNumber": GIFTS[1], "RentedByPlayer": True,
        "BusinessName": "HART. Gifts", "businessTypeName": "ba:businesstype_giftshop",
        "creationDay": OPENED, "RentPerDay": 120.0, "customerCapacity": 30,  # size C
        "securityLevelPercentage": 0.0,
        "satisfaction": {"overall": 64.0, "customerService": 70.0, "pricing": 60.0,
                         "cleanliness": 40.0, "facility": 55.0},
        "promotion": {"total": 80.0, "trafficIndex": 50.0, "marketing": 0.0},
        "itemInstances": [
            _item("REGgifts", "ba:itemname_cashregister"),
            _shelf("SHELFgifts1", {GIFT: 300}),
            _shelf("SHELFgifts2", {UMBRELLA: 30}),
        ],
        "uniformsBySkill": [],
        "cachedFulfilledCustomerDemands": ["ba:customerdemand_toilet"],
        "scheduleDays": _week((9, 19), [_shift(9, 19, "EMPdee", "REGgifts")]),
        "orderHistory": [_sales(d, GIFT_SALES, 70, range(9, 19)) for d in orders],
        "retailPrices": [{"itemName": GIFT, "price": 12.0}, {"itemName": UMBRELLA, "price": 15.0}],
        "deliveryTransactions": [],
        "dirtSpots": [{"dirtiness": 30.0}, {"dirtiness": 2.0}],
    }
    hub = {
        "StreetName": HUB[0], "StreetNumber": HUB[1], "RentedByPlayer": True,
        "BusinessName": "HART. Hub", "businessTypeName": "ba:businesstype_warehouse",
        "creationDay": OPENED, "RentPerDay": 90.0,
        "itemInstances": [_shelf("PALLEThub", {WATER: 1500})],
        "scheduleDays": [], "orderHistory": [], "retailPrices": [],
        "deliveryTransactions": hub_log,
    }
    brewery = {
        "StreetName": BREWERY[0], "StreetNumber": BREWERY[1], "RentedByPlayer": True,
        "BusinessName": "HART. Brewery", "businessTypeName": "ba:businesstype_factory",
        "creationDay": OPENED, "RentPerDay": 110.0,
        "itemInstances": [
            _item("MACHINEone", "ba:itemname_bottlingmachine", priority=0, selectedRecipeId=BEER_RECIPE,
                  workstationType="ba:factoryworkstationtype_bottledgoodsworkstation"),
            _item("MACHINEtwo", "ba:itemname_bottlingmachine", priority=1, selectedRecipeId=BEER_RECIPE,
                  workstationType="ba:factoryworkstationtype_bottledgoodsworkstation",
                  produceUpTo=True, produceUpToValue=900),
            _shelf("PALLETbrewery", {WATER: 500, BEER: 900}),
        ],
        "scheduleDays": _week((0, 24), [_shift(8, 20, "EMPeli", "MACHINEone")]),
        "orderHistory": [], "retailPrices": [],
        "deliveryTransactions": brewery_log,
    }
    home = {"StreetName": HOME[0], "StreetNumber": HOME[1], "RentedByPlayer": True,
            "BusinessName": None, "businessTypeName": "ba:businesstype_empty", "RentPerDay": 45.0,
            "itemInstances": [], "scheduleDays": [], "orderHistory": [], "retailPrices": []}
    rival = {"StreetName": RIVAL[0], "StreetNumber": RIVAL[1], "RentedByPlayer": False,
             "BusinessName": "Corner Gifts", "businessTypeName": "ba:businesstype_giftshop",
             "creationDay": 12, "businessOwnerRivalId": RIVAL_ID, "buildingOwnerRivalId": RIVAL_ID,
             "itemInstances": [], "scheduleDays": [], "orderHistory": [],
             "retailPrices": [{"itemName": GIFT, "price": 11.0}, {"itemName": BEER, "price": 4.5}]}

    def person(pid, name, skills, where, hours, days, wage=18.0, **more):
        return {"id": pid, "characterData": {"name": name, "skills": [
                    {"name": s, "value": v} for s, v in skills]},
                "hourlyWage": wage, "assignedWeeklyHours": hours, "assignedWeeklyDays": list(days),
                "satisfaction": 80.0, "dayHired": OPENED, "assignedAddress": address(*where), **more}

    week = (1, 2, 3, 4, 5, 6, 7)
    employees = [
        person("EMPana", "Ana Silva", [(SERVICE, 70.0), (CLEANING, 30.0)], LIQUOR, 56, week,
               demands=["ba:jobdemand_freeweekends"], hasSendQuitWarning=True),
        person("EMPben", "Ben Ode", [(SERVICE, 55.0)], LIQUOR, 56, week),
        person("EMPcy", "Cy Moss", [(CLEANING, 60.0)], LIQUOR, 84, week, wage=14.0),
        person("EMPdee", "Dee Park", [(SERVICE, 65.0)], GIFTS, 70, week, satisfaction=55.0),
        person("EMPeli", "Eli Stone", [(FACTORY_WORKER, 50.0)], BREWERY, 84, week, wage=16.0,
               isAbsent=True),
    ]

    def demand(slug, values):
        return {"itemName": slug, "demandValues": [
            {"neighborhood": hood, "demand": v, "providers": p, "hasPlayerMonopoly": mono}
            for hood, (v, p, mono) in values.items()]}

    drift = (day - DAY) // 7  # each later week moves the market a little
    market = [
        demand(BEER, {MIDTOWN: (80 + 6 * drift, 2, False), LOWER: (55, 3, False),
                      INDUSTRY: (30, 1, False), HELLS: (62 - 8 * drift, 0, False),
                      "ba:neighborhood_global": (60, 9, False)}),
        demand(GIFT, {MIDTOWN: (45, 2, False), LOWER: (70 - 10 * drift, 1, True),
                      INDUSTRY: (20, 0, False), HELLS: (58, 1, False)}),
        demand(UMBRELLA, {MIDTOWN: (35, 4, False), LOWER: (40, 1, False),
                          INDUSTRY: (15, 0, False), HELLS: (25, 2, False)}),
        demand(SODA, {MIDTOWN: (50, 5, False), LOWER: (66 + 5 * drift, 2, False),
                      INDUSTRY: (40, 1, False), HELLS: (30, 1, False)}),
    ]

    root = {
        "Day": day, "Hour": 14, "Minute": 30, "Money": 25000.0 + 80.0 * (day - DAY),
        "SaveGameName": "Payload Co", "characterId": CHARACTER, "buildNumberAtLastSave": 3671 if day <= DAY else 3682,
        "Happiness": 60.0,
        "gameVariables": {"daysPerYear": 60, "difficulty": 2, "startingMoney": 10000.0,
                          "marketPriceMultiplier": 0.7, "employeeHourlySalaryMultiplier": 0.9,
                          "rivalsDifficultyMultiplier": 1.0, "taxPercentage": 5.0,
                          "baseCustomerPromotionMultiplier": 0.55},
        "BuildingRegistrations": [liquor, gifts, hub, brewery, home, rival],
        "EmployeeInstances": employees,
        "employeePresets": [{"id": PRESET, "name": "Black"}],
        "financialSummaries": [_summary(d) for d in past],
        "Loans": [{"bankAddress": address(*BANK), "totalAmount": 50000.0,
                   "remainingAmount": 32000.0 - LOAN_PAYMENT * (day - DAY),
                   "dailyPayment": LOAN_PAYMENT, "dailyInterest": 40.0}],
        "logisticsManagerPlans": [
            {"targetAddress": address(*HUB), "destinations": [
                {"deliveryTargetAddress": address(*BREWERY),
                 "stockTargets": [{"itemName": WATER, "targetAmount": 800}]}]},
            {"targetAddress": address(*BREWERY), "isFactory": True, "destinations": [
                {"deliveryTargetAddress": address(*LIQUOR),
                 "stockTargets": [{"itemName": BEER, "targetAmount": 600}]}]},
        ],
        "importPartnerships": [
            {"id": "IMPORTwater", "importAddress": address(*PIER),
             "nextDeliveryDay": day + ((8 - day % 7) % 7 or 7), "isActive": True,
             "isRepeatingOrder": True, "isTarget": False,
             "products": [{"itemName": WATER, "amount": 3000, "amountOrderedLastWeek": 3000,
                           "assignedWarehouse": address(*HUB)}]},
        ],
        "DeliveryContracts": [
            {"enabled": True, "isUrgentOrder": False, "repeatingOrder": True,
             "nextDeliveryDay": day + 3, "wholesaleAddress": address("ba:street_eighthavenue", 10),
             "businessAddress": address(*GIFTS),
             "items": [{"itemName": GIFT, "amount": 450, "amountOrderedLastWeek": 450,
                        "amountOrderedThisWeek": 0}]},
        ],
        "marketEvents": [
            # A hype wave on beer in Midtown, five days old on DAY, still on a week later.
            {"type": 2, "itemName": BEER, "neighbourhood": MIDTOWN, "startDay": WAVE[0],
             "durationInDays": WAVE[1] - WAVE[0], "stopped": False},
            # An umbrella shortage in Lower Manhattan, running on both days.
            {"type": 3, "itemName": UMBRELLA, "neighbourhood": LOWER, "startDay": DAY - 1,
             "durationInDays": 14, "stopped": False},
            # The rival's opening announcement, which names the company.
            {"type": 0, "rivalName": "Corner Holdings", "businessName": "Corner Gifts",
             "address": address(*RIVAL), "startDay": 12, "durationInDays": 1},
        ],
        "productMarketEntries": market,
        "rivalStates": [{"rivalId": RIVAL_ID}],
        "specialRivalStates": [{"rivalId": "yXNH9hTIv0KhI5OI8be0A==", "isDefeated": False,
                                "sentMessageKeys": []}],
        "realEstate": [{"address": address(*LIQUOR), "purchaseDay": 20, "purchasePrice": 250000.0}],
        "buildingsForSale": [{"address": address(*FOR_SALE), "buildingPrice": 410000.0}],
        "achievementsData": {"goodsProducedInFactories": 1200 * (day - OPENED), "taxesPaid": 5200.0},
        "PlayerDiplomas": [{"completed": True}, {"completed": False}],
        "completedPersonalGoals": ["GOALfirstshop"],
        "playerWeeklyIncomeHistory": [{"m_Item1": d, "m_Item2": 9000.0 + 100 * d}
                                      for d in range(7, day, 7)],
        "playerNumberOfBusinessesHistory": [{"m_Item1": d, "m_Item2": 4} for d in range(7, day, 7)],
    }
    # Build 3672 dropped NetWorth from the save. DAY is saved on build 3671 and
    # still carries it; a later day is saved after the upgrade to 3682 and does
    # not, so the second run reads the carried-forward figure.
    if day <= DAY:
        root["NetWorth"] = 480000.0
    return root


def write_data_save(path: str, day: int = DAY) -> None:
    """data_company(day) as a gzipped ES3 .hsg at `path`."""
    with open(path, "wb") as fh:
        fh.write(encode(data_company(day)))


if __name__ == "__main__":
    write_data_save(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else DAY)
