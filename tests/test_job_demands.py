"""Staff demands: the game's own met/unmet rules, and the findings they raise."""
import os
import sys
import unittest

from ba_dashboard import JOB_DEMANDS, _alerts, _business, _cleanliness, _job_demands
from ba_save import Names, Save

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from build_web import ships  # noqa: E402

STREET = "ba:street_secondavenue"
KEY = f"{STREET}#10"
LABELS = {
    "ba:jobdemand_hasmousepad": "Mouse Pad",
    "ba:jobdemand_goldhealthinsurance": "Gold Health Insurance",
    "ba:jobdemand_peacefulworkenvironment": "Happy boss",
    "ba:jobdemand_fulltime": "Full-time",
    "ba:jobdemand_fivedaysweek": "Five days a week",
    "ba:businesstype_lawfirm": "Law Firm",
}


def item(name, cargo=()):
    return {"$v": {"id": name, "itemName": "ba:itemname_" + name,
                   "cargoInstances": {"$items": [{"itemName": c, "amount": n} for c, n in cargo]}}}


def employee(demands, eid="e1", **fields):
    e = {
        "id": eid,
        "demands": {"$items": list(demands)},
        "assignedAddress": {"streetName": STREET, "streetNumber": 10},
        "assignedWeeklyHours": 40, "workedHoursThisWeek": 20,
        "assignedWeeklyDays": {"$items": [1, 2, 3, 4, 5]}, "workedDays": 3,
        "assignedWorkStationItems": {"$items": []},
        "hasSendQuitWarning": False,
    }
    e.update(fields)
    return e


def building(items=(), shifts=(), dirt=None, closed=False, open_days=(1, 2, 3, 4, 5, 6, 7)):
    days = [{"day": d, "isOpen": d in open_days,
             "workShifts": {"$items": [s for s in shifts if s["day"] == d]}} for d in range(1, 8)]
    return {
        "BusinessName": "HART. &Partners", "businessTypeName": "ba:businesstype_lawfirm",
        "StreetName": STREET, "StreetNumber": 10, "RentedByPlayer": True, "creationDay": 1,
        "temporarilyClosed": closed,
        "itemInstances": {"$items": list(items)},
        "scheduleDays": {"$items": days},
        "dirtSpots": {"$items": [{"dirtiness": x} for x in (dirt or [])]},
        "orderHistory": {"$items": [{"dayNumber": 7, "totalCustomers": 10}]},
        "retailPrices": {"$items": []},
        "cachedFulfilledCustomerDemands": {"$items": []},
    }


def shift(day, start, end, kind=1, eid="e1"):
    return {"day": day, "startingHour": start, "endingHour": end, "type": kind, "employeeId": eid}


def evaluate(employees, reg=None, plans=(), happiness=100):
    reg = reg or building()
    save = Save({
        "BuildingRegistrations": {"$items": [reg]},
        "EmployeeInstances": {"$items": list(employees)},
        "hrManagerPlans": {"$items": list(plans)},
        "Happiness": happiness,
    }, {}, "")
    addr = (STREET, 10)
    latest = {addr: {"TotalSales": 1000, "TotalProfit": 500}}
    b = _business(save, Names(LABELS), reg, addr, latest, [], {addr: [{"daily": 1.0, "role": "Lawyer",
                  "level": 100, "name": "A", "absent": False}]}, 8)
    _job_demands(save, Names(LABELS), [b])
    return b


def unmet(demand, **kw):
    """The slugs left unmet for one employee holding one demand."""
    emp_fields = kw.pop("employee", {})
    b = evaluate([employee([demand], **emp_fields)], **kw)
    return [d["slug"] for d in b["staffDemands"]]


