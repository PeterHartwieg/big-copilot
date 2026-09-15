"""Premises: every building in the city, its status, estimated rent and door cap."""
import unittest
from unittest.mock import patch

from ba_dashboard import (
    DEPOSIT_FACTORS,
    FALLBACK_CAPS,
    _deposit_estimate,
    _door_caps,
    _premises,
    _premises_demand,
    _rent_estimate,
)
from ba_save import Names, Save

LAW = "ba:businesstype_lawfirm"
SHOP = "ba:businesstype_supermarket"
CINEMA = "ba:businesstype_cinema"
THEATER = "ba:businesstype_theater"
EMPTY = "ba:businesstype_empty"

NAMES = Names({
    "ba:street_fifthavenue": "Fifth Avenue",
    "ba:street_secondavenue": "Second Avenue",
    "ba:businesstype_supermarket": "Supermarket",
    "ba:businesstype_lawfirm": "Law Firm",
})

# The game's own help page, as build 3675 writes it (trimmed to the sections
# the door-cap table reads, plus the two it must ignore).
CAPS_HELP = """Each building has a code that indicates its layout, size, and customer/vehicle capacity.

**Retail**
* **A1**: 75m (807ft) / 15 customer capacity
* **A2**: 75m (807ft) / 15 customer capacity
* **C1**: 225m (2,422ft) / 30 customer capacity
* **C2**: 225m (2,422ft) / 30 customer capacity
* **D2**: 285m (3,068ft) / 40 customer capacity
* **M1**: 1000m (10,764ft) / 75 customer capacity

**Office**
* **A3**: 75m (807ft) / 4 customer capacity
* **C1**: 225m (2,422ft) / 8 customer capacity
* **C2**: 225m (2,422ft) / 8 customer capacity
* **D2**: 285m (3,068ft) / 10 customer capacity
* **J1**: 285m (3,068ft) / 10 customer capacity
* **K1**: 660m (7,104ft) / 50 customer capacity

**Cinema**
* **S1**: 2,000m (21,528ft) / 150 customer capacity
* **S2**: 2,000m (21,528ft) / 125 customer capacity
* **S3**: 2,000m (21,528ft) / 100 customer capacity

**Theater**
* **R1**: 2,000m (21,528ft) / 200 customer capacity
* **R2**: 2,000m (21,528ft) / 175 customer capacity
* **R3**: 2,000m (21,528ft) / 150 customer capacity

**Warehouse / Factory**
* **H1**: 690m (7,427ft) / 1 vehicle capacity
* **I1**: 1,292m (13,907ft) / 2 vehicle capacity

**Residential**
* **B1**: 54m (581ft)
"""

# Three leases whose rent the game itself billed, one per rate the formula uses,
# plus the building classes that are never scored.
HK_SHOP = ("ba:street_secondavenue", 2)
MT_SHOP = ("ba:street_fifthavenue", 8)
LM_OFFICE = ("ba:street_fifthavenue", 12)
FLAT = ("ba:street_fifthavenue", 72)
DEPOT = ("ba:street_fifthavenue", 90)
PIER = ("ba:street_fifthavenue", 99)
CLOSED_SHOP = ("ba:street_fifthavenue", 14)

BUILDINGS = {
    HK_SHOP: {"s": HK_SHOP[0], "n": 2, "h": "Hell's Kitchen", "t": "retail",
              "z": "C", "m": 225, "x": 50},
    MT_SHOP: {"s": MT_SHOP[0], "n": 8, "h": "Midtown", "t": "retail",
              "z": "M", "m": 1000, "x": 47},
    LM_OFFICE: {"s": LM_OFFICE[0], "n": 12, "h": "Lower Manhattan", "t": "office",
                "z": "K", "m": 660, "x": 37},
    FLAT: {"s": FLAT[0], "n": 72, "h": "Lower Manhattan", "t": "residential",
           "z": "B", "m": 54, "x": 21},
    DEPOT: {"s": DEPOT[0], "n": 90, "h": "Industry City", "t": "warehouse",
            "z": "H", "m": 690, "x": 14},
    PIER: {"s": PIER[0], "n": 99, "h": "Midtown", "t": "special",
           "z": "O", "m": 500, "x": 60},
    CLOSED_SHOP: {"s": CLOSED_SHOP[0], "n": 14, "h": "Midtown", "t": "retail",
                  "z": "A", "m": 75, "x": 30},
}


