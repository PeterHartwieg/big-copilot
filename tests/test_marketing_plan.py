"""The cheapest campaign mix (docs/marketing-write-scope.md, section 2).

marketing_score() is the game's own formula, so it is held against every
promotion the saves on this machine store, when there are any; the optimizer
is held to Peter's rule on synthetic sites. No save is ever committed.
"""
from __future__ import annotations

import glob
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ba_dashboard as d  # noqa: E402

MIDTOWN = d.HOOD_PREFIX + "midtown"
LOWER = d.HOOD_PREFIX + "lowermanhattan"
GARMENT = d.HOOD_PREFIX + "garmentdistrict"
SI, MI, LI, SB, MB, LB = range(6)


class MarketingScore(unittest.TestCase):
    def test_the_formula(self):
        # 20 + 100 m² of reach over 200 m² is 60 marketing; Midtown halves it.
        self.assertEqual(d.marketing_score(40, [SI, SB], 200, "retail", MIDTOWN), (60, 70))
        # A cinema's reach counts twice.
        self.assertEqual(d.marketing_score(40, [SI, SB], 200, "cinema", MIDTOWN), (100, 90))
        self.assertEqual(d.marketing_score(40, [SI, SB], 200, "ba:businesstype_cinema", MIDTOWN), (100, 90))
        # A business type reaches its building type.
        self.assertEqual(d.marketing_score(40, [SI, SB], 200, "ba:businesstype_lawfirm", LOWER), (60, 100))
        # Nothing on: the address alone.
        self.assertEqual(d.marketing_score(55, [], 200, "retail", LOWER), (0, 55))

    def test_half_rounds_to_even_as_unity_does(self):
        # 20 m² over 800 m² is 2.5 marketing: 2, as Mathf.RoundToInt gives.
        self.assertEqual(d.marketing_score(0, [SI], 800, "retail", LOWER)[0], 2)
        # 97 + 5 × 0.9 = 101.5 is held at 100; 90 + 5 × 0.9 = 94.5 rounds to 94.
        self.assertEqual(d.marketing_score(97, [SI], 400, "retail", GARMENT), (5, 100))
        self.assertEqual(d.marketing_score(90, [SI], 400, "retail", GARMENT), (5, 94))

    def test_an_unknown_figure_is_never_guessed(self):
        with self.assertRaises(KeyError):
            d.marketing_score(40, [SI], 200, "warehouse", MIDTOWN)
        with self.assertRaises(KeyError):
            d.marketing_score(40, [SI], 200, "retail", d.HOOD_PREFIX + "global")


