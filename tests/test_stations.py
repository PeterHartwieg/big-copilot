"""Every employee station with a Customer Capacity serves a queue, and each role is its own.

The station table used to see only the Customer Service stations, which is why
gyms, hairdressers, theatres and nightclubs got no staffing findings at all: a
site whose stations want different skills is only as fast as its slowest role.
"""
import json
import os
import sys
import unittest

from ba_dashboard import (
    SERVICE_SKILL,
    _alerts,
    _business,
    _hour_findings,
    _hourly,
    _service_stations,
    _serves,
)
from ba_save import Names, Save

BOARD = "ba:itemname_fitnessplanningboard"
BOOTH = "ba:itemname_boothticket"
PROJECTION = "ba:itemname_boothprojection"
COSTUME = "ba:itemname_boothcostume"
DRESSING = "ba:itemname_dressingroom"
CHAIR = "ba:itemname_hairdresserchair"
WASH = "ba:itemname_hairdresserheadwash"
TRAINER = "ba:skill_gymtrainer"
STYLIST = "ba:skill_hairstylist"
ACTOR = "ba:skill_actor"
PROJECTIONIST = "ba:skill_projectionist"
STAGECREW = "ba:skill_stagecrew"
SERVICE = "ba:skill_customerservice"
CLEANING = "ba:skill_cleaning"
GYM = "ba:businesstype_gym"
THEATRE = "ba:businesstype_theater"
HAIRDRESSER = "ba:businesstype_hairdresser"
MONDAY = 1  # day % 7; days 1 and 8 give Monday two weeks of reports
STREET = "ba:street_oceancrestroad"
EMPTY_SUPPLY = {"graph": {"links": []}, "shops": [], "idle": [], "nextImportWeekday": None,
                "imports": []}


def page(name, skill, capacity):
    """A station's F1 page, as the game writes it."""
    out = f"**{name}** is a special *employee station* that requires employees with [{name}]"
    if skill:
        out += f"(skill-{skill.split('_', 1)[-1]}) skill."
    if capacity:
        out += f"\n\n**Customer Capacity:** {capacity}"
    return out


NAMES = Names(dict({
    f"help_{BOARD}_content": page("Fitness Planning Board", TRAINER, 20),
    f"help_{BOOTH}_content": page("Ticket Booth", SERVICE, 50),
    f"help_{PROJECTION}_content": page("Projection Booth", PROJECTIONIST, 25),
    f"help_{COSTUME}_content": page("Costume Booth", STAGECREW, 100),
    f"help_{DRESSING}_content": page("Dressing Room", ACTOR, 80),
    f"help_{CHAIR}_content": page("Hairdresser Chair", STYLIST, 5),
    f"help_{WASH}_content": page("Hairdresser Headwash", STYLIST, 10),
    # Holds products, serves nobody.
    "help_ba:itemname_clothingrack_content": page("Clothing Rack", None, 10),
    # An employee station with no queue to hold.
    "help_ba:itemname_cleaningstation_content": page("Cleaning Station", CLEANING, None),
}, **{
    slug: label for slug, label in {
        BOARD: "Fitness Planning Board", BOOTH: "Ticket Booth", PROJECTION: "Projection Booth",
        COSTUME: "Costume Booth", DRESSING: "Dressing Room", CHAIR: "Hairdresser Chair",
        WASH: "Hairdresser Headwash", TRAINER: "Gym Trainer", STYLIST: "Hair Stylist",
        ACTOR: "Actor", PROJECTIONIST: "Projectionist", STAGECREW: "Stage Crew",
        SERVICE: "Customer Service", CLEANING: "Cleaning",
    }.items()
}))


def shift(employee, post, start, end, kind=1):
    return {"employeeId": employee, "itemInstanceId": post, "startingHour": start,
            "endingHour": end, "type": kind}