def reg(addr, **kw):
    row = {
        "StreetName": addr[0],
        "StreetNumber": addr[1],
        "AvailableForRent": False,
        "RentedByPlayer": False,
        "RentPerDay": 0.0,
        "BusinessName": None,
        "businessTypeName": EMPTY,
        # The game writes an empty owner for its own services and a rival's id
        # for a company somebody runs.
        "businessOwnerRivalId": "",
        # A landlord owns a building you can rent; nobody owns one that is only
        # for sale.
        "buildingOwnerRivalId": "landlord-1",
    }
    row.update(kw)
    return row


def sale(addr, price, m2=225):
    return {"address": {"streetName": addr[0], "streetNumber": addr[1]},
            "buildingPrice": price, "squareMeters": m2, "acceptOfferRate": 0.5}


def band(slug, label, cells):
    return {"slug": slug, "type": label, "cells": cells}


def cell(demand, providers, here=False):
    return {"demand": demand, "providers": providers, "here": here}


def paid(addr, amount, kind="ba:transaction_deposit"):
    return {"transactionType": kind, "amount": -amount,
            "address": {"streetName": addr[0], "streetNumber": addr[1]},
            "timestamp": {"Day": 3, "Hour": 8, "Minute": 30.0}}


def premises(registrations=(), for_sale=(), market=None, names=NAMES,
             buildings=BUILDINGS, transactions=()):
    save = Save({"BuildingRegistrations": {"$items": list(registrations)},
                 "buildingsForSale": {"$items": list(for_sale)},
                 "Transactions": {"$items": list(transactions)}}, {}, "")
    with patch("ba_dashboard.load_buildings", return_value=buildings):
        return _premises(save, names, market or {})


class RentTests(unittest.TestCase):
    def test_the_formula_reproduces_three_billed_leases(self):
        # m2 x (30 + traffic) x district rate, offices x 1.033.
        self.assertEqual(_rent_estimate(BUILDINGS[HK_SHOP]), 264)
        self.assertEqual(_rent_estimate(BUILDINGS[MT_SHOP]), 1911)
        self.assertEqual(_rent_estimate(BUILDINGS[LM_OFFICE]), 284)

    def test_residential_rent_is_never_estimated(self):
        self.assertIsNone(_rent_estimate(BUILDINGS[FLAT]))

    def test_an_unknown_neighbourhood_has_no_rate(self):
        self.assertIsNone(_rent_estimate({"h": "Queens", "t": "retail", "m": 100, "x": 40}))

    def test_the_check_reports_the_worst_deviation_of_the_players_own_leases(self):
        payload = premises([
            reg(HK_SHOP, RentedByPlayer=True, RentPerDay=264.0,
                BusinessName="[HK] Costy", businessTypeName=SHOP),
            reg(LM_OFFICE, RentedByPlayer=True, RentPerDay=280.0,
                BusinessName="[LM] HART.", businessTypeName=LAW),
            # A flat is billed too, and is left out of the fit entirely.
            reg(FLAT, RentedByPlayer=True, RentPerDay=37.0),
            # So is a rival's lease: the check is about what the player pays.
            reg(MT_SHOP, RentPerDay=1900.0, BusinessName="Rival", businessTypeName=SHOP),
        ])
        self.assertEqual(payload["rent"]["check"]["leases"], 2)
        self.assertEqual(payload["rent"]["check"]["worst"], round(4 / 280, 4))
        self.assertEqual(payload["rent"]["constant"], 30)
        self.assertEqual(payload["rent"]["officeFactor"], 1.033)
        self.assertEqual(payload["rent"]["rates"]["Midtown"], 0.02482)

    def test_no_leases_is_a_zero_check_not_a_missing_one(self):
        self.assertEqual(premises([reg(HK_SHOP, AvailableForRent=True)])["rent"]["check"],
                         {"leases": 0, "worst": 0})