class MarketingPlan(unittest.TestCase):
    def test_the_cheapest_mix_to_promotion_100(self):
        # 60 traffic in Lower Manhattan on 100 m²: marketing 40 is enough, and
        # Medium internet alone reaches it for $250.
        p = d.marketing_plan(60, [], 100, "retail", LOWER)
        self.assertEqual((p["on"], p["cost"], p["marketing"], p["promotion"], p["target"]),
                         ([MI], 250, 40, 100, "promotion"))

    def test_overspend_is_cut_back(self):
        p = d.marketing_plan(60, [SB, LB], 100, "retail", LOWER)
        self.assertEqual((p["on"], p["cost"], p["costNow"]), ([MI], 250, 6500))
        self.assertEqual(p["modelNow"], [100, 100])

    def test_no_campaign_when_the_street_is_enough(self):
        p = d.marketing_plan(100, [SI], 300, "retail", LOWER)
        self.assertEqual((p["on"], p["cost"], p["promotion"]), ([], 0, 100))

    def test_99_is_short(self):
        # On 103 m² Medium internet gives 39 marketing and 99 promotion: short,
        # so the plan adds Small internet for $350.
        self.assertEqual(d.marketing_score(60, [MI], 103, "retail", LOWER), (39, 99))
        p = d.marketing_plan(60, [], 103, "retail", LOWER)
        self.assertEqual((p["on"], p["cost"], p["promotion"]), ([SI, MI], 350, 100))

    def test_unreachable_100_goes_to_marketing_100(self):
        # Midtown halves marketing: 40 traffic tops out at 90. The plan is the
        # cheapest mix with 200 m² of reach: Medium and Large internet with
        # Small billboard, $1,250, not Medium billboard at $2,500.
        p = d.marketing_plan(40, [], 200, "retail", MIDTOWN)
        self.assertEqual((p["on"], p["cost"], p["marketing"], p["promotion"], p["target"]),
                         ([MI, LI, SB], 1250, 100, 90, "marketing"))

    def test_a_building_too_big_for_marketing_100_gets_the_most_it_can_reach(self):
        # 1,070 m² of reach is every campaign; a 2,000 m² shop reaches 53.5,
        # which rounds to 54.
        p = d.marketing_plan(20, [], 2000, "retail", MIDTOWN)
        self.assertEqual((p["on"], p["marketing"], p["target"]), ([SI, MI, LI, SB, MB, LB], 54, "marketing"))

    def test_ties_go_to_fewer_campaigns_then_to_the_mix_now(self):
        # The game's prices never tie at the optimum, so the rule is held on a
        # price list of the test's own: A and B cost the same and reach the
        # same, C + D cost the same as either.
        types = (("A", 100, 50), ("B", 100, 50), ("C", 50, 25), ("D", 50, 25), ("E", 900, 1), ("F", 900, 1))
        with mock.patch.object(d, "MARKETING_TYPES", types), \
                mock.patch.object(d, "MARKETING_ALL", frozenset(range(6))):
            # Fewer campaigns: A (or B) beats C + D at the same $100.
            self.assertEqual(d.marketing_plan(50, [], 100, "retail", LOWER)["on"], [0])
            self.assertEqual(d.marketing_plan(50, [2, 3], 100, "retail", LOWER)["on"], [0])
            # Then the mix now: B stays B.
            self.assertEqual(d.marketing_plan(50, [1], 100, "retail", LOWER)["on"], [1])


class _Save:
    """Just enough of ba_save.Save for _marketing() and _marketing_agencies()."""

    def __init__(self, root=None):
        self.root = root or {}

    def items(self, value):
        return list(value or [])

    def address(self, value):
        return (value["streetName"], value["streetNumber"]) if value else None


INTERNET, BILLBOARDS = "ba:street_thirdavenue#17", "ba:street_secondavenue#5"
WEEKDAYS_8_TO_17 = [{"day": k, "isOpen": k <= 5, "openingHourSlots": [{"startingHour": 8, "endingHour": 17}]}
                    for k in range(1, 8)]


def _agency_reg(street, number, name, closed=False):
    return {"StreetName": street, "StreetNumber": number, "BusinessName": name,
            "temporarilyClosed": closed, "scheduleDays": WEEKDAYS_8_TO_17}


def _city(contacts=(INTERNET, BILLBOARDS), day=1, hour=10, closed=False):
    """The two agencies as a save holds them, and the phone's contacts."""
    rows = [{"streetName": k.split("#")[0], "streetNumber": int(k.split("#")[1])} for k in contacts]
    return _Save({"Day": day, "Hour": hour, "Contacts": rows, "BuildingRegistrations": [
        _agency_reg("ba:street_thirdavenue", 17, "McCain's eMarketing"),
        _agency_reg("ba:street_secondavenue", 5, "CityAds", closed)]})


def _camp(kind, enabled, street="ba:street_thirdavenue", number=17):
    return {"marketingTypeName": kind, "enabled": enabled,
            "agencyAddress": {"streetName": street, "streetNumber": number}}


