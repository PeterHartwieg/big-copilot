"""Plans, contracts and importer names from a synthetic ES3 company."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

import ba_dashboard as dashboard
from ba_save import Names, load_save
from tests.es3_fixture import address, encode
from tests import save_fixtures as fixture


SECOND_WAREHOUSE = ("ba:street_pier", 9)
LOGISTICS = "ba:skill_logisticsmanager"
PURCHASING = "ba:skill_purchasingagent"
FREIGHT = "ba:vehicletype_freighttruckt1"
DELIVERY = "ba:vehicletype_deliverytruck"
# Independent expectations: changing the production table must change a test.
IMPORTERS = {
    1: ("jetcargo", "Jet Cargo Imports"),
    2: ("seaside", "Seaside Internationals"),
    3: ("unitedocean", "United Ocean Import"),
    4: ("bluestone", "Bluestone Imports"),
    6: ("lunartide", "Lunar Tide Shipments"),
    7: ("maritimefreight", "Maritime Freight Line"),
    8: ("aquaticbay", "Aquatic Bay Cargo"),
    9: ("globalharvest", "Global Harvest Traders"),
}


def supply_company():
    """A warehouse round, a factory round and contracts with missing assignments."""
    root = copy.deepcopy(fixture.data_company())

    def employee(pid, name, skill, level, **extra):
        return {"id": pid, "characterData": {"name": name, "skills": [
            {"name": fixture.CLEANING, "value": 20.0},
            {"name": skill, "value": level}]}, **extra}

    root["EmployeeInstances"].extend([
        employee("manager-wh", "Wendy West", LOGISTICS, 81.6),
        employee("manager-factory", "Faye Fields", LOGISTICS, 73.2),
        employee("manager-idle", "Mina Moss", LOGISTICS, 68.0),
        # Being replaced: the save still shows her on her plan.
        employee("manager-nullplan", "Nell Null", LOGISTICS, 70.0, isBeingReplaced=True),
        employee("driver", "Drew Dale", "ba:skill_driver", 90.0),
        employee("agent", "Ari Ash", PURCHASING, 86.2),
        employee("agent-idle", "Iris Ivy", PURCHASING, 64.0),
        employee("agent-replaced", "Rae Reed", PURCHASING, 99.0,
                 isBeingReplaced=True),
    ])
    hub = next(b for b in root["BuildingRegistrations"]
               if (b["StreetName"], b["StreetNumber"]) == fixture.HUB)
    hub["vehicleSlots"] = [
        {"vehicleInstanceId": "truck-driven", "employeeDriverId": "driver"},
        {"vehicleInstanceId": "truck-undriven", "employeeDriverId": None},
    ]
    root["VehicleInstances"] = [
        {"id": "truck-driven", "vehicleTypeName": FREIGHT},
        {"id": "truck-undriven", "vehicleTypeName": DELIVERY},
    ]
    warehouse = copy.deepcopy(hub)
    warehouse.update(StreetName=SECOND_WAREHOUSE[0], StreetNumber=SECOND_WAREHOUSE[1],
                     BusinessName="Second warehouse", vehicleSlots=[], deliveryTransactions=[])
    warehouse["itemInstances"] = [{"$k": "second-shelf", "$v": {
        "id": "second-shelf", "itemName": "ba:itemname_shelf", "cargoInstances": [
            {"itemName": fixture.WATER, "amount": 17},
            {"itemName": fixture.BEER, "amount": 8}]}}]
    root["BuildingRegistrations"].append(warehouse)

    def destination(where, targets):
        return {"deliveryTargetAddress": address(*where), "stockTargets": [
            {"itemName": slug, "targetAmount": amount} for slug, amount in targets]}

    # Both ids and targets deliberately run opposite to alphabetical order.
    root["logisticsManagerPlans"] = [
        {"id": "z-warehouse-plan", "assignedEmployeeId": "manager-wh", "isFactory": False,
         "targetAddress": address(*fixture.HUB), "destinations": [
             destination(fixture.GIFTS, [(fixture.UMBRELLA, 91), (fixture.GIFT, 230)]),
             destination(SECOND_WAREHOUSE, [(fixture.WATER, 45)]),
             destination(fixture.LIQUOR, []),
             destination(fixture.BREWERY, [(fixture.WATER, 1200)])]},
        {"id": "a-factory-plan", "assignedEmployeeId": "manager-factory", "isFactory": True,
         "targetAddress": address(*fixture.BREWERY), "destinations": [
             destination(fixture.HUB, [(fixture.BEER, 700)]),
             destination(("ba:street_pier", 3), [(fixture.BEER, 120)])]},
        # A plan the game holds with no pick-up site and no stop (a real save has one).
        {"id": "m-null-plan", "assignedEmployeeId": "manager-nullplan", "isFactory": False,
         "targetAddress": None, "destinations": []},
        # ...and one with nobody on it either: nothing to show.
        {"id": "ghost-plan", "assignedEmployeeId": None, "isFactory": False,
         "targetAddress": None, "destinations": []},
    ]

    def contract(cid, agent, pier, products, **flags):
        return {"id": cid, "employeeInstanceId": agent,
                "importAddress": address("ba:street_pier", pier),
                "nextDeliveryDay": fixture.DAY + 3, "isTarget": False,
                "isRepeatingOrder": True, "isActive": True, "isUrgentOrder": False,
                "products": [{"itemName": slug, "amount": amount,
                              "amountOrderedLastWeek": last,
                              "assignedWarehouse": address(*where) if where else None}
                             for slug, amount, last, where in products], **flags}

    root["importPartnerships"] = [
        contract("z-no-agent", "missing-agent", 3, [
            (fixture.WATER, 3000, 2500, fixture.HUB),
            (fixture.UMBRELLA, 12, 7, None)], isTarget=True, isUrgentOrder=True),
        contract("m-paused", "agent", 1, [(fixture.WATER, 150, 120, fixture.HUB)],
                 isActive=False),
        contract("a-replaced", "agent-replaced", 2, [(fixture.WATER, 200, 100, fixture.HUB)]),
    ]
    return root


class SupplyRoles(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.tmp.cleanup)
        cls.path = Path(cls.tmp.name, "supply.hsg")
        cls.path.write_bytes(encode(supply_company()))
        cls.names = Names(fixture.data_names())
        cls.save = load_save(str(cls.path))
        cls.payload = dashboard.extract(cls.save, cls.names, None)
        cls.roles = cls.payload["supply"]["roles"]

    def test_plans_destinations_and_targets_keep_game_order(self):
        """Raw plans retain empty stops and target order instead of sorting or merging."""
        plans = [r for r in self.roles["managers"] if "plan" in r and not r.get("idle")]
        self.assertEqual([r["plan"] for r in plans], ["z-warehouse-plan", "a-factory-plan"])
        self.assertEqual([(r["who"], r["id"], r["skill"], r["factory"]) for r in plans], [
            ("Wendy West", "manager-wh", 82, False),
            ("Faye Fields", "manager-factory", 73, True)])
        stops = plans[0]["dests"]
        self.assertEqual([r["key"] for r in stops], [dashboard.site_key(a) for a in (
            fixture.GIFTS, SECOND_WAREHOUSE, fixture.LIQUOR, fixture.BREWERY)])
        self.assertEqual([r["kind"] for r in stops], ["shop", "wh", "shop", "fac"])
        self.assertEqual([(r["slug"], r["amount"]) for r in stops[0]["targets"]],
                         [(fixture.UMBRELLA, 91), (fixture.GIFT, 230)])
        self.assertEqual([r["item"] for r in stops[0]["targets"]], ["Umbrella", "Gift (Cheap)"])
        self.assertEqual(stops[2]["targets"], [])
        for plan, source in zip(plans, (fixture.HUB, fixture.BREWERY)):
            self.assertEqual(plan["key"], dashboard.site_key(source))
            self.assertEqual(self.payload["businesses"][plan["s"]]["key"], plan["key"])
        for stop in stops:
            self.assertEqual(self.payload["businesses"][stop["s"]]["key"], stop["key"])

    def test_factory_export_names_the_importer_and_keeps_the_pier(self):
        """An export stop names its importer while retaining the physical pier address."""
        factory = next(r for r in self.roles["managers"] if r.get("factory") and "plan" in r)
        warehouse, pier = factory["dests"]
        self.assertEqual((warehouse["kind"], warehouse["key"]), ("wh", dashboard.site_key(fixture.HUB)))
        self.assertEqual((pier["kind"], pier["key"], pier["s"], pier["pier"]),
                         ("pier", "ba:street_pier#3", None, "3 Pier"))
        self.assertEqual(dashboard.plain(pier["name"]), "United Ocean Import")
        self.assertEqual(pier["name"], dashboard.tok("ba:importertypename_unitedocean", "United Ocean Import"))
        self.assertEqual([(r["slug"], r["amount"]) for r in pier["targets"]], [(fixture.BEER, 120)])

    def test_only_driven_vehicles_add_to_twice_the_destination_reach(self):
        """A parked vehicle without a driver contributes zero to the plan's reach."""
        plan = self.roles["managers"][0]
        self.assertEqual([(v["type"], v["driver"], v["reach"]) for v in plan["vehicles"]],
                         [(FREIGHT, "Drew Dale", 4), (DELIVERY, None, 0)])
        self.assertEqual(plan["reach"], 2 * dashboard.VEHICLE_DESTINATIONS[FREIGHT])
        self.assertEqual(plan["reach"], 8)
        self.assertEqual([v["name"] for v in plan["vehicles"]],
                         [self.names.label(FREIGHT), self.names.label(DELIVERY)])

    def test_stocked_destination_warehouse_still_needs_its_own_plan(self):
        """Receiving goods does not replace a warehouse's missing outbound plan."""
        gaps = [r for r in self.roles["managers"] if r.get("gap") == "warehouse"]
        self.assertEqual(len(gaps), 1)
        gap = gaps[0]
        self.assertEqual((gap["key"], gap["holds"], gap["factory"]),
                         (dashboard.site_key(SECOND_WAREHOUSE), 25, False))
        self.assertEqual(self.payload["businesses"][gap["s"]]["key"], gap["key"])
        self.assertEqual((gap["who"], gap["id"], gap["skill"]), (None, None, None))

    def test_factory_gap_requires_another_site_to_hold_its_product(self):
        """An unplanned factory needs delivery only for products another site holds."""
        # Hand-built extraction inputs isolate the gap rule from machinery and recipes.
        businesses = [
            {"key": "ba:street_eighthavenue#12", "name": "Unplanned factory",
             "typeSlug": "ba:businesstype_factory", "lines": [
                 {"slug": fixture.BEER, "units": 100}, {"slug": fixture.SODA, "units": 50}]},
            {"key": "ba:street_secondavenue#10", "name": "Product holder",
             "typeSlug": "ba:businesstype_giftshop", "lines": [
                 {"slug": fixture.BEER, "units": 20}, {"slug": fixture.UMBRELLA, "units": 3}]},
        ]
        factories = {"sites": [{"s": 0, "lines": [
            {"slug": fixture.SODA}, {"slug": fixture.BEER}, {"slug": fixture.UMBRELLA}]}]}
        roles = dashboard._supply_roles(self.save, self.names, businesses, factories)
        gaps = [r for r in roles["managers"] if r.get("gap") == "factory"]
        self.assertEqual(gaps, [{"who": None, "id": None, "skill": None, "s": 0,
                                 "key": businesses[0]["key"], "factory": True,
                                 "gap": "factory", "needed": [fixture.BEER, fixture.UMBRELLA]}])
        businesses[1]["lines"] = []
        roles = dashboard._supply_roles(self.save, self.names, businesses, factories)
        self.assertFalse(any(r.get("gap") == "factory" for r in roles["managers"]))

    def test_unassigned_role_holders_are_idle(self):
        """Role holders without a plan or contract appear once, after assigned rows."""
        self.assertEqual([r for r in self.roles["managers"] if r.get("idle")], [
            {"plan": "m-null-plan", "who": "Nell Null", "id": "manager-nullplan", "skill": 70, "idle": True},
            {"who": "Mina Moss", "id": "manager-idle", "skill": 68, "idle": True}])
        self.assertEqual([r for r in self.roles["agents"] if r.get("idle")], [
            {"who": "Iris Ivy", "id": "agent-idle", "skill": 64, "idle": True}])
        self.assertTrue(self.roles["managers"][-1]["idle"])
        self.assertTrue(self.roles["agents"][-1]["idle"])

    def test_contracts_keep_order_flags_and_products_without_a_warehouse(self):
        """Paused repeating orders and products lacking a warehouse remain reviewable."""
        contracts = [r for r in self.roles["agents"] if "contract" in r]
        self.assertEqual([r["contract"] for r in contracts], ["z-no-agent", "m-paused", "a-replaced"])
        self.assertEqual([(r["smart"], r["repeating"], r["urgent"], r["active"], r["next"])
                          for r in contracts], [
                              (True, True, True, True, fixture.DAY + 3),
                              (False, True, False, False, fixture.DAY + 3),
                              (False, True, False, True, fixture.DAY + 3)])
        self.assertEqual((contracts[1]["who"], contracts[1]["id"], contracts[1]["skill"]),
                         ("Ari Ash", "agent", 86))
        water, unassigned = contracts[0]["products"]
        self.assertEqual((water["slug"], water["amount"], water["last"], water["key"]),
                         (fixture.WATER, 3000, 2500, dashboard.site_key(fixture.HUB)))
        self.assertEqual(self.payload["businesses"][water["s"]]["key"], water["key"])
        self.assertEqual(unassigned, {"slug": fixture.UMBRELLA, "item": "Umbrella",
                                      "amount": 12, "last": 7, "s": None, "key": None, "where": None})
        self.assertEqual(water["where"], "4 Eighth Avenue")
        self.assertEqual((contracts[0]["importerKey"], contracts[0]["pier"], contracts[0]["pierKey"]),
                         ("ba:importertypename_unitedocean", "3 Pier", "ba:street_pier#3"))

    def test_a_plan_with_no_pick_up_site_and_no_stop_is_a_manager_with_no_plan(self):
        """Its manager lands under No plan, keeping the plan's id; being replaced
        does not unassign a manager (the game's "not assigned" is an agent's)."""
        row = next(r for r in self.roles["managers"] if r.get("plan") == "m-null-plan")
        self.assertTrue(row["idle"])
        self.assertNotIn("dests", row)
        self.assertEqual(row["who"], "Nell Null")
        self.assertEqual(sum(1 for r in self.roles["managers"] if r.get("id") == "manager-nullplan"), 1,
                         "listed once: not again as a manager on no plan")
        self.assertFalse(any(r.get("plan") == "ghost-plan" for r in self.roles["managers"]),
                         "a plan with no site, no stop and no manager is not shown")
        hub = next(r for r in self.roles["managers"] if r.get("plan") == "z-warehouse-plan")
        self.assertEqual(hub["where"], "4 Eighth Avenue")

    def test_missing_and_replaced_agents_have_no_assignment(self):
        """A missing or being-replaced agent clears all three person fields."""
        for cid in ("z-no-agent", "a-replaced"):
            with self.subTest(contract=cid):
                row = next(r for r in self.roles["agents"] if r.get("contract") == cid)
                self.assertEqual((row["who"], row["id"], row["skill"]), (None, None, None))

    def test_goods_flow_and_import_contracts_use_importer_names(self):
        """Goods flow import nodes and per-line contracts name businesses at the piers."""
        expected = {"z-no-agent": "United Ocean Import", "m-paused": "Jet Cargo Imports",
                    "a-replaced": "Seaside Internationals"}
        seen = set()
        for line in self.payload["supply"]["imports"]:
            for contract in line["contracts"]:
                seen.add(contract["id"])
                self.assertEqual(dashboard.plain(contract["importer"]), expected[contract["id"]])
        self.assertEqual(seen, set(expected))
        nodes = [n for n in self.payload["supply"]["graph"]["nodes"] if n["kind"] == "import"]
        self.assertEqual({n["id"]: dashboard.plain(n["name"]) for n in nodes}, {
            "import:ba:street_pier#1": "Jet Cargo Imports",
            "import:ba:street_pier#2": "Seaside Internationals",
            "import:ba:street_pier#3": "United Ocean Import"})

    def test_payload_is_json_serialisable_and_repeatable(self):
        """Two fresh extractions produce the same payload apart from wall-clock metadata."""
        again = dashboard.extract(load_save(str(self.path)), Names(fixture.data_names()), None)
        first = copy.deepcopy(self.payload)
        for payload in (first, again):
            for field in ("generated", "saved"):
                if field in payload["meta"]:
                    payload["meta"][field] = "<wall clock>"
        # Preserve dictionary and list order in the comparison too.
        self.assertEqual(json.dumps(first, ensure_ascii=False), json.dumps(again, ensure_ascii=False))
        self.assertEqual(json.loads(json.dumps(first))["supply"]["roles"], self.roles)