class DepositTests(unittest.TestCase):
    def test_the_multiplier_is_the_one_for_the_buildings_class(self):
        # A shop, an office, a cinema and a theater share the lease multiplier;
        # a warehouse asks for half as much again.
        self.assertEqual(DEPOSIT_FACTORS["lease"], 62.84)
        self.assertEqual(DEPOSIT_FACTORS["warehouse"], 93.61)
        self.assertEqual(_deposit_estimate(BUILDINGS[HK_SHOP], 264), 16590)
        self.assertEqual(_deposit_estimate(BUILDINGS[LM_OFFICE], 284), 17850)
        self.assertEqual(_deposit_estimate(BUILDINGS[DEPOT], 172), 16100)

    def test_the_estimate_lands_on_a_round_ten(self):
        for rent in range(80, 130):
            self.assertEqual(_deposit_estimate(BUILDINGS[HK_SHOP], rent) % 10, 0)
        # 101 x 62.84 is 6346.84, which rounds to 6350, not down to 6340.
        self.assertEqual(_deposit_estimate(BUILDINGS[HK_SHOP], 101), 6350)

    def test_a_home_has_no_deposit_because_it_has_no_rent(self):
        self.assertIsNone(_deposit_estimate(BUILDINGS[FLAT], None))
        rows = {b["key"]: b for b in premises([
            reg(FLAT, RentedByPlayer=True, RentPerDay=37.0),
            reg(HK_SHOP, AvailableForRent=True),
        ])["buildings"]}
        self.assertIsNone(rows["ba:street_fifthavenue#72"]["deposit"])
        self.assertEqual(rows["ba:street_secondavenue#2"]["deposit"], 16590)

    def test_the_check_reads_the_deposits_this_character_has_paid(self):
        payload = premises(transactions=[
            paid(HK_SHOP, 16590.0),
            # 4.3% over the estimate, and the worst of the two.
            paid(HK_SHOP, 17340.0),
            # About 1600x the rent: a building purchase, not a lease.
            paid(MT_SHOP, 4_250_000.0),
            # A small deposit for something that is not a lease at all.
            paid(DEPOT, 975.0),
            # A home's deposit has nothing to be measured against.
            paid(FLAT, 1200.0),
            # And a transaction that is not a deposit is not one.
            paid(HK_SHOP, 264.0, kind="ba:transaction_rent"),
            # Nor is one at an address the building table cannot place.
            paid(("ba:street_nowhere", 1), 16590.0),
        ])
        self.assertEqual(payload["rent"]["deposit"]["check"],
                         {"deposits": 2, "worst": round(750 / 17340, 4)})
        self.assertEqual(payload["rent"]["deposit"]["factors"], DEPOSIT_FACTORS)

    def test_a_character_who_has_paid_none_reports_zero(self):
        self.assertEqual(premises()["rent"]["deposit"]["check"],
                         {"deposits": 0, "worst": 0})


class CapTests(unittest.TestCase):
    def test_the_help_page_gives_one_cap_per_letter_per_building_type(self):
        caps = _door_caps(Names({"help_building_types_content": CAPS_HELP}))
        self.assertEqual(caps["retail"], {"A": 15, "C": 30, "D": 40, "M": 75})
        # The same letter is a different floor in an office building.
        self.assertEqual(caps["retail"]["C"], 30)
        self.assertEqual(caps["office"]["C"], 8)
        self.assertEqual(caps["office"], {"A": 4, "C": 8, "D": 10, "J": 10, "K": 50})

    def test_auditorium_letters_keep_their_range(self):
        caps = _door_caps(Names({"help_building_types_content": CAPS_HELP}))
        self.assertEqual(caps["cinema"], {"S": [100, 150]})
        self.assertEqual(caps["theater"], {"R": [150, 200]})

    def test_vehicle_capacity_is_not_a_door_cap(self):
        caps = _door_caps(Names({"help_building_types_content": CAPS_HELP}))
        self.assertNotIn("warehouse", caps)
        self.assertNotIn("residential", caps)

    def test_without_the_help_page_the_shipped_table_stands(self):
        self.assertEqual(_door_caps(Names({})), FALLBACK_CAPS)
        self.assertEqual(_door_caps(Names({"help_building_types_content": CAPS_HELP})),
                         FALLBACK_CAPS)

    def test_a_building_carries_the_cap_of_its_own_type_and_letter(self):
        rows = {b["key"]: b for b in premises([
            reg(HK_SHOP, AvailableForRent=True),
            reg(LM_OFFICE, AvailableForRent=True),
            reg(DEPOT, AvailableForRent=True),
            reg(FLAT),
        ])["buildings"]}
        self.assertEqual(rows["ba:street_secondavenue#2"]["cap"], 30)
        self.assertEqual(rows["ba:street_fifthavenue#12"]["cap"], 50)
        self.assertIsNone(rows["ba:street_fifthavenue#90"]["cap"])
        self.assertIsNone(rows["ba:street_fifthavenue#72"]["cap"])


