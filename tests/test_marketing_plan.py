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
from tests.i18n_check import MsgAsserts, list_items
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

    def test_single_precision_as_the_il_computes(self):
        # 45 marketing at Hell's Kitchen's 0.7: 31.4999… in double, 31.5 in
        # float, which rounds to 32 (the even neighbour). The IL is float.
        hk = d.HOOD_PREFIX + "hellskitchen"
        self.assertEqual(d.marketing_score(0, [SI, LI, SB], 400, "retail", hk), (45, 32))

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
        # A type the site has no entry for, sold by no contact, stays off:
        # Medium internet would need a new switch at McCain's.
        self.assertNotIn("MediumInternet", plan["on"])

    def test_an_existing_switch_flips_whatever_its_agency(self):
        # Peter's rule: a switch the site has is turned on or off at any time,
        # contact or not. Medium internet's entry at McCain's, with no contact
        # at all, is still planned, and needs no agency for the write.
        _rows, plan = self.plan([_camp(SB, True, "ba:street_secondavenue", 5), _camp(MI, False)], contacts=())
        self.assertEqual((plan["on"], plan["costPlan"]), (["MediumInternet"], 250))
        self.assertEqual(plan["agencies"], [])
        self.assertEqual((plan["needsSetup"], plan["setupTypes"]), (False, []))
        # A type booked with an agency that is not a contact is free too: the
        # Large internet entry stays on, as cheap as Small billboard and
        # already running, and nothing new is needed.
        _rows, plan = self.plan([_camp(LI, True)], contacts=(BILLBOARDS,))
        self.assertEqual((plan["on"], plan["agencies"]), (["LargeInternet"], []))

    def test_the_agencies_a_write_touches(self):
        _rows, plan = self.plan([_camp(SB, True, "ba:street_secondavenue", 5)])
        # Small billboard off at CityAds, which needs no agency, and Medium
        # internet on, a new switch from McCain's.
        self.assertEqual(plan["on"], ["MediumInternet"])
        self.assertEqual(plan["agencies"], [INTERNET])
        # The switches still missing, and who sells them.
        self.assertEqual(plan["setupTypes"], ["SmallInternet", "MediumInternet", "LargeInternet",
                                              "MediumBillboard", "LargeBillboard"])
        self.assertEqual(plan["setupAgencies"], [BILLBOARDS, INTERNET])
        _rows, plan = self.plan([_camp(SB, True, "ba:street_secondavenue", 5)], contacts=(BILLBOARDS,))
        self.assertEqual((plan["setupTypes"], plan["setupAgencies"]), (["MediumBillboard", "LargeBillboard"], [BILLBOARDS]))

    def test_a_visit_that_only_saves_is_not_called_a_raise(self):
        # Midtown, 80 m², 30 traffic, only McCain's known: Small and Large
        # internet ($600) reach marketing 100, as Small billboard alone would
        # for $500. The same promotion either way: a visit saves, it raises nothing.
        _rows, plan = self.plan([], building={"t": "retail", "m": 80}, hood=MIDTOWN, contacts=(INTERNET,),
                                promo={"trafficIndex": 30, "marketing": 0, "total": 30})
        self.assertEqual((plan["on"], plan["costPlan"], plan["promotionPlan"]), (["SmallInternet", "LargeInternet"], 600, 80))
        self.assertEqual((plan["visit"], plan["visitRaises"]), ([BILLBOARDS], False))
        # No switch and no agency known: any plan a visit brings raises it.
        _rows, plan = self.plan([], contacts=(), promo={"trafficIndex": 60, "marketing": 0, "total": 60})
        self.assertTrue(plan["visitRaises"])

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


def _mk(on, was, now=100, then=100, cost_now=0, cost_plan=0, visit=(), raises=None):
    return {"on": on, "was": was, "promotionNow": now, "promotionPlan": then, "costNow": cost_now,
            "costPlan": cost_plan, "visit": list(visit), "visitRaises": bool(visit) if raises is None else raises}


def _site(key, name, plan, status="retail"):
    """The fields _alerts() reads off a business (test_site_panel_fields.stub())."""
    return {"key": key, "name": name, "status": status, "typeSlug": "", "revenue": 10.0, "profit": 0.0,
            "opened": 1, "rent": 100.0, "staff": 1, "customers": 3, "costCentre": True, "lines": [], "crew": [],
            "satisfaction": {"overall": None}, "staffDemands": [], "quitWarnings": 0,
            "promotion": plan["promotionNow"], "missingUniformLocker": False, "uniformGaps": [],
            "missingAmenities": [], "traffic": 0, "marketingIndex": 0, "marketingPlan": plan}


def _promotion(businesses):
    out = d._alerts(businesses, {"graph": {"links": []}, "shops": [], "idle": [], "imports": []},
                    [], [], [], [], [], 60, 0.0, agencies=[{"key": INTERNET, "name": "McCain's eMarketing"},
                                                           {"key": BILLBOARDS, "name": "CityAds"}])
    return [r for r in out["lines"] + out["minor"]["rows"] if r["group"] == "promotion"]