class Extraction(unittest.TestCase):
    building = {"t": "retail", "m": 100}
    promo = {"trafficIndex": 60, "marketing": 100, "total": 100}

    def plan(self, campaigns, status="retail", building=None, hood=LOWER, contacts=(INTERNET, BILLBOARDS), promo=None):
        agencies = d._marketing_agencies(_city(contacts))
        return d._marketing(_Save(), {"marketingCampaigns": campaigns}, building or self.building,
                            status, hood, promo or self.promo, agencies)

    def test_campaigns_and_the_plan(self):
        rows, plan = self.plan([_camp(SB, True), _camp(LB, True, "ba:street_secondavenue", 5), _camp(SI, False)])
        self.assertEqual(rows[1], {"type": "LargeBillboard", "agency": "ba:street_secondavenue#5", "enabled": True})
        self.assertEqual(plan["on"], ["MediumInternet"])
        self.assertEqual(plan["was"], ["SmallBillboard", "LargeBillboard"])
        self.assertEqual((plan["costNow"], plan["costPlan"]), (6500, 250))
        self.assertEqual((plan["marketingNow"], plan["marketingPlan"]), (100, 40))
        self.assertEqual((plan["promotionNow"], plan["promotionPlan"], plan["target"]), (100, 100, "promotion"))

    def test_needs_setup_until_every_type_has_an_entry(self):
        self.assertTrue(self.plan([_camp(MI, True)])[1]["needsSetup"])
        # Six entries, the unused ones disabled: set up, and on plan.
        _rows, plan = self.plan([_camp(k, k == MI) for k in range(6)])
        self.assertFalse(plan["needsSetup"])
        self.assertEqual(plan["on"], plan["was"])
        self.assertEqual(plan["agencies"], [])

    def test_needs_setup_counts_only_contacted_agencies(self):
        # The three internet entries, and only McCain's in the phone: set up.
        internet = [_camp(k, k == MI) for k in (SI, MI, LI)]
        self.assertFalse(self.plan(internet, contacts=(INTERNET,))[1]["needsSetup"])
        self.assertTrue(self.plan(internet)[1]["needsSetup"])

    def test_no_contact_no_plan_and_the_agencies_to_visit(self):
        _rows, plan = self.plan([], contacts=())
        self.assertIsNone(plan["on"])
        self.assertIsNone(plan["costPlan"])
        # 60 traffic on 100 m²: Medium internet, sold by McCain's.
        self.assertEqual(plan["visit"], [INTERNET])
        # Nothing to change, nothing to visit for: the street is enough.
        _rows, plan = self.plan([], contacts=(), promo={"trafficIndex": 100, "marketing": 0, "total": 100})
        self.assertEqual((plan["on"], plan["visit"]), ([], []))

    def test_only_contacted_agencies_types_are_planned(self):
        # Only CityAds is a contact: Small billboard (100 m², so 100) at $500
        # instead of Medium internet at $250, and McCain's is the hint.
        _rows, plan = self.plan([], contacts=(BILLBOARDS,))
        self.assertEqual((plan["on"], plan["costPlan"], plan["visit"]), (["SmallBillboard"], 500, [INTERNET]))
        self.assertEqual(plan["agencies"], [BILLBOARDS])
        # A type booked with an agency that is not a contact stays as it runs.
        _rows, plan = self.plan([_camp(LI, True)], contacts=(BILLBOARDS,))
        self.assertEqual(plan["on"], ["LargeInternet"])
        self.assertNotIn(INTERNET, plan["agencies"])

    def test_the_agencies_a_write_touches(self):
        _rows, plan = self.plan([_camp(SB, True, "ba:street_secondavenue", 5)])
        # Small billboard off at CityAds, Medium internet on at McCain's, and
        # the missing entries at both.
        self.assertEqual(plan["on"], ["MediumInternet"])
        self.assertEqual(plan["agencies"], [BILLBOARDS, INTERNET])

    def test_only_shops_and_offices_in_a_promotion_building(self):
        self.assertIsNotNone(self.plan([], status="office", building={"t": "office", "m": 100})[1])
        self.assertIsNone(self.plan([], status="overhead")[1])
        self.assertIsNone(self.plan([], building={"t": "warehouse", "m": 100})[1])
        self.assertIsNone(self.plan([], hood="")[1])
        self.assertIsNone(self.plan([], building={"t": "retail"})[1])


