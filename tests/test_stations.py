"""Every employee station with a Customer Capacity serves a queue, and each role is its own.

The station table used to see only the Customer Service stations, which is why
gyms, hairdressers, theatres and nightclubs got no staffing findings at all: a
site whose stations want different skills is only as fast as its slowest role.
"""
import hashlib
import json
import os
import subprocess
import sys
import unittest

from ba_dashboard import (
    SERVICE_SKILL,
    _alerts,
    _business,
    _hour_findings,
    _hourly,
    _service_stations,
    _service_wages,
    _serves,
    money,
)
from ba_save import Names, Save

BOARD = "ba:itemname_fitnessplanningboard"
BOOTH = "ba:itemname_boothticket"
PROJECTION = "ba:itemname_boothprojection"
COSTUME = "ba:itemname_boothcostume"
DRESSING = "ba:itemname_dressingroom"
REGISTER = "ba:itemname_cashregister"
DJBOOTH = "ba:itemname_djbooth"
COAT = "ba:itemname_coatcheckleft"
CHAIR = "ba:itemname_hairdresserchair"
WASH = "ba:itemname_hairdresserheadwash"
TRAINER = "ba:skill_gymtrainer"
STYLIST = "ba:skill_hairstylist"
ACTOR = "ba:skill_actor"
PROJECTIONIST = "ba:skill_projectionist"
STAGECREW = "ba:skill_stagecrew"
DJ = "ba:skill_dj"
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
    f"help_{REGISTER}_content": page("Cash Register", SERVICE, 20),
    f"help_{DJBOOTH}_content": page("DJ Booth", DJ, 50),
    f"help_{COAT}_content": page("Coat Check Left", SERVICE, 50),
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
        REGISTER: "Cash Register", DJBOOTH: "DJ Booth", COAT: "Coat Check Left", DJ: "DJ",
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
                         sorted([BOARD, BOOTH, PROJECTION, REGISTER, DJBOOTH, COAT,
                                 COSTUME, DRESSING, CHAIR, WASH]))

    def test_every_station_with_a_customer_capacity_is_in_the_shipped_table(self):
        """The 17 serving stations of build 3680, each with its skill and its rate.

        Read as triples, not as a count and a set: a register that came back
        asking for a DJ, or a booth that lost its rate, has to fail here.
        Fridges, shelves, gym mats and the cinema screen carry a Customer
        Capacity and must never join them; the cleaning station and the guard
        locker are employee stations with no queue, and stay out too.
        """
        path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "web", "py", "gametext.json")
        with open(path, encoding="utf-8") as fh:
            shipped = _service_stations(Names(json.load(fh)))
        expected = [
            ("ba:itemname_boothcostume", "ba:skill_stagecrew", 100),
            ("ba:itemname_boothlighting", "ba:skill_stagecrew", 100),
            ("ba:itemname_boothprojection", PROJECTIONIST, 25),
            ("ba:itemname_boothsound", STAGECREW, 100),
            ("ba:itemname_boothticket", SERVICE_SKILL, 50),
            ("ba:itemname_cashregister", SERVICE_SKILL, 20),
            ("ba:itemname_checkoutcounterleft", SERVICE_SKILL, 30),
            ("ba:itemname_checkoutcounterright", SERVICE_SKILL, 30),
            ("ba:itemname_coatcheckleft", SERVICE_SKILL, 50),
            ("ba:itemname_coatcheckright", SERVICE_SKILL, 50),
            ("ba:itemname_concessionsstandregister", SERVICE_SKILL, 50),
            ("ba:itemname_djbooth", "ba:skill_dj", 50),
            ("ba:itemname_dressingroom", ACTOR, 80),
            ("ba:itemname_fitnessplanningboard", TRAINER, 20),
            ("ba:itemname_hairdresserchair", STYLIST, 5),
            ("ba:itemname_hairdresserchairmodern", STYLIST, 5),
            ("ba:itemname_hairdresserheadwash", STYLIST, 10),
        ]
        self.assertEqual(sorted((slug, skill, rate) for slug, (skill, rate) in shipped.items()),
                         expected)
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