class StatusTests(unittest.TestCase):
    def rows(self, registrations):
        return {b["key"]: b for b in premises(registrations)["buildings"]}

    def test_every_branch_of_the_status_rule(self):
        rows = self.rows([
            reg(HK_SHOP, RentedByPlayer=True, RentPerDay=264.0,
                BusinessName="[HK] Costy Co", businessTypeName=SHOP),
            reg(MT_SHOP, BusinessName="Bodega Rival", businessTypeName=SHOP,
                businessOwnerRivalId="rival-7"),
            reg(LM_OFFICE, AvailableForRent=True),
            # Empty but not on the market: nothing infers vacancy for it.
            reg(CLOSED_SHOP),
            reg(FLAT, AvailableForRent=True, BusinessName="Tenant",
                businessTypeName=SHOP, businessOwnerRivalId="rival-9"),
            # The city's own hospital: a business, but nobody owns it.
            reg(PIER, AvailableForRent=True, BusinessName="City Hospital",
                businessTypeName=SHOP),
        ])
        self.assertEqual(rows["ba:street_secondavenue#2"]["status"], "mine")
        self.assertEqual(rows["ba:street_fifthavenue#8"]["status"], "rival")
        self.assertEqual(rows["ba:street_fifthavenue#12"]["status"], "vacant")
        self.assertEqual(rows["ba:street_fifthavenue#14"]["status"], "unavailable")
        # Somebody else's flat never becomes a candidate, whatever it says.
        self.assertEqual(rows["ba:street_fifthavenue#72"]["status"], "unavailable")
        self.assertEqual(rows["ba:street_fifthavenue#99"]["status"], "service")

    def test_a_listed_building_is_to_rent_or_to_buy_by_who_owns_it(self):
        # Both are empty and both say AvailableForRent. The landlord's building
        # can be signed for; the unowned one is only on the market.
        payload = premises(
            [reg(HK_SHOP, AvailableForRent=True),
             reg(MT_SHOP, AvailableForRent=True, buildingOwnerRivalId=""),
             # Listed, unowned, and not for sale either: neither, as one
             # warehouse across the saves really is.
             reg(CLOSED_SHOP, AvailableForRent=True, buildingOwnerRivalId="")],
            for_sale=[sale(MT_SHOP, 4_250_000.0, 1000)],
        )
        rows = {b["key"]: b for b in payload["buildings"]}
        self.assertEqual(rows["ba:street_secondavenue#2"]["status"], "vacant")
        self.assertEqual(rows["ba:street_fifthavenue#8"]["status"], "forsale")
        self.assertIsNone(rows["ba:street_fifthavenue#8"]["occupant"])
        self.assertEqual(rows["ba:street_fifthavenue#14"]["status"], "unavailable")
        # The row stays lean: the asking price lives in forSale, joined by key.
        self.assertNotIn("price", rows["ba:street_fifthavenue#8"])
        self.assertEqual([r["key"] for r in payload["forSale"]], ["ba:street_fifthavenue#8"])

    def test_a_flat_on_the_market_is_still_not_a_candidate(self):
        payload = premises(
            [reg(FLAT, AvailableForRent=True, buildingOwnerRivalId=""),
             # Even with a landlord, a home is never a candidate.
             reg(PIER, AvailableForRent=True)],
            for_sale=[sale(FLAT, 79_850_000.0, 54)],
        )
        rows = {b["key"]: b for b in payload["buildings"]}
        self.assertEqual(rows["ba:street_fifthavenue#72"]["status"], "unavailable")
        self.assertEqual(rows["ba:street_fifthavenue#99"]["status"], "unavailable")

    def test_a_business_with_no_owner_is_the_citys_own_service(self):
        rows = self.rows([
            # Same building, same business type: only the owner separates a
            # wholesaler nobody can buy from a shop somebody runs.
            reg(HK_SHOP, BusinessName="Big Wholesale", businessTypeName=SHOP),
            reg(MT_SHOP, BusinessName="Bodega Rival", businessTypeName=SHOP,
                businessOwnerRivalId="rival-7"),
            # An empty special building is still just unavailable.
            reg(PIER, AvailableForRent=True),
        ])
        self.assertEqual(rows["ba:street_secondavenue#2"]["status"], "service")
        self.assertEqual(rows["ba:street_secondavenue#2"]["occupant"],
                         {"name": "Big Wholesale", "type": "Supermarket", "typeSlug": SHOP})
        self.assertEqual(rows["ba:street_fifthavenue#8"]["status"], "rival")
        self.assertEqual(rows["ba:street_fifthavenue#99"]["status"], "unavailable")

    def test_the_players_own_home_is_still_mine(self):
        rows = self.rows([reg(FLAT, RentedByPlayer=True, RentPerDay=37.0)])
        self.assertEqual(rows["ba:street_fifthavenue#72"]["status"], "mine")
        self.assertIsNone(rows["ba:street_fifthavenue#72"]["rent"])
        self.assertIsNone(rows["ba:street_fifthavenue#72"]["occupant"])

    def test_an_occupied_building_names_who_is_in_it(self):
        rows = self.rows([
            reg(MT_SHOP, BusinessName="Bodega Rival", businessTypeName=SHOP,
                businessOwnerRivalId="rival-7"),
            reg(LM_OFFICE, AvailableForRent=True),
            # Somebody else's flat is never a candidate, but the card names it.
            reg(FLAT, BusinessName="Tenant", businessTypeName=LAW,
                businessOwnerRivalId="rival-9"),
        ])
        self.assertEqual(rows["ba:street_fifthavenue#8"]["occupant"],
                         {"name": "Bodega Rival", "type": "Supermarket", "typeSlug": SHOP})
        self.assertIsNone(rows["ba:street_fifthavenue#12"]["occupant"])
        self.assertEqual(rows["ba:street_fifthavenue#72"]["status"], "unavailable")
        self.assertEqual(rows["ba:street_fifthavenue#72"]["occupant"],
                         {"name": "Tenant", "type": "Law Firm", "typeSlug": LAW})

    def test_a_row_carries_the_static_table_and_sorts_by_key(self):
        payload = premises([reg(MT_SHOP, AvailableForRent=True),
                            reg(HK_SHOP, AvailableForRent=True)])
        self.assertEqual([b["key"] for b in payload["buildings"]],
                         ["ba:street_fifthavenue#8", "ba:street_secondavenue#2"])
        self.assertEqual(payload["buildings"][1], {
            "key": "ba:street_secondavenue#2", "address": "2 Second Avenue",
            "hood": "Hell's Kitchen", "type": "retail", "size": "C", "m2": 225,
            "traffic": 50, "cap": 30, "rent": 264, "deposit": 16590,
            "status": "vacant", "occupant": None,
        })

    def test_a_registration_the_table_does_not_place_is_dropped(self):
        payload = premises([reg(("ba:street_nowhere", 1), AvailableForRent=True),
                            reg(HK_SHOP, AvailableForRent=True)])
        self.assertEqual([b["key"] for b in payload["buildings"]],
                         ["ba:street_secondavenue#2"])