class Finding(MsgAsserts, unittest.TestCase):
    """The promotion finding: every shop and office whose plan differs."""

    def test_a_short_site_the_plan_fixes_is_a_warning(self):
        rows = _promotion([_site("a", "HART. Books", _mk(["SmallBillboard"], [], 77, 100, 0, 500))])
        self.assertEqual([r["level"] for r in rows], ["warn"])
        self.assertMsg(rows[0]["text"], "f.promotion.reach.more.one", site="HART. Books", p=100, w=500)

    def test_several_sites_lead_with_the_gain(self):
        rows = _promotion([
            _site("a", "A", _mk(["SmallBillboard"], ["LargeBillboard"], 82, 100, 6000, 500)),
            _site("c", "C", _mk(["SmallBillboard", "SmallInternet"], ["SmallBillboard"], 90, 100, 500, 600)),
            _site("b", "B", _mk(["MediumInternet"], ["SmallBillboard"], 100, 100, 500, 250), status="office")])
        # The sites the plan raises, and apart from them the ones it only saves at.
        self.assertEqual([r["level"] for r in rows], ["warn", "info"])
        self.assertMsg(rows[0]["site"], "f.site.sites", n=2)
        self.assertEqual(rows[1]["site"], "B")
        text = self.assertMsg(rows[0]["text"], "f.promotion.reach.less.many", n=2)
        first, second = list_items(text.p["sites"])
        self.assertMsg(first, "f.promotion.item.gain", site="A", a=82, b=100)
        self.assertMsg(second, "f.promotion.item.gain", site="C", a=90, b=100)
        self.assertMsg(rows[1]["text"], "f.promotion.save.one", site="B", w=250)

    def test_a_site_that_cannot_reach_100_is_never_counted_as_reaching_it(self):
        rows = _promotion([
            _site("a", "A", _mk(["SmallBillboard"], [], 70, 90, 0, 500)),
            _site("b", "B", _mk(["SmallInternet"], [], 80, 100, 0, 100)),
            _site("c", "C", _mk(["MediumInternet"], ["SmallBillboard"], 100, 100, 500, 250))])
        self.assertEqual(len(rows), 2)
        text = self.assertMsg(rows[0]["text"], "f.promotion.gain.more.many", n=2, w=600)
        first, second = list_items(text.p["sites"])
        self.assertMsg(first, "f.promotion.item.gain", site="A", a=70, b=90)
        self.assertMsg(second, "f.promotion.item.gain", site="B", a=80, b=100)
        self.assertMsg(rows[1]["text"], "f.promotion.save.one", site="C", w=250)

    def test_each_line_has_its_own_id(self):
        rows = _promotion([
            _site("a", "A", _mk(["SmallBillboard"], [], 70, 100, 0, 500)),
            _site("b", "B", _mk(["SmallInternet"], [], 80, 100, 0, 100)),
            _site("c", "C", _mk(None, [], 70, None, visit=[BILLBOARDS])),
            _site("d", "D", _mk(None, [], 70, None, visit=[BILLBOARDS])),
            _site("e", "E", _mk(["SmallInternet"], ["SmallInternet"], 80, 90, 100, 100, visit=[BILLBOARDS])),
            _site("f", "F", _mk(["SmallInternet"], ["SmallInternet"], 80, 90, 100, 100, visit=[BILLBOARDS]))])
        self.assertEqual(len(rows), 3)
        for row in rows:
            self.assertMsg(row["site"], "f.site.sites", n=2)
        self.assertEqual(len({r["id"] for r in rows}), 3)

    def test_overspend_and_a_small_gap_are_opportunities(self):
        rows = _promotion([_site("a", "Gym", _mk(["SmallBillboard"], ["SmallBillboard", "MediumInternet"], 100, 100, 750, 500))])
        self.assertEqual([r["level"] for r in rows], ["info"])
        self.assertMsg(rows[0]["text"], "f.promotion.save.one", site="Gym", w=250)
        rows = _promotion([_site("a", "Shop", _mk(["SmallInternet"], [], 99, 100, 0, 100))])
        self.assertEqual(rows[0]["level"], "info")

    def test_set_up_only_or_on_plan_is_no_finding(self):
        self.assertEqual(_promotion([_site("a", "A", _mk(["SmallInternet"], ["SmallInternet"], 90, 90))]), [])

    def test_no_agency_known_is_its_own_line(self):
        rows = _promotion([_site("a", "A", _mk(None, [], 70, None, visit=[BILLBOARDS]))])
        self.assertEqual([r["level"] for r in rows], ["info"])
        self.assertMsg(rows[0]["text"], "f.promotion.visit", agencies="CityAds", sites="A")
        # At the cap already: nothing to visit for.
        self.assertEqual(_promotion([_site("a", "A", _mk(None, [], 100, None, visit=[BILLBOARDS]))]), [])

    def test_on_its_best_known_mix_but_a_visit_would_raise_it(self):
        rows = _promotion([_site("a", "A", _mk(["SmallInternet"], ["SmallInternet"], 80, 90, 100, 100, visit=[BILLBOARDS]))])
        self.assertEqual([r["level"] for r in rows], ["info"])
        self.assertMsg(rows[0]["text"], "f.promotion.visit.more", agencies="CityAds", sites="A")
        # A visit that would only make the same promotion cheaper: the site
        # panel's hint, no overview line.
        self.assertEqual(_promotion([_site("a", "A", _mk(["SmallInternet"], ["SmallInternet"], 80, 90, 100, 100,
                                                        visit=[BILLBOARDS], raises=False))]), [])
        # Its plan reaches 100 with what it knows: no line.
        self.assertEqual(_promotion([_site("a", "A", _mk(["SmallInternet"], ["SmallInternet"], 80, 100, 100, 100,
                                                        visit=[BILLBOARDS]))]), [])


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