LAWYER = "ba:skill_lawyer"
LAW = "ba:businesstype_lawfirm"
SECOND = "ba:street_secondavenue"


def person(addr, skill, wage):
    return {"addr": addr, "skill": skill, "wage": wage}


class WageTests(unittest.TestCase):
    """The wage that prices idle hours arrives through the extraction's own loop."""

    def test_an_office_stores_its_professionals_under_the_role_it_looks_up(self):
        # The office role is built with no skill of its own, so its wage has to
        # sit under that same None key or no office is ever called overstaffed.
        addr = (SECOND, 10)
        wages = _service_wages(
            [person(addr, LAWYER, 700.0), person(addr, CLEANING, 90.0)],
            {f"{SECOND}#10": "office"},
        )
        self.assertEqual(dict(wages[f"{SECOND}#10"]), {None: 700.0})

    def test_a_retail_site_stores_each_skill_under_itself(self):
        addr = (SECOND, 12)
        wages = _service_wages(
            [person(addr, TRAINER, 105.0), person(addr, TRAINER, 130.0),
             person(addr, CLEANING, 900.0)],
            {f"{SECOND}#12": "retail"},
        )
        self.assertEqual(dict(wages[f"{SECOND}#12"]), {TRAINER: 130.0, CLEANING: 900.0})

    def test_an_offices_idle_professionals_are_found_through_that_loop(self):
        """End to end: the grid, the wage loop, then the finding.

        A regression for the round where the office wage went in under the
        lawyers' own skill and every office lost its overstaffing finding.
        """
        items = [(i, "ba:itemname_computer") for i in range(1, 7)]
        crew = {str(i): LAWYER for i in range(1, 7)}
        shifts = [shift(str(i), i, 9, 13) for i in range(1, 7)]
        hourly = {h: 2 if 9 <= h < 13 else 0 for h in range(24)}
        key = f"{STREET}#10"
        b = building(items, shifts, hourly, 50, btype=LAW, number=10, name="HART. &Partners")
        [grid] = _hourly(Save({}, {}, ""), [b],
                         [{"key": key, "status": "office",
                           "name": "HART. &Partners", "basket": 388.0}],
                         {}, {"ba:itemname_computer"}, crew, NAMES)
        wages = _service_wages(
            [person((STREET, 10), LAWYER, 146.0), person((STREET, 10), CLEANING, 90.0)],
            {key: "office"},
        )
        [idle] = _hour_findings([grid], [{"key": grid["key"], "name": grid["name"]}], wages)
        self.assertEqual((idle["staff"], idle["spare"]), (6, 16))
        self.assertEqual(idle["worth"], money(16 * 146.0 / 7))
        self.assertIsNone(idle["noun"])


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
                         ("fitness planning boards", "fitness planning boards"))
        self.assertEqual(finding["fix"], "another fitness planning board")

    def test_short_of_trainers_ask_for_a_trainer_and_not_a_counter(self):
        grid = self.gym(boards=3, on=2, customers=40)
        [finding] = _hour_findings([grid], [site()], {})
        self.assertEqual((finding["limit"], finding["fix"]),
                         ("Gym Trainer staffing", "another Gym Trainer on those hours"))

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

    def test_one_trainer_then_two_give_two_findings_with_two_ids(self):
        """Mornings are short of a trainer, afternoons short of a board.

        Both are the same role at the same site, so the limit has to say which
        one it means: a shared id would silence both lines with one click.
        """
        items = [(1, BOARD), (2, BOARD)]
        crew = {"1": TRAINER, "2": TRAINER}
        shifts = [shift("1", 1, 8, 20), shift("2", 2, 14, 20)]
        hourly = {h: (20 if h < 14 else 40) if 8 <= h < 20 else 0 for h in range(24)}
        b = building(items, shifts, hourly, 100)
        grid = grid_of(b, crew, _service_stations(NAMES))
        findings = _hour_findings([grid], [site()], {})
        self.assertEqual([(f["limit"], f["fix"]) for f in findings], [
            ("Gym Trainer staffing", "another Gym Trainer on those hours"),
            ("fitness planning boards", "another fitness planning board"),
        ])
        business = _business(Save({}, {}, ""), NAMES,
                             building([], [], {9: 1}, 50),
                             (STREET, 3), {(STREET, 3): {"TotalSales": 1000}}, [], {}, 3)
        lines = [a for a in _alerts([business], EMPTY_SUPPLY, [], [], [], findings, [], 3, 0.0)
                 ["lines"] if a["group"] == "atcap"]
        self.assertEqual(len(lines), 2)
        self.assertEqual(len({a["id"] for a in lines}), 2)
        self.assertTrue(any("another Gym Trainer" in a["text"] for a in lines))
        self.assertTrue(any("another fitness planning board" in a["text"] for a in lines))