def building(items, shifts, hourly, door, btype=GYM, number=3, name="Pump"):
    """A rented site with Monday's roster and the same Monday reported twice."""
    reports = {"$items": [{"hour": h, "customers": c} for h, c in hourly.items()]}
    return {
        "BusinessName": name,
        "businessTypeName": btype,
        "StreetName": STREET,
        "StreetNumber": number,
        "creationDay": 1,
        "customerCapacity": door,
        "orderHistory": {"$items": [
            {"dayNumber": day, "totalCustomers": sum(hourly.values()), "hourReports": reports}
            for day in (1, 8)
        ]},
        "itemInstances": {"$items": [{"$v": {"id": i, "itemName": slug}} for i, slug in items]},
        "cachedFulfilledCustomerDemands": {"$items": []},
        "retailPrices": {"$items": []},
        "scheduleDays": {"$items": [{"day": MONDAY, "workShifts": {"$items": shifts}}]},
    }


def site(name="Pump", number=3, basket=12.0):
    return {"key": f"{STREET}#{number}", "status": "retail", "name": name, "basket": basket}


def grid_of(b, crew, stations, name="Pump", basket=12.0):
    [grid] = _hourly(
        Save({}, {}, ""), [b],
        [site(name, number=b["StreetNumber"], basket=basket)],
        stations, set(), crew, NAMES,
    )
    return grid


class StationTableTests(unittest.TestCase):
    def test_a_station_names_the_skill_it_asks_for(self):
        stations = _service_stations(NAMES)
        self.assertEqual(stations[BOARD], (TRAINER, 20))
        self.assertEqual(stations[BOOTH], (SERVICE_SKILL, 50))

    def test_furniture_that_holds_but_does_not_serve_stays_out(self):
        self.assertEqual(sorted(_service_stations(NAMES)),
                         sorted([BOARD, BOOTH, PROJECTION, COSTUME, DRESSING, CHAIR, WASH]))

    def test_every_station_with_a_customer_capacity_is_in_the_shipped_table(self):
        """The 17 serving stations of build 3680, keyed by the skill each asks for.

        Fridges, shelves, gym mats and the cinema screen carry a Customer
        Capacity and must never join them; the cleaning station and the guard
        locker are employee stations with no queue, and stay out too.
        """
        path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "web", "py", "gametext.json")
        with open(path, encoding="utf-8") as fh:
            shipped = _service_stations(Names(json.load(fh)))
        self.assertEqual(len(shipped), 17)
        self.assertEqual(
            {skill for skill, _rate in shipped.values()},
            {SERVICE_SKILL, TRAINER, STYLIST, ACTOR, PROJECTIONIST, STAGECREW, "ba:skill_dj"},
        )
        for slug in ("ba:itemname_clothingrack", "ba:itemname_cleaningstation",
                     "ba:itemname_securityguardlocker", "ba:itemname_screencinema",
                     "ba:itemname_treadmill", "ba:itemname_industrialcoffeemachine"):
            self.assertNotIn(slug, shipped)


class ServesTests(unittest.TestCase):
    def test_the_station_decides_the_skill(self):
        self.assertTrue(_serves("retail", TRAINER, TRAINER))
        self.assertFalse(_serves("retail", SERVICE, TRAINER))
        self.assertFalse(_serves("retail", None, TRAINER))

    def test_an_office_still_takes_every_professional_but_a_cleaner(self):
        self.assertTrue(_serves("office", "ba:skill_lawyer"))
        self.assertFalse(_serves("office", CLEANING))