class ForSaleTests(unittest.TestCase):
    def test_listings_join_to_the_static_table(self):
        payload = premises(for_sale=[sale(MT_SHOP, 4_250_000.0, 1000),
                                     sale(FLAT, 79_850_000.4, 54)])
        self.assertEqual(payload["forSale"], [
            {"key": "ba:street_fifthavenue#72", "address": "72 Fifth Avenue",
             "hood": "Lower Manhattan", "type": "residential", "size": "B",
             "m2": 54, "price": 79850000},
            {"key": "ba:street_fifthavenue#8", "address": "8 Fifth Avenue",
             "hood": "Midtown", "type": "retail", "size": "M", "m2": 1000,
             "price": 4250000},
        ])

    def test_an_unmatched_listing_is_skipped(self):
        payload = premises(for_sale=[sale(("ba:street_nowhere", 3), 1000.0)])
        self.assertEqual(payload["forSale"], [])


class DemandTests(unittest.TestCase):
    MARKET = {
        "hoods": ["Hell's Kitchen", "Midtown", "The Hamptons"],
        "types": [
            band(SHOP, "Supermarket", [cell(40, 4), cell(64, 3, here=True), None]),
            band(CINEMA, "Cinema", [None, cell(80, 1), None]),
            band(THEATER, "Theater", [cell(55, 2), None, None]),
        ],
        "offices": [band(LAW, "Law Firm", [cell(33, 2), cell(66, 1), None])],
    }

    def test_the_grid_is_turned_inside_out_by_neighbourhood(self):
        demand = _premises_demand(self.MARKET)
        # A neighbourhood with no reading at all is left out entirely.
        self.assertEqual(sorted(demand), ["Hell's Kitchen", "Midtown"])
        self.assertEqual(demand["Midtown"], [
            {"slug": SHOP, "type": "Supermarket", "demand": 64, "providers": 3,
             "mine": True, "category": "retail"},
            {"slug": CINEMA, "type": "Cinema", "demand": 80, "providers": 1,
             "mine": False, "category": "cinema"},
            {"slug": LAW, "type": "Law Firm", "demand": 66, "providers": 1,
             "mine": False, "category": "office"},
        ])
        self.assertEqual([r["category"] for r in demand["Hell's Kitchen"]],
                         ["retail", "theater", "office"])

    def test_an_empty_market_reshapes_to_nothing(self):
        self.assertEqual(_premises_demand({}), {})
        self.assertEqual(premises(market=self.MARKET)["demand"]["Midtown"][1]["demand"], 80)


if __name__ == "__main__":
    unittest.main()