class ScheduleRuleTests(unittest.TestCase):
    def test_hours_must_sit_in_the_band_and_the_week_worked_so_far_under_its_top(self):
        full = "ba:jobdemand_fulltime"
        self.assertEqual(unmet(full), [])
        self.assertEqual(unmet(full, employee={"assignedWeeklyHours": 25}), [full])
        self.assertEqual(unmet(full, employee={"workedHoursThisWeek": 55}), [full])

    def test_days_a_week_count_the_days_assigned(self):
        four = "ba:jobdemand_fourdaysweek"
        self.assertEqual(unmet(four), [four])
        self.assertEqual(unmet(four, employee={"assignedWeeklyDays": {"$items": [1, 2, 3, 4]}}), [])

    def test_free_weekends_mean_no_saturday_or_sunday_assigned(self):
        weekends = "ba:jobdemand_freeweekends"
        self.assertEqual(unmet(weekends), [])
        self.assertEqual(unmet(weekends, employee={"assignedWeeklyDays": {"$items": [1, 6]}}), [weekends])

    def test_a_shift_touching_the_window_on_an_open_day_breaks_it(self):
        mornings = "ba:jobdemand_nomornings"
        self.assertEqual(unmet(mornings, reg=building(shifts=[shift(1, 10, 18)])), [])
        self.assertEqual(unmet(mornings, reg=building(shifts=[shift(1, 9, 17)])), [mornings])
        # A day the building is closed does not count.
        self.assertEqual(unmet(mornings, reg=building(shifts=[shift(6, 8, 12)], open_days=(1,))), [])
        # Somebody else's shift is not this employee's.
        self.assertEqual(unmet(mornings, reg=building(shifts=[shift(1, 8, 12, eid="e2")])), [])

    def test_no_nights_covers_both_sides_of_midnight(self):
        nights = "ba:jobdemand_nonights"
        self.assertEqual(unmet(nights, reg=building(shifts=[shift(1, 2, 6)])), [nights])
        self.assertEqual(unmet(nights, reg=building(shifts=[shift(1, 21, 23)])), [nights])
        self.assertEqual(unmet(nights, reg=building(shifts=[shift(1, 4, 22)])), [])

    def test_no_cleaning_shifts(self):
        cleaning = "ba:jobdemand_nocleaning"
        self.assertEqual(unmet(cleaning, reg=building(shifts=[shift(1, 8, 12)])), [])
        self.assertEqual(unmet(cleaning, reg=building(shifts=[shift(1, 8, 12, kind=0)])), [cleaning])
        self.assertEqual(unmet(cleaning, reg=building(shifts=[shift(1, 8, 12, kind=0)], closed=True)), [])


class EquipmentRuleTests(unittest.TestCase):
    def test_desk_items_are_read_from_the_employees_own_workstation(self):
        pad = "ba:jobdemand_hasmousepad"
        self.assertEqual(unmet(pad, reg=building(items=[item("mousepad")])), [pad])
        at_desk = {"assignedWorkStationItems": {"$items": ["ba:itemname_computer", "ba:itemname_mousepad"]}}
        self.assertEqual(unmet(pad, employee=at_desk), [])

    def test_a_chair_demand_accepts_the_chairs_the_game_counts_for_it(self):
        chair = "ba:jobdemand_seatedatofficechair"
        eames = {"assignedWorkStationItems": {"$items": ["ba:itemname_eameschair"]}}
        self.assertEqual(unmet(chair, employee=eames), [])

    def test_building_items_count_anywhere_in_the_building(self):
        cooler = "ba:jobdemand_watercooler"
        self.assertEqual(unmet(cooler), [cooler])
        self.assertEqual(unmet(cooler, reg=building(items=[item("waterfountain")])), [])

    def test_only_an_item_with_display_slots_must_hold_stock(self):
        fridge, coffee = "ba:jobdemand_standardfridge", "ba:jobdemand_coffeemachine"
        self.assertEqual(unmet(fridge, reg=building(items=[item("standardfridge")])), [])
        self.assertEqual(unmet(coffee, reg=building(items=[item("industrialcoffeemachine")])), [coffee])
        filled = item("industrialcoffeemachine", cargo=[("ba:itemname_cupofcoffee", 5)])
        self.assertEqual(unmet(coffee, reg=building(items=[filled])), [])