class GymGridTests(unittest.TestCase):
    """A gym was invisible before: its boards are not Customer Service stations."""

    def gym(self, boards=3, on=None, customers=40):
        """`boards` fitness planning boards, `on` trainers posted to them, 8-20 Monday."""
        on = boards if on is None else on
        items = [(i + 1, BOARD) for i in range(boards)]
        crew = {str(i + 1): TRAINER for i in range(on)}
        shifts = [shift(str(i + 1), (i % boards) + 1, 8, 20) for i in range(on)]
        hourly = {h: customers if 8 <= h < 20 else 0 for h in range(24)}
        b = building(items, shifts, hourly, 100)
        return grid_of(b, crew, _service_stations(NAMES))

    def test_the_boards_are_the_capacity_and_the_trainers_are_on_them(self):
        grid = self.gym()
        self.assertEqual((grid["counters"], grid["stationCount"]), (60, 3))
        monday = grid["staffed"][MONDAY]
        self.assertEqual((monday[8], monday[19], monday[20]), (60, 60, 0))
        self.assertEqual(grid["onShift"][MONDAY][10], 3)

    def test_the_one_role_carries_the_grid_the_page_reads(self):
        grid = self.gym()
        [role] = grid["roles"]
        self.assertEqual((role["skill"], role["label"]), (TRAINER, "Gym Trainer"))
        self.assertEqual((role["station"], role["counters"]), ("Fitness Planning Board", 60))
        self.assertEqual(role["staffed"][MONDAY], grid["staffed"][MONDAY])
        self.assertEqual(role["onShift"][MONDAY], grid["onShift"][MONDAY])

    def test_full_boards_name_the_board_and_never_a_counter(self):
        grid = self.gym(boards=2, customers=40)
        [finding] = _hour_findings([grid], [site()], {})
        self.assertEqual((finding["limit"], finding["noun"]),
                         ("Gym Trainer cover", "fitness planning boards"))
        self.assertEqual(finding["fix"], "another fitness planning board")

    def test_short_of_trainers_ask_for_a_trainer_and_not_a_counter(self):
        grid = self.gym(boards=3, on=2, customers=40)
        [finding] = _hour_findings([grid], [site()], {})
        self.assertEqual((finding["limit"], finding["fix"]),
                         ("Gym Trainer cover", "another Gym Trainer on those hours"))

    def test_spare_trainers_are_overstaffing_in_their_own_wage(self):
        """Three trainers on two boards: one of them buys nothing."""
        grid = self.gym(boards=2, on=3, customers=10)
        # A cleaner's wage at the site prices nothing here; the wage that counts
        # is the trainer's, found through the role it belongs to.
        wages = {grid["key"]: {CLEANING: 900.0, TRAINER: 105.0}}
        [idle] = _hour_findings([grid], [site()], wages)
        self.assertEqual((idle["staff"], idle["spare"], idle["from"], idle["to"]), (3, 24, 8, 20))
        self.assertEqual(idle["noun"], "fitness planning boards")
        self.assertEqual(idle["worth"], 360.0)

        business = _business(Save({}, {}, ""), NAMES,
                             building([], [], {9: 1}, 50),
                             (STREET, 3), {(STREET, 3): {"TotalSales": 1000}}, [], {}, 3)
        [line] = [a for a in _alerts([business], EMPTY_SUPPLY, [], [], [], [idle], [], 3, 0.0)
                  ["lines"] if a["group"] == "idlestaff"]
        self.assertIn("Pump runs 3 fitness planning boards 08:00-20:00 on a Monday", line["text"])


