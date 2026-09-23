"""The by-type market grid: every type ranked on its average demand, offices as a band."""
import unittest
from unittest.mock import patch

from ba_dashboard import History, _market, _type_catalogue
from ba_save import Names, Save

FEE = "ba:itemname_hourlylawyerfee"
LAW = "ba:businesstype_lawfirm"
SHOP = "ba:businesstype_supermarket"
CINEMA = "ba:businesstype_cinema"
TICKET = "ba:itemname_cinematicket"
GOODS = ["ba:itemname_apple", "ba:itemname_bread", "ba:itemname_milk"]
NAMES = Names({
    "ba:neighborhood_midtown": "Midtown",
    "ba:neighborhood_hellskitchen": "Hell's Kitchen",
    "ba:neighborhood_industrycity": "Industry City",
    "ba:businesstype_lawfirm": "Law Firm",
    "ba:itemname_hourlylawyerfee": "Lawyer Fee (Hourly)",
})
POPCORN = "ba:itemname_popcorn"
# The two F1 help page shapes, as the game writes them: an office's one fee under
# "can sell", a cinema's ticket under "primarily sell" with extras after it.
HELP = {
    "help_ba:businesstype_lawfirm_content": (
        "**Law Firm** businesses operate out of office buildings. \n\n"
        "Customers are handled digitally and are not physically present in the buildings.\n\n"
        "Businesses of this type can sell:\n\n"
        "* [Lawyer Fee (Hourly)](fees-hourlylawyerfee)\n\n"
        "Employees with the following skills can be assigned:\n\n* [Lawyer](skill-lawyer)"),
    "help_ba:businesstype_cinema_content": (
        "**Cinema** businesses operate out of cinema buildings.\n\n"
        "Businesses of this type primarily sell:\n\n"
        "* [Cinema Ticket](products-cinematicket)\n\n"
        "And can additionally sell:\n\n"
        "* [Popcorn](products-popcorn)\n* [Soda Can](products-sodacan)\n\n"
        "Employees with the following skills can be assigned:\n\n* [Projectionist](skill-projectionist)"),
}
BUILDINGS = {
    ("s", 1): {"h": "Midtown", "t": "office"},
    ("s", 2): {"h": "Hell's Kitchen", "t": "office"},
    ("s", 3): {"h": "Industry City", "t": "retail"},
}


def reading(hood, demand, providers):
    return {"neighborhood": "ba:neighborhood_" + hood, "demand": demand,
            "providers": providers, "hasPlayerMonopoly": False}


def entry(item, readings):
    return {"itemName": item, "demandValues": {"$items": readings}}


def firm(status="office", hood="Hell's Kitchen"):
    return {"name": "HART. &Partners", "status": status, "typeSlug": LAW, "type": "Law Firm",
            "neighbourhood": hood, "opened": 1, "lines": [{"slug": FEE, "price": 288.9}]}