class EnvironmentRuleTests(unittest.TestCase):
    def plan(self, level, manager="hr", replaced=False):
        return [{"id": "p1", "assignedEmployeeId": manager,
                 "healthInsurancePlan": {"planType": level}}], replaced

    def test_insurance_needs_an_active_plan_at_the_level_or_better(self):
        gold, bronze = "ba:jobdemand_goldhealthinsurance", "ba:jobdemand_bronzehealthinsurance"
        on_plan = {"assignedHrManagerPlanId": "p1"}
        hr = employee([], eid="hr")
        hr["assignedAddress"] = None
        plans = [{"id": "p1", "assignedEmployeeId": "hr", "healthInsurancePlan": {"planType": 1}}]

        def check(demand, plans, staff_extra=()):
            b = evaluate([employee([demand], **on_plan), *staff_extra], plans=plans)
            return [d["slug"] for d in b["staffDemands"]]

        self.assertEqual(check(bronze, plans, [hr]), [])
        self.assertEqual(check(gold, plans, [hr]), [gold])
        self.assertEqual(check(bronze, plans), [bronze], "no HR manager, no cover")
        self.assertEqual(check(bronze, plans, [dict(hr, isBeingReplaced=True)]), [bronze])
        self.assertEqual(unmet(bronze), [bronze], "on nobody's plan")

    def test_a_happy_boss_is_the_players_own_happiness(self):
        boss = "ba:jobdemand_peacefulworkenvironment"
        self.assertEqual(unmet(boss, happiness=50), [])
        self.assertEqual(unmet(boss, happiness=49), [boss])

    def test_clean_workplace_reads_the_buildings_dirt(self):
        clean = "ba:jobdemand_cleanworkplace"
        self.assertEqual(unmet(clean), [])
        self.assertEqual(unmet(clean, reg=building(dirt=[30, 30, 0, 0])), [clean])

    def test_cleanliness_scores_like_the_game(self):
        score = lambda dirt: _cleanliness(Save({}, {}, ""), building(dirt=dirt))
        self.assertEqual(score([]), 100.0)
        self.assertEqual(score([4, 4, 4]), 100.0, "dirt under 5 is not visible")
        # visible 60/4 = 15, all 60/4 = 15: 100 - 15 - 15.
        self.assertEqual(score([30, 30, 0, 0]), 70.0)
        self.assertEqual(score([100, 100]), 0.0)