class BindingRoleTests(unittest.TestCase):
    """Every role standing at the site's minimum is holding the site back."""

    def test_a_fully_manned_role_tied_at_the_minimum_is_named_too(self):
        """A gym with two boards and one register, one trainer and one cashier.

        The trainer role is 20 of 40 and the service role 20 of 20, so the site
        serves 20 an hour and both hold it there. Hiring a second trainer alone
        buys nothing while the single register is still 20: the page has to ask
        for the register as well.
        """
        items = [(1, BOARD), (2, BOARD), (3, REGISTER)]
        crew = {"t": TRAINER, "c": SERVICE}
        shifts = [shift("t", 1, 8, 20), shift("c", 3, 8, 20)]
        hourly = {h: 25 if 8 <= h < 20 else 0 for h in range(24)}
        b = building(items, shifts, hourly, 100)
        grid = grid_of(b, crew, _service_stations(NAMES))
        self.assertEqual(grid["staffed"][MONDAY][10], 20)
        by_skill = {r["skill"]: (r["staffed"][MONDAY][10], r["counters"])
                    for r in grid["roles"]}
        self.assertEqual(by_skill, {TRAINER: (20, 40), SERVICE: (20, 20)})
        findings = _hour_findings([grid], [site()], {})
        # One line, because fixing either alone moves nothing -- and because
        # the trade through those hours is one sum, not one per role.
        [finding] = findings
        self.assertEqual(
            (finding["limit"], finding["fix"], finding["noun"], finding["limits"]),
            ("Gym Trainer staffing and registers",
             "another Gym Trainer on those hours and another counter",
             "fitness planning boards and counters", 2),
        )

    def test_a_tie_prices_its_hours_once_and_not_once_per_role(self):
        """The same gym: 12 capped hours of 25 customers at a $12 basket.

        Two lines would have said $514/day each for a site whose whole trade
        through those hours is $514, inflating the materiality gate and the
        "N smaller · $X/day" sum along with it.
        """
        items = [(1, BOARD), (2, BOARD), (3, REGISTER)]
        crew = {"t": TRAINER, "c": SERVICE}
        shifts = [shift("t", 1, 8, 20), shift("c", 3, 8, 20)]
        hourly = {h: 25 if 8 <= h < 20 else 0 for h in range(24)}
        grid = grid_of(building(items, shifts, hourly, 100), crew, _service_stations(NAMES))
        findings = _hour_findings([grid], [site()], {})
        whole = money(sum(25 for _ in range(12)) * 12.0 / 7)
        self.assertEqual([f["hours"] for f in findings], [12])
        self.assertEqual(sum(f["throughput"] for f in findings), whole)
        business = _business(Save({}, {}, ""), NAMES,
                             building([], [], {9: 1}, 100), (STREET, 3),
                             {(STREET, 3): {"TotalSales": 1000}}, [], {}, 3)
        lines = [a for a in _alerts([business], EMPTY_SUPPLY, [], [], [], findings, [], 3, 0.0)
                 ["lines"] if a["group"] == "atcap"]
        self.assertEqual(len(lines), 1)
        self.assertEqual(sum(a["worth"] for a in lines), whole)
        self.assertIn("Gym Trainer staffing and registers are the limit", lines[0]["text"])
        self.assertIn("fills the fitness planning boards and counters", lines[0]["text"])

    def test_a_tie_keeps_the_capitals_inside_it(self):
        """A nightclub: a coat check and a DJ booth, both at 50 and both manned.

        Only the first character of a joined limit may be touched. Capitalising
        the whole string lowercased everything after it, and "DJ" is the game's
        own capitalisation, not a sentence that happens to start with one.
        """
        items = [(1, COAT), (2, DJBOOTH)]
        crew = {"s": SERVICE, "d": DJ}
        shifts = [shift("s", 1, 20, 24), shift("d", 2, 20, 24)]
        hourly = {h: 50 if 20 <= h < 24 else 0 for h in range(24)}
        grid = grid_of(building(items, shifts, hourly, 200), crew, _service_stations(NAMES))
        [finding] = _hour_findings([grid], [site()], {})
        self.assertEqual((finding["limit"], finding["fix"]),
                         ("registers and DJ booths", "another counter and another DJ booth"))
        business = _business(Save({}, {}, ""), NAMES,
                             building([], [], {9: 1}, 200), (STREET, 3),
                             {(STREET, 3): {"TotalSales": 1000}}, [], {}, 3)
        [line] = [a for a in _alerts([business], EMPTY_SUPPLY, [], [], [], [finding], [], 3, 0.0)
                  ["lines"] if a["group"] == "atcap"]
        self.assertIn("Registers and DJ booths are the limit", line["text"])
        self.assertNotIn("dj booths", line["text"])

    def test_an_untied_site_keeps_the_numbers_it_had(self):
        """Two boards, one trainer, no register: one role, one line, one sum."""
        items = [(1, BOARD), (2, BOARD)]
        crew = {"t": TRAINER}
        shifts = [shift("t", 1, 8, 20)]
        hourly = {h: 25 if 8 <= h < 20 else 0 for h in range(24)}
        grid = grid_of(building(items, shifts, hourly, 100), crew, _service_stations(NAMES))
        [finding] = _hour_findings([grid], [site()], {})
        self.assertEqual(
            (finding["limit"], finding["fix"], finding["noun"], finding["limits"]),
            ("Gym Trainer staffing", "another Gym Trainer on those hours",
             "fitness planning boards", 1),
        )
        self.assertEqual((finding["hours"], finding["throughput"]),
                         (12, money(12 * 25 * 12.0 / 7)))  # customers through it, not capacity

    def test_a_role_above_the_minimum_is_still_left_out(self):
        """The same gym with the register manned twice over is one finding."""
        items = [(1, BOARD), (2, BOARD), (3, REGISTER), (4, REGISTER)]
        crew = {"t": TRAINER, "c": SERVICE, "c2": SERVICE}
        shifts = [shift("t", 1, 8, 20), shift("c", 3, 8, 20), shift("c2", 4, 8, 20)]
        hourly = {h: 25 if 8 <= h < 20 else 0 for h in range(24)}
        grid = grid_of(building(items, shifts, hourly, 100), crew, _service_stations(NAMES))
        self.assertEqual(grid["staffed"][MONDAY][10], 20)  # the trainer's 20 of 40
        findings = _hour_findings([grid], [site()], {})
        self.assertEqual([(f["limit"], f["fix"]) for f in findings],
                         [("Gym Trainer staffing", "another Gym Trainer on those hours")])