class MarketOfficeTests(unittest.TestCase):
    def market(self, businesses=(), buildings=BUILDINGS, help_pages=False):
        # The supermarket's range reads 70, 64 and 58 in Midtown.
        goods = [entry(item, [reading("midtown", demand, 3), reading("hellskitchen", 40, 4),
                              reading("industrycity", 50, 2)])
                 for item, demand in zip(GOODS, (70, 64, 58))]
        fee = entry(FEE, [reading("midtown", 66, 1), reading("hellskitchen", 33, 2)])
        ticket = entry(TICKET, [reading("midtown", 80, 1), reading("hellskitchen", 20, 2),
                                reading("industrycity", 35, 1)])
        popcorn = entry(POPCORN, [reading("midtown", 10, 5)])
        save = Save({"marketEvents": {"$items": []}, "logisticsManagerPlans": {"$items": []},
                     "BuildingRegistrations": {"$items": []},
                     "productMarketEntries": {"$items": goods + [fee, ticket, popcorn]}}, {}, "")
        with patch("ba_dashboard.load_buildings", return_value=buildings):
            if help_pages:  # the real catalogue, read from the stub help pages
                names = Names({**NAMES.locale, **HELP})
                return _market(save, names, list(businesses), 10, History(None), "test")
            catalogue = {LAW: {FEE}, SHOP: set(GOODS), CINEMA: {TICKET}}
            with patch("ba_dashboard._type_catalogue", return_value=catalogue):
                return _market(save, NAMES, list(businesses), 10, History(None), "test")

    def test_help_pages_supply_the_office_fee_and_only_the_primary_range(self):
        market = self.market(help_pages=True)
        self.assertEqual([o["fees"] for o in market["offices"]], [["Lawyer Fee (Hourly)"]])
        [cinema] = market["types"]
        self.assertEqual((cinema["slug"], cinema["products"]), (CINEMA, 1))
        # Popcorn is an extra ("can additionally sell"), so its 10 never drags
        # the cinema's Midtown reading down from the ticket's 80.
        self.assertEqual(dict(zip(market["hoods"], cinema["cells"]))["Midtown"]["demand"], 80)

    def test_every_shop_type_ranks_on_the_average_demand_of_its_range(self):
        market = self.market()
        # A one-product cinema is listed and reads its ticket's own demand; it
        # outranks the supermarket because its best neighbourhood reads higher.
        self.assertEqual([t["slug"] for t in market["types"]], [CINEMA, SHOP])
        self.assertNotIn("typesHidden", market)
        cinema, shop = (dict(zip(market["hoods"], t["cells"])) for t in market["types"])
        self.assertEqual((cinema["Midtown"]["demand"], cinema["Midtown"]["count"]), (80, 1))
        self.assertEqual(market["types"][0]["peak"], 80)
        # 70, 64 and 58 average 64, and that average is the whole reading: no
        # count of products over the 60 line travels with it.
        self.assertEqual((shop["Midtown"]["demand"], shop["Midtown"]["count"]), (64, 3))
        self.assertNotIn("strong", shop["Midtown"])
        self.assertEqual(market["types"][1]["peak"], 64)

    def test_offices_are_their_own_band_read_from_the_fee(self):
        market = self.market()
        self.assertNotIn(LAW, [t["slug"] for t in market["types"]])
        [office] = market["offices"]
        self.assertEqual((office["type"], office["fees"], office["mine"]),
                         ("Law Firm", ["Lawyer Fee (Hourly)"], False))
        by_hood = dict(zip(market["hoods"], office["cells"]))
        self.assertEqual((by_hood["Midtown"]["demand"], by_hood["Midtown"]["providers"]), (66, 1))
        self.assertEqual((by_hood["Hell's Kitchen"]["demand"], by_hood["Hell's Kitchen"]["providers"]), (33, 2))
        self.assertNotIn("strong", by_hood["Midtown"])
        self.assertIsNone(by_hood["Industry City"])
        self.assertEqual(market["noOffices"], ["Industry City"])
        fee_rows = {r["slug"]: r["office"] for r in market["rows"]}
        self.assertEqual((fee_rows[FEE], fee_rows[TICKET]), (True, False))

    def test_the_players_own_office_is_marked_and_sells_its_fee(self):
        market = self.market([firm()])
        [office] = market["offices"]
        by_hood = dict(zip(market["hoods"], office["cells"]))
        self.assertTrue(office["mine"])
        self.assertTrue(by_hood["Hell's Kitchen"]["here"])
        self.assertFalse(by_hood["Midtown"]["here"])
        [row] = [r for r in market["rows"] if r["slug"] == FEE]
        self.assertTrue(row["sell"])
        self.assertEqual([c["hood"] for c in row["cells"] if c and c["sell"]], ["Hell's Kitchen"])

    def test_a_vacant_lease_is_not_an_office(self):
        market = self.market([firm(status="vacant")])
        [row] = [r for r in market["rows"] if r["slug"] == FEE]
        self.assertFalse(row["sell"])
        self.assertFalse(any(c and c["here"] for c in market["offices"][0]["cells"]))

    def test_only_types_the_help_lists_rank_even_when_the_city_sells_more(self):
        # Two city-owned gas stations stock the supermarket's goods; nobody can
        # open one, so it has no help page and never ranks as a type to open.
        station = {"businessTypeName": "ba:businesstype_gasstation",
                   "retailPrices": {"$items": [{"itemName": item} for item in GOODS]}}
        goods = [entry(item, [reading("midtown", 70, 1)]) for item in GOODS]
        ticket = entry(TICKET, [reading("midtown", 80, 1)])
        save = Save({"marketEvents": {"$items": []}, "logisticsManagerPlans": {"$items": []},
                     "BuildingRegistrations": {"$items": [station, dict(station)]},
                     "productMarketEntries": {"$items": goods + [ticket]}}, {}, "")
        names = Names({**NAMES.locale, **HELP})
        # Nobody in this city runs a law firm or a cinema; both are still listed.
        self.assertEqual(_type_catalogue(names, set(GOODS) | {FEE, TICKET}),
                         {LAW: {FEE}, CINEMA: {TICKET}})
        with patch("ba_dashboard.load_buildings", return_value=BUILDINGS):
            market = _market(save, names, [], 10, History(None), "test")
        self.assertEqual([t["slug"] for t in market["types"]], [CINEMA])

    def test_without_the_building_table_no_neighbourhood_is_called_office_free(self):
        self.assertEqual(self.market(buildings={})["noOffices"], [])


if __name__ == "__main__":
    unittest.main()