class JobDemandFindingTests(unittest.TestCase):
    def alerts(self, b):
        supply = {"graph": {"links": []}, "shops": [], "idle": [], "nextImportWeekday": None, "imports": []}
        result = _alerts([b], supply, [], [], [], [], [], 8, 1000000)
        return [a for a in result["lines"] + result["minor"]["rows"]
                if a["group"] in ("jobdemand", "companydemand")]

    def test_every_unmet_demand_is_named_with_its_count_and_priority(self):
        staff = [employee(["ba:jobdemand_hasmousepad", "ba:jobdemand_fulltime"], eid="a", assignedWeeklyHours=20),
                 employee(["ba:jobdemand_hasmousepad"], eid="b")]
        [line] = self.alerts(evaluate(staff))
        self.assertEqual((line["level"], line["group"], line["siteKey"]), ("warn", "jobdemand", KEY))
        self.assertEqual(line["text"], "2 staff with unmet demands: "
                         "Full-time for 1 (critical), Mouse Pad for 2 (nice to have)")

    def test_a_quit_warning_makes_the_line_critical(self):
        staff = [employee(["ba:jobdemand_hasmousepad"], hasSendQuitWarning=True)]
        [line] = self.alerts(evaluate(staff))
        self.assertEqual(line["level"], "critical")
        self.assertTrue(line["text"].endswith("; 1 of them has warned they will quit"))
        two = [employee(["ba:jobdemand_hasmousepad"], eid=e, hasSendQuitWarning=True) for e in "ab"]
        [line] = self.alerts(evaluate(two))
        self.assertTrue(line["text"].endswith("; 2 of them have warned they will quit"))

    def test_a_quit_warning_from_somebody_with_every_demand_met_is_not_counted(self):
        staff = [employee(["ba:jobdemand_hasmousepad"], eid="a"),
                 employee(["ba:jobdemand_fulltime"], eid="b", hasSendQuitWarning=True)]
        b = evaluate(staff)
        self.assertEqual((b["quitWarnings"], b["staffLacking"]), (0, 1))
        [line] = self.alerts(b)
        self.assertEqual(line["level"], "warn")

    def test_hours_and_days_have_upper_bounds_too(self):
        self.assertEqual(unmet("ba:jobdemand_fulltime", employee={"assignedWeeklyHours": 55}),
                         ["ba:jobdemand_fulltime"])
        five = {"assignedWeeklyDays": {"$items": [1, 2, 3, 4, 5]}, "workedDays": 6}
        self.assertEqual(unmet("ba:jobdemand_fivedaysweek", employee=five), ["ba:jobdemand_fivedaysweek"])

    def test_a_right_roster_over_the_week_worked_says_it_was_the_hours_worked(self):
        full = "ba:jobdemand_fulltime"
        staff = [employee([full], eid=e, assignedWeeklyHours=36, workedHoursThisWeek=55) for e in "ab"]
        b = evaluate(staff)
        self.assertEqual(b["staffDemands"][0]["workedOver"], {"count": 2, "max": 50, "unit": "hours"})
        [line] = self.alerts(b)
        self.assertEqual(line["text"], "2 staff with unmet demands: "
                         "Full-time for 2 (critical, worked over 50 hours this week)")

    def test_a_roster_outside_the_band_is_a_roster_failure_whatever_was_worked(self):
        full = "ba:jobdemand_fulltime"
        staff = [employee([full], eid="a", assignedWeeklyHours=25),
                 employee([full], eid="b", assignedWeeklyHours=55, workedHoursThisWeek=60)]
        b = evaluate(staff)
        self.assertNotIn("workedOver", b["staffDemands"][0])
        [line] = self.alerts(b)
        self.assertEqual(line["text"], "2 staff with unmet demands: Full-time for 2 (critical)")

    def test_mixed_causes_count_the_ones_that_only_worked_over(self):
        full = "ba:jobdemand_fulltime"
        staff = [employee([full], eid="a", assignedWeeklyHours=25),
                 employee([full], eid="b", workedHoursThisWeek=51),
                 employee([full], eid="c", workedHoursThisWeek=58)]
        [line] = self.alerts(evaluate(staff))
        self.assertEqual(line["text"], "3 staff with unmet demands: "
                         "Full-time for 3 (critical, 2 worked over 50 hours this week)")

    def test_a_days_demand_names_the_days_worked(self):
        five = "ba:jobdemand_fivedaysweek"
        staff = [employee([five], workedDays=6)]
        b = evaluate(staff)
        self.assertEqual(b["staffDemands"][0]["workedOver"], {"count": 1, "max": 5, "unit": "days"})
        [line] = self.alerts(b)
        self.assertEqual(line["text"], "1 staff with unmet demands: "
                         "Five days a week for 1 (important, worked over 5 days this week)")

    def test_staff_at_no_site_or_somewhere_else_are_not_counted(self):
        away = [employee(["ba:jobdemand_hasmousepad"], eid="a", assignedAddress=None),
                employee(["ba:jobdemand_hasmousepad"], eid="b",
                         assignedAddress={"streetName": "ba:street_elsewhere", "streetNumber": 1})]
        self.assertEqual(evaluate(away)["staffDemands"], [])

    def test_insurance_and_a_happy_boss_are_one_company_line(self):
        staff = [employee(["ba:jobdemand_goldhealthinsurance", "ba:jobdemand_peacefulworkenvironment"])]
        [line] = self.alerts(evaluate(staff, happiness=10))
        self.assertEqual((line["group"], line["site"], line["siteKey"]), ("companydemand", "Company", None))
        self.assertTrue(line["text"].startswith("1 staff with demands only you can meet: "))
        self.assertIn("Gold Health Insurance for 1", line["text"])
        self.assertIn("Happy boss for 1", line["text"])
        self.assertIn("HR manager's plan", line["text"])

    def test_a_quit_warning_over_company_demands_alone_still_raises_the_site(self):
        staff = [employee(["ba:jobdemand_goldhealthinsurance"], hasSendQuitWarning=True)]
        lines = {a["group"]: a for a in self.alerts(evaluate(staff))}
        self.assertEqual(lines["jobdemand"]["level"], "critical")
        self.assertEqual(lines["jobdemand"]["text"], "1 staff with unmet demands: "
                         "Gold Health Insurance for 1 (company-wide); 1 of them has warned they will quit")
        self.assertIn("companydemand", lines)

    def test_quitters_lacking_only_company_demands_are_counted_with_everybody_else(self):
        staff = [employee(["ba:jobdemand_hasmousepad"], eid="x"),
                 employee(["ba:jobdemand_goldhealthinsurance"], eid="y", hasSendQuitWarning=True),
                 employee(["ba:jobdemand_goldhealthinsurance"], eid="z", hasSendQuitWarning=True)]
        [line] = [a for a in self.alerts(evaluate(staff)) if a["group"] == "jobdemand"]
        self.assertEqual(line["text"], "3 staff with unmet demands: Gold Health Insurance for 2 "
                         "(company-wide), Mouse Pad for 1 (nice to have); 2 of them have warned they will quit")

    def test_a_site_not_trading_yet_still_reports_its_staff(self):
        b = evaluate([employee(["ba:jobdemand_hasmousepad", "ba:jobdemand_goldhealthinsurance"])])
        b.update(revenue=0, opened=7)  # opened yesterday, nothing booked: a silent site
        supply = {"graph": {"links": []}, "shops": [], "idle": [], "nextImportWeekday": None, "imports": []}
        result = _alerts([b], supply, [], [], [], [], [], 8, 1000000)
        groups = sorted(a["group"] for a in result["lines"] + result["minor"]["rows"])
        self.assertIn("notrading", groups, "the site really is folded into not trading yet")
        self.assertIn("jobdemand", groups)
        self.assertIn("companydemand", groups)

    def test_a_demand_listed_twice_counts_the_person_once(self):
        staff = [employee(["ba:jobdemand_hasmousepad", "ba:jobdemand_hasmousepad"])]
        self.assertEqual([d["count"] for d in evaluate(staff)["staffDemands"]], [1])

    def test_met_demands_raise_nothing_and_unknown_ones_are_skipped(self):
        staff = [employee(["ba:jobdemand_fulltime", "ba:jobdemand_somethingnew"])]
        self.assertEqual(self.alerts(evaluate(staff)), [])

    def test_every_demand_the_game_ships_has_a_known_kind_and_priority(self):
        kinds = {"hours", "days", "daysoff", "noshift", "nocleaning", "desk", "building",
                 "insurance", "happiness", "clean"}
        self.assertEqual(len(JOB_DEMANDS), 35)  # the 35 JobDemand assets at build 3680
        for slug, (kind, _setting, priority) in JOB_DEMANDS.items():
            self.assertIn(kind, kinds, slug)
            self.assertIn(priority, (0, 1, 2), slug)

    def test_the_web_build_ships_the_demand_names(self):
        self.assertTrue(ships("ba:jobdemand_hasmousepad", "Mouse Pad"))


if __name__ == "__main__":
    unittest.main()
