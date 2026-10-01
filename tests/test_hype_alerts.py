"""The hype finding: one line per shop, whatever number of waves it rides.

A shop's takings under hype are one number. Two waves in one neighbourhood that
land hardest on the same shop used to write two lines with the same id, each
saying the whole of that shop's lift rides on it.
"""
import unittest

from ba_dashboard import plain, _alerts, site_key
from test_site_panel_fields import stub
from tests.i18n_check import MsgAsserts, list_items

ELECTRO = site_key(("ba:street_industry", 1))
GIFTS = site_key(("ba:street_industry", 2))
SUPPLY = {"graph": {"links": []}, "shops": [], "idle": [], "imports": []}


def site(key, name, revenue):
    return {"key": key, "name": name, "type": "ba:businesstype_electronicsstore",
            "revenue": revenue, "profit": revenue / 4, "share": 60}


def wave(count, left, start, sites, baseline):
    top = max(sites, key=lambda s: s["revenue"])
    return {"hood": "ba:neighborhood_industrycity", "daysLeft": left, "startDay": start, "count": count,
            "items": [], "sites": sites, "top": top["key"],
            "revenue": sum(s["revenue"] for s in sites), "profit": 0, "baseline": baseline}


def baseline(revenue, basis="the no-hype [GD] HART. Electro"):
    return {"name": "[GD] HART. Electro", "hood": "ba:neighborhood_garmentdistrict", "revenue": revenue,
            "basis": basis}


def hype_lines(hype, businesses=None, trends=()):
    # Trading shops at the promotion cap, so the hype lines are all they raise.
    businesses = businesses or [
        stub(key, name, "retail", revenue=1.0, promotion=100)
        for key, name in ((ELECTRO, "[IC] HART. Electro"), (GIFTS, "[IC] HART. Gifts"))]
    out = _alerts(businesses, SUPPLY, [], list(trends), hype, [], [], 60, 1.0)
    rows = out["lines"] + out["minor"]["rows"]
    return [r for r in rows if r["group"] == "hype"], rows


class HypeLineTests(MsgAsserts, unittest.TestCase):
    def test_one_wave_reads_as_it_always_has(self):
        [line], _ = hype_lines([wave(7, 4, 50, [site(ELECTRO, "[IC] HART. Electro", 137636)],
                                     baseline(63012))])
        self.assertMsg(line["text"], "f.hype.wave", hood="Industry City", site="[IC] HART. Electro",
                       revenue=137636, base=63012, basis="the no-hype [GD] HART. Electro", drop=74624)
        self.assertHasMsg(line["text"], "f.hype.lines.left", n=7, days=4)
        self.assertEqual(line["level"], "warn")
        self.assertEqual(line["worth"], 74624)

    def test_two_waves_on_one_shop_are_one_line_counting_its_lift_once(self):
        electro = [site(ELECTRO, "[IC] HART. Electro", 137636)]
        lines, _ = hype_lines([wave(7, 2, 50, electro, baseline(63012)),
                               wave(3, 13, 58, electro, baseline(90000, "its own 7 days before day 58"))])
        self.assertEqual(len(lines), 1)
        [line] = lines
        self.assertMsg(line["text"], "f.hype.waves", hood="Industry City", site="[IC] HART. Electro",
                       revenue=137636, base=63012, basis="the no-hype [GD] HART. Electro", drop=74624)
        waves = self.assertHasMsg(line["text"], "f.hype.lines.waves", n=10)
        first, later = list_items(waves.p["waves"])
        self.assertMsg(first, "f.hype.part.first", n=7, days=2)
        self.assertMsg(later, "f.hype.part.later", n=3, days=13)
        # The soonest end sets the level; the baseline is the first wave's, since
        # the days before the second one already carry the first.
        self.assertEqual(line["level"], "critical")
        self.assertEqual(line["worth"], 74624)

    def test_the_baseline_is_the_first_started_wave_even_when_a_later_one_ends_sooner(self):
        electro = [site(ELECTRO, "[IC] HART. Electro", 137636)]
        [line], _ = hype_lines([wave(7, 13, 50, electro, baseline(63012)),
                                wave(3, 2, 58, electro, baseline(90000, "its own 7 days before day 58"))])
        self.assertMsg(line["text"], "f.hype.waves", hood="Industry City", site="[IC] HART. Electro",
                       revenue=137636, base=63012, basis="the no-hype [GD] HART. Electro", drop=74624)
        waves = self.assertHasMsg(line["text"], "f.hype.lines.waves", n=10)
        first, later = list_items(waves.p["waves"])
        self.assertMsg(first, "f.hype.part.first", n=3, days=2)
        self.assertMsg(later, "f.hype.part.later", n=7, days=13)
        self.assertEqual(line["level"], "critical")

    def test_two_waves_on_one_shop_without_a_baseline_say_so_once(self):
        electro = [site(ELECTRO, "[IC] HART. Electro", 137636)]
        [line], _ = hype_lines([wave(7, 1, 50, electro, None), wave(3, 13, 58, electro, None)])
        self.assertMsg(line["text"], "f.hype.nobase.waves", hood="Industry City",
                       site="[IC] HART. Electro", revenue=137636)
        waves = self.assertHasMsg(line["text"], "f.hype.lines.waves", n=10)
        first, later = list_items(waves.p["waves"])
        self.assertMsg(first, "f.hype.part.tomorrow", n=7)
        self.assertMsg(later, "f.hype.part.later", n=3, days=13)

    def test_two_waves_on_different_shops_keep_a_line_each(self):
        lines, _ = hype_lines([
            wave(7, 4, 50, [site(ELECTRO, "[IC] HART. Electro", 137636)], baseline(63012)),
            wave(3, 13, 58, [site(GIFTS, "[IC] HART. Gifts", 20000)], baseline(15000)),
        ])
        self.assertEqual([l["siteKey"] for l in lines], [ELECTRO, GIFTS])
        self.assertEqual(len({l["id"] for l in lines}), 2)
        self.assertMsg(lines[1]["text"], "f.hype.wave")
        self.assertHasMsg(lines[1]["text"], "f.hype.lines.left", n=3, days=13)

    def test_a_shop_up_under_its_waves_raises_no_revenue_up_line(self):
        electro = [site(ELECTRO, "[IC] HART. Electro", 137636)]
        trends = [{"s": 0, "ready": True, "change": 0.6, "last7": 900000, "prev7": 560000},
                  {"s": 1, "ready": True, "change": 0.6, "last7": 90000, "prev7": 56000}]
        _, rows = hype_lines([wave(7, 4, 50, electro, baseline(63012)),
                              wave(3, 13, 58, electro, baseline(63012))], trends=trends)
        self.assertEqual([r["siteKey"] for r in rows if r["group"] == "trend"], [GIFTS])


if __name__ == "__main__":
    unittest.main()