class AlertIdTests(unittest.TestCase):
    """The ids a shop and an office already carry must survive this change.

    Silences live in the player's browser under the finding's id, so a shop
    told "registers is the limit" has to hash to what it hashed before the
    roles arrived. These literals are what `origin/main` computes:
    sha1("atcap:<site key>:<limit>")[:10].
    """

    def test_the_literals_are_the_formula_main_hashes(self):
        """Spelled out, so the numbers above are checkable without a checkout."""
        def mains_id(key, limit):
            return hashlib.sha1(f"atcap:{key}:{limit}".encode("utf-8")).hexdigest()[:10]
        shop, office = f"{STREET}#3", f"{STREET}#10"
        self.assertEqual(
            [mains_id(shop, "staffing"), mains_id(shop, "registers"),
             mains_id(office, "staffing"), mains_id(office, "workstations")],
            ["9e9d53ed15", "17bc0800b3", "9dd2222ded", "730309f74c"],
        )

    def alert_id(self, grid, business):
        findings = _hour_findings([grid], [business], {})
        lines = [a for a in _alerts([business], EMPTY_SUPPLY, [], [], [], findings, [], 3, 0.0)
                 ["lines"] if a["group"] == "atcap"]
        self.assertEqual(len(lines), 1)
        # The limit is the string the id hashes, so the pair pins both.
        self.assertEqual(len(findings), 1)
        return lines[0]["id"], findings[0]["limit"]

    def shop(self, registers, staff):
        items = [(i + 1, REGISTER) for i in range(registers)]
        crew = {f"c{i + 1}": SERVICE for i in range(staff)}
        shifts = [shift(f"c{i + 1}", i + 1, 8, 20) for i in range(staff)]
        hourly = {h: 40 if 8 <= h < 20 else 0 for h in range(24)}
        b = building(items, shifts, hourly, 100, number=3)
        return grid_of(b, crew, _service_stations(NAMES))

    def business(self, number=3, name="Pump"):
        return _business(Save({}, {}, ""), NAMES,
                         building([], [], {9: 1}, 100, number=number, name=name),
                         (STREET, number), {(STREET, number): {"TotalSales": 1000}},
                         [], {}, 3)

    def test_a_shop_short_of_service_staff_keeps_mains_id(self):
        # Two registers, one cashier: 20 of 40, the staffing limit.
        got, limit = self.alert_id(self.shop(registers=2, staff=1), self.business())
        self.assertEqual(limit, "staffing")
        self.assertEqual(got, "9e9d53ed15")

    def test_a_shop_out_of_registers_keeps_mains_id(self):
        # Both registers manned and still capped: the registers limit.
        got, limit = self.alert_id(self.shop(registers=2, staff=2), self.business())
        self.assertEqual(limit, "registers")
        self.assertEqual(got, "17bc0800b3")

    def test_an_office_keeps_mains_ids(self):
        items = [(i, "ba:itemname_computer") for i in range(1, 4)]
        crew = {str(i): LAWYER for i in range(1, 4)}
        hourly = {h: 3 if 9 <= h < 17 else 0 for h in range(24)}
        key = f"{STREET}#10"
        office = {"key": key, "status": "office", "name": "HART.", "basket": 388.0}
        for staff, subject, want in ((2, "staffing", "9dd2222ded"),
                                     (3, "workstations", "730309f74c")):
            shifts = [shift(str(i), i, 9, 17) for i in range(1, staff + 1)]
            b = building(items, shifts, hourly, 50, btype=LAW, number=10, name="HART.")
            [grid] = _hourly(Save({}, {}, ""), [b], [office], {},
                             {"ba:itemname_computer"}, crew, NAMES)
            business = _business(Save({}, {}, ""), NAMES,
                                 building([], [], {9: 1}, 50, btype=LAW, number=10, name="HART."),
                                 (STREET, 10), {(STREET, 10): {"TotalSales": 1000}}, [], {}, 3)
            business["status"] = "office"
            findings = _hour_findings([grid], [business], {})
            lines = [a for a in _alerts([business], EMPTY_SUPPLY, [], [], [], findings,
                                        [], 3, 0.0)["lines"] if a["group"] == "atcap"]
            self.assertEqual([f["limit"] for f in findings], [subject])
            self.assertEqual(lines[0]["id"], want)

    def test_a_new_per_role_limit_names_its_station(self):
        """The posts limit of a role the board never had before carries it."""
        items = [(1, BOARD), (2, BOARD)]
        crew = {"t": TRAINER, "t2": TRAINER}
        shifts = [shift("t", 1, 8, 20), shift("t2", 2, 8, 20)]
        hourly = {h: 45 if 8 <= h < 20 else 0 for h in range(24)}
        grid = grid_of(building(items, shifts, hourly, 100), crew, _service_stations(NAMES))
        [finding] = _hour_findings([grid], [site()], {})
        self.assertEqual(finding["limit"], "fitness planning boards")
        got, _ = self.alert_id(grid, self.business())
        self.assertNotEqual(got, "17bc0800b3")