class ImporterNames(unittest.TestCase):
    def test_every_importer_pier_has_a_name_token_and_key(self):
        """Piers 1–9 name their importers except the casino at pier 5."""
        names = Names(fixture.data_names())
        self.assertEqual(dashboard.IMPORTERS, IMPORTERS)
        for pier in range(1, 10):
            with self.subTest(pier=pier):
                where = ("ba:street_pier", pier)
                label = dashboard._importer_name(names, where)
                if pier == 5:
                    self.assertIsNone(dashboard.importer_key(where))
                    self.assertEqual(label, "5 Pier")
                else:
                    ident, english = IMPORTERS[pier]
                    key = "ba:importertypename_" + ident
                    self.assertEqual(dashboard.importer_key(where), key)
                    self.assertEqual(label, dashboard.tok(key, english))
                    self.assertEqual(dashboard.plain(label), english)

    def test_non_importer_addresses_fall_back_to_the_address(self):
        """A street number alone does not identify an importer."""
        names = Names(fixture.data_names())
        for where in (fixture.HUB, ("ba:street_pier", 10), None):
            with self.subTest(address=where):
                self.assertIsNone(dashboard.importer_key(where))
                self.assertEqual(dashboard._importer_name(names, where), names.addr(where))

    def test_locale_importer_wording_overrides_the_english_fallback(self):
        """Importer names read the game's unprefixed locale key into a payload token."""
        names = Names({"importertypename_jetcargo": "Jet Cargo lokal"})
        self.assertEqual(dashboard._importer_name(names, ("ba:street_pier", 1)),
                         dashboard.tok("ba:importertypename_jetcargo", "Jet Cargo lokal"))
        for locale in ({}, fixture.data_names(), names.locale):
            with self.subTest(locale=locale):
                table = dashboard._game_names(Names(locale))
                for ident, english in IMPORTERS.values():
                    self.assertEqual(table["ba:importertypename_" + ident],
                                     locale.get("importertypename_" + ident, english))

    def test_name_tables_and_coverage_include_importer_locale_keys(self):
        """Importer translations use ba: keys, omit equal wording, and count in coverage."""
        english = {"importertypename_jetcargo": "Jet Cargo Imports",
                   "importertypename_seaside": "Seaside Internationals",
                   "ba:itemname_water": "Water", "common_ok": "OK",
                   "help_importer_content": "A description."}
        other = {"importertypename_jetcargo": "Jet Cargo lokal",
                 "importertypename_seaside": "Seaside Internationals",
                 "ba:itemname_water": "  ", "common_ok": "OK"}
        self.assertEqual(dashboard._name_text(english), {
            "ba:importertypename_jetcargo": "Jet Cargo Imports",
            "ba:importertypename_seaside": "Seaside Internationals",
            "ba:itemname_water": "Water"})
        self.assertEqual(dashboard.name_table(english, other), {
            "ba:importertypename_jetcargo": "Jet Cargo lokal"})
        self.assertAlmostEqual(dashboard.name_coverage(english, other), 2 / 3)
        self.assertEqual(dashboard.name_coverage(english, {}), 0.0)


if __name__ == "__main__":
    unittest.main()