class Agencies(unittest.TestCase):
    def test_open_is_the_games_rule(self):
        hours = d._open_hours(_Save(), {"scheduleDays": WEEKDAYS_8_TO_17})
        # Day 1 is a Monday: ScheduleDay.day 1. Day 7 is Sunday, its day 7.
        self.assertEqual(hours[1], [[8, 17]])
        self.assertEqual(hours[0], [])
        self.assertTrue(d.open_at(hours, False, 1, 8))
        self.assertFalse(d.open_at(hours, False, 1, 17), "the end hour is shut")
        self.assertFalse(d.open_at(hours, False, 1, 7))
        self.assertFalse(d.open_at(hours, True, 1, 10), "temporarily closed")
        self.assertFalse(d.open_at(hours, False, 6, 10), "Saturday")

    def test_next_opening(self):
        hours = d._open_hours(_Save(), {"scheduleDays": WEEKDAYS_8_TO_17})
        self.assertEqual(d.next_open(hours, False, 1, 7), {"day": 1, "hour": 8})
        self.assertEqual(d.next_open(hours, False, 1, 10), {"day": 1, "hour": 10})
        # Friday evening: Monday, day 8, at 8.
        self.assertEqual(d.next_open(hours, False, 5, 17), {"day": 8, "hour": 8})
        self.assertIsNone(d.next_open(hours, True, 5, 17))

    def test_the_agencies_from_the_save(self):
        rows = d._marketing_agencies(_city(contacts=(BILLBOARDS,), day=5, hour=18, closed=True))
        self.assertEqual([(a["key"], a["name"], a["contact"]) for a in rows],
                         [(INTERNET, "McCain's eMarketing", False), (BILLBOARDS, "CityAds", True)])
        self.assertEqual(rows[0]["types"], ["SmallInternet", "MediumInternet", "LargeInternet"])
        self.assertEqual((rows[0]["open"], rows[0]["opens"]), (False, {"day": 8, "hour": 8}))
        self.assertEqual((rows[1]["closed"], rows[1]["open"], rows[1]["opens"]), (True, False, None))


class AgainstTheSaves(unittest.TestCase):
    """The formula against the promotion each save stores for each site."""

    def test_every_stored_promotion(self):
        saves = glob.glob(os.path.join(d.SAVE_ROOT, "**", "*.hsg"), recursive=True) if os.path.isdir(d.SAVE_ROOT) else []
        if not saves:
            self.skipTest("no saves on this machine")
        from ba_save import load_save
        checked = 0
        for path in saves:
            try:
                save = load_save(path)
            except Exception:  # noqa: BLE001 - an unreadable save is check_saves.py's business
                continue
            for b in save.items(save.root.get("BuildingRegistrations")):
                if not b.get("RentedByPlayer"):
                    continue
                row = d.load_buildings().get((b["StreetName"], b["StreetNumber"]))
                if not row or row.get("t") not in d.MARKETING_REACH or not row.get("m"):
                    continue
                if b.get("businessTypeName") in (None, "ba:businesstype_empty"):
                    continue
                promo = save.deref(b.get("promotion")) or {}
                on = {c.get("marketingTypeName") for c in save.items(b.get("marketingCampaigns")) if c.get("enabled")}
                got = d.marketing_score(promo.get("trafficIndex", 0), on, row["m"], row["t"], d.hood_key(row))
                self.assertEqual(got, (promo.get("marketing"), promo.get("total")),
                                 f"{os.path.basename(path)} {b.get('businessTypeName')} {b['StreetName']} {b['StreetNumber']}")
                checked += 1
        if not checked:
            self.skipTest("no shop or office in the saves")


if __name__ == "__main__":
    unittest.main()