class TheatreGridTests(unittest.TestCase):
    """A theatre asks for four skills; the site is only as fast as its slowest."""

    def theatre(self, projectionists=1, booths=1, service_booths=1, service_staff=2):
        """`service_booths` ticket booths with `service_staff` on them, 8-20 Monday."""
        items = [(1 + i, BOOTH) for i in range(service_booths)]
        items += [
            (10, PROJECTION),  # `booths` projection booths, 25/h each
            (11, COSTUME),     # costume booth, 100/h
            (12, DRESSING),    # dressing room, 80/h
        ] + [(13 + i, PROJECTION) for i in range(booths - 1)]
        crew = {"p": PROJECTIONIST, "c": STAGECREW, "a": ACTOR}
        crew.update({f"t{i + 1}": SERVICE for i in range(service_staff)})
        shifts = [shift("c", 11, 8, 20), shift("a", 12, 8, 20)]
        shifts += [shift(f"t{i + 1}", (i % service_booths) + 1, 8, 20)
                   for i in range(service_staff)]
        if projectionists:
            shifts.append(shift("p", 10, 8, 20))
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
                         ("Projectionist staffing", 12))
        self.assertEqual((finding["fix"], finding["noun"]),
                         ("another Projectionist on those hours", "projection booths"))

    def test_a_role_faster_than_the_binding_one_is_not_the_limit(self):
        """Two ticket booths, one service employee, projection fully manned.

        Projection holds the site at 25 an hour. The service employee is short
        of a second booth, but hiring one cannot raise the site while the
        projectionist is the slowest thing in it.
        """
        grid = self.theatre(service_booths=2, service_staff=1)
        service = next(r for r in grid["roles"] if r["skill"] == SERVICE)
        self.assertEqual((service["counters"], service["staffed"][MONDAY][10]), (100, 50))
        self.assertEqual(grid["staffed"][MONDAY][10], 25)
        [finding] = _hour_findings([grid], [site("Playhouse", number=7, basket=20.0)], {})
        self.assertEqual((finding["limit"], finding["fix"]),
                         ("projection booths", "another projection booth"))
        self.assertNotIn("Customer Service", finding["fix"])

    def test_the_words_do_not_move_between_runs(self):
        """The same fixture under two hash seeds names the roles in one order."""
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        script = (
            "import json, sys\n"
            "sys.path[:0] = [sys.argv[1], sys.argv[2]]\n"
            "import test_stations as T\n"
            "from ba_dashboard import _service_stations\n"
            "grid = T.TheatreGridTests().theatre(booths=2)\n"
            "print(json.dumps([(r['skill'], r['label'], r['station'], r['counters'], r['noun'])"
            " for r in grid['roles']]))\n"
        )
        seeds = []
        for seed in ("0", "1"):
            run = subprocess.run(
                [sys.executable, "-c", script, root, os.path.dirname(os.path.abspath(__file__))],
                capture_output=True, text=True, env=dict(os.environ, PYTHONHASHSEED=seed),
            )
            self.assertEqual(run.returncode, 0, run.stderr)
            seeds.append(run.stdout)
        self.assertEqual(seeds[0], seeds[1])
        self.assertEqual(json.loads(seeds[0]), [
            [ACTOR, "Actor", "Dressing Room", 80, "dressing rooms"],
            [SERVICE, "Customer Service", "Ticket Booth", 50, None],
            [PROJECTIONIST, "Projectionist", "Projection Booth", 50, "projection booths"],
            [STAGECREW, "Stage Crew", "Costume Booth", 100, "costume booths"],
        ])