class TheatreGridTests(unittest.TestCase):
    """A theatre asks for four skills; the site is only as fast as its slowest."""

    def theatre(self, projectionists=1, booths=1):
        items = [
            (1, BOOTH),      # ticket booth, 50/h
            (2, PROJECTION),  # `booths` projection booths, 25/h each
            (3, COSTUME),     # costume booth, 100/h
            (4, DRESSING),    # dressing room, 80/h
        ] + [(5 + i, PROJECTION) for i in range(booths - 1)]
        crew = {"t": SERVICE, "t2": SERVICE, "p": PROJECTIONIST,
                "c": STAGECREW, "a": ACTOR}
        shifts = [
            shift("t", 1, 8, 20), shift("t2", 1, 8, 20),
            shift("c", 3, 8, 20), shift("a", 4, 8, 20),
            shift("p", 2, 8, 20),
        ] if projectionists else [
            shift("t", 1, 8, 20), shift("t2", 1, 8, 20),
            shift("c", 3, 8, 20), shift("a", 4, 8, 20),
        ]
        hourly = {h: 25 if 8 <= h < 20 else 0 for h in range(24)}
        b = building(items, shifts, hourly, 200, btype=THEATRE, number=7, name="Playhouse")
        return grid_of(b, crew, _service_stations(NAMES), name="Playhouse", basket=20.0)

    def test_the_site_is_only_as_fast_as_its_slowest_role(self):
        grid = self.theatre()
        self.assertEqual([r["skill"] for r in grid["roles"]],
                         [ACTOR, SERVICE, PROJECTIONIST, STAGECREW])
        self.assertEqual(sorted(r["counters"] for r in grid["roles"]), [25, 50, 80, 100])
        self.assertEqual(grid["counters"], 25)  # the projection booth, not the 255 installed
        self.assertEqual(grid["staffed"][MONDAY][10], 25)
        self.assertEqual(grid["onShift"][MONDAY][10], 1)  # the projectionist alone binds

    def test_a_role_left_unmanned_stops_the_site(self):
        grid = self.theatre(projectionists=0)
        self.assertEqual(grid["staffed"][MONDAY][10], 0)
        self.assertEqual(grid["onShift"][MONDAY][10], 0)
        projection = next(r for r in grid["roles"] if r["skill"] == PROJECTIONIST)
        costume = next(r for r in grid["roles"] if r["skill"] == STAGECREW)
        self.assertEqual(projection["staffed"][MONDAY][10], 0)
        self.assertEqual(costume["staffed"][MONDAY][10], 100)

    def test_the_role_that_holds_the_site_back_gets_its_own_line(self):
        """Two projection booths and one projectionist: the ceiling is his."""
        grid = self.theatre(projectionists=1, booths=2)
        [finding] = _hour_findings([grid], [site("Playhouse", number=7, basket=20.0)], {})
        self.assertEqual((finding["limit"], finding["hours"]),
                         ("Projectionist cover", 12))
        self.assertEqual((finding["fix"], finding["noun"]),
                         ("another Projectionist on those hours", "projection booths"))

    def test_the_words_do_not_move_between_runs(self):
        first, second = self.theatre(booths=2), self.theatre(booths=2)
        self.assertEqual(
            [(r["skill"], r["label"], r["station"], r["counters"]) for r in first["roles"]],
            [(r["skill"], r["label"], r["station"], r["counters"]) for r in second["roles"]],
        )
        self.assertEqual([r["station"] for r in first["roles"]],
                         ["Dressing Room", "Ticket Booth", "Projection Booth", "Costume Booth"])


class HairdresserTests(unittest.TestCase):
    def test_two_stations_of_one_role_take_the_larger_for_their_answer(self):
        items = [(1, CHAIR), (2, WASH)]
        crew = {"1": STYLIST, "2": STYLIST}
        shifts = [shift("1", 1, 9, 18), shift("2", 2, 9, 18)]
        hourly = {h: 15 if 9 <= h < 18 else 0 for h in range(24)}
        b = building(items, shifts, hourly, 20, btype=HAIRDRESSER, number=9, name="Curls")
        grid = grid_of(b, crew, _service_stations(NAMES), name="Curls", basket=30.0)
        [role] = grid["roles"]
        self.assertEqual((role["label"], role["station"], role["counters"]),
                         ("Hair Stylist", "Hairdresser Headwash", 15))
        [finding] = _hour_findings([grid], [site("Curls", number=9, basket=30.0)], {})
        self.assertEqual((finding["limit"], finding["fix"]),
                         ("Hair Stylist cover", "another hairdresser headwash"))
        self.assertEqual(finding["noun"], "hairdresser headwashes")


if __name__ == "__main__":
    unittest.main()