class HairdresserTests(unittest.TestCase):
    def hairdresser(self, chairs=0, washes=0, number=9, name="Curls"):
        """Chairs at 5/h and headwashes at 10/h, all manned 9-18, 20 customers an hour."""
        posts = [i + 1 for i in range(chairs)] + [20 + i for i in range(washes)]
        items = [(post, CHAIR if post <= chairs else WASH) for post in posts]
        crew = {str(i + 1): STYLIST for i in range(len(posts))}
        shifts = [shift(str(i + 1), post, 9, 18) for i, post in enumerate(posts)]
        hourly = {h: 20 if 9 <= h < 18 else 0 for h in range(24)}
        b = building(items, shifts, hourly, 30, btype=HAIRDRESSER, number=number, name=name)
        return grid_of(b, crew, _service_stations(NAMES), name=name, basket=30.0)

    def test_two_stations_of_one_role_take_the_larger_for_their_answer(self):
        grid = self.hairdresser(chairs=1, washes=1)
        [role] = grid["roles"]
        self.assertEqual((role["label"], role["station"], role["counters"]),
                         ("Hair Stylist", "Hairdresser Headwash", 15))
        [finding] = _hour_findings([grid], [site("Curls", number=9, basket=30.0)], {})
        self.assertEqual((finding["limit"], finding["fix"]),
                         ("hairdresser headwashes", "another hairdresser headwash"))
        self.assertEqual(finding["noun"], "hairdresser headwashes")

    def test_two_sites_short_of_different_stations_are_two_lines(self):
        """Same role, same ceiling, same hours, two different answers.

        A shop short of chairs and one short of a headwash share a limit
        phrase, so the grouping has to look at the answer too: merged, the
        second shop is told to buy the first one's station.
        """
        curls = self.hairdresser(chairs=4, number=9, name="Curls")
        braids = self.hairdresser(washes=2, number=11, name="Braids")
        findings = _hour_findings(
            [curls, braids],
            [site("Curls", number=9, basket=30.0), site("Braids", number=11, basket=30.0)],
            {},
        )
        self.assertEqual([(f["site"], f["fix"], f["noun"]) for f in findings], [
            ("Curls", "another hairdresser chair", "hairdresser chairs"),
            ("Braids", "another hairdresser headwash", "hairdresser headwashes"),
        ])
        businesses = [
            _business(Save({}, {}, ""), NAMES,
                      building([], [], {9: 1}, 30, btype=HAIRDRESSER, number=9, name="Curls"),
                      (STREET, 9), {(STREET, 9): {"TotalSales": 1000}}, [], {}, 3),
            _business(Save({}, {}, ""), NAMES,
                      building([], [], {9: 1}, 30, btype=HAIRDRESSER, number=11, name="Braids"),
                      (STREET, 11), {(STREET, 11): {"TotalSales": 1000}}, [], {}, 3),
        ]
        lines = [a for a in _alerts(businesses, EMPTY_SUPPLY, [], [], [], findings, [], 3, 0.0)
                 ["lines"] if a["group"] == "atcap"]
        self.assertEqual(len(lines), 2)
        self.assertEqual([a["site"] for a in lines], ["Curls", "Braids"])
        self.assertIn("another hairdresser chair", lines[0]["text"])
        self.assertIn("another hairdresser headwash", lines[1]["text"])


if __name__ == "__main__":
    unittest.main()
