"""Amenity warnings: uniforms read off the roster, and demands a type never makes.

The game caches which customer demands a building meets, but the uniform answer
in there is a snapshot of whoever stood on the floor at one moment, and a demand
the business type never makes is absent from the cache for good. Both are read
here the way the game's own rules read them instead.
"""
import unittest

from tests.i18n_check import MsgAsserts, list_items

from ba_dashboard import (
    plain,
    AMENITY_DEMANDS, DEMANDS_NOT_MADE, OFFICE_SKILLS, RETAIL_TYPES,
    STATION_SKILLS, _alerts, _business, _staff, _stocked_products,
)
from ba_save import Names, Save


UNIFORM = "ba:customerdemand_employeeuniforms"
MUSIC = "ba:customerdemand_music"
SINK = "ba:customerdemand_sink"
LOCKER = "ba:itemname_uniformlocker"
GUARD_POST = "ba:itemname_securityguardlocker"
SERVICE = "ba:skill_customerservice"
GUARD = "ba:skill_securityguard"
LAWYER = "ba:skill_lawyer"          # first in OFFICE_SKILLS
PROGRAMMER = "ba:skill_programmer"  # fourth
STATION_SHIFT = 1
CLEANING_SHIFT = 0

# Eight stations with eight distinct skills, for the ordering test.
EIGHT_STATIONS = [
    ("ba:itemname_securityguardlocker", "ba:skill_securityguard"),
    ("ba:itemname_cashregister", "ba:skill_customerservice"),
    ("ba:itemname_fitnessplanningboard", "ba:skill_gymtrainer"),
    ("ba:itemname_djbooth", "ba:skill_dj"),
    ("ba:itemname_dressingroom", "ba:skill_actor"),
    ("ba:itemname_hairdresserchair", "ba:skill_hairstylist"),
    ("ba:itemname_boothprojection", "ba:skill_projectionist"),
    ("ba:itemname_boothsound", "ba:skill_stagecrew"),
]


class AmenityAlertTests(MsgAsserts, unittest.TestCase):
    def site(
        self,
        items=(),
        posts=(),
        uniforms=(),
        demands=None,
        btype="gym",
        name="Gym",
        shift_type=STATION_SHIFT,
        is_open=True,
        strand_shifts=False,
    ):
        """A save, a building and its address, from furniture and a roster.

        Each post is (skills, station item) and becomes one worker on one shift
        at one station. ``demands`` defaults to every cached demand fulfilled.
        """
        refs, instances = {}, []
        for slug in list(items) + [station for _, station in posts]:
            ref = len(refs)
            refs[ref] = {"itemName": slug} if isinstance(slug, str) else slug
            instances.append({"$k": f"item{ref}", "$v": {"$ref": ref}})
        station_keys = [inst["$k"] for inst in instances[len(items):]]

        employees, shifts = [], []
        for n, ((skills, _station), key) in enumerate(zip(posts, station_keys)):
            char = len(refs)
            refs[char] = {
                "name": f"Worker {n}",
                "skills": {"$items": [{"name": s, "value": 50.0} for s in skills]},
            }
            employees.append({
                "id": f"emp{n}",
                "characterData": {"$ref": char},
                "assignedAddress": {"streetName": "ba:street_fifthavenue",
                                    "streetNumber": 46},
                "hourlyWage": 20.0,
                "assignedWeeklyHours": 40,
            })
            shifts.append({"employeeId": "gone" if strand_shifts else f"emp{n}",
                           "itemInstanceId": key,
                           "type": shift_type, "startingHour": 8, "endingHour": 16})

        cached = list(AMENITY_DEMANDS) + [UNIFORM] if demands is None else list(demands)
        building = {
            "BusinessName": name,
            "businessTypeName": "ba:businesstype_" + btype,
            "StreetName": "ba:street_fifthavenue", "StreetNumber": 46,
            "creationDay": 1,
            "orderHistory": {"$items": [{"dayNumber": 7, "totalCustomers": 100}]},
            "retailPrices": {"$items": []},
            "itemInstances": {"$items": instances},
            "cachedFulfilledCustomerDemands": {"$items": cached},
            # uniforms=None stands for a save with no uniformsBySkill field at all.
            **({} if uniforms is None else
               {"uniformsBySkill": {"$items": [{"$k": s, "$v": "preset"}
                                               for s in uniforms]}}),
            "scheduleDays": {"$items": [
                {"day": 1, "isOpen": is_open, "workShifts": {"$items": shifts}}
            ]},
        }
        root = {"EmployeeInstances": {"$items": employees}}
        save = Save(root, refs, "")
        return save, building, (building["StreetName"], building["StreetNumber"])

    def warnings(self, group="uniform", trading=True, **options):
        """Alerts of one group for the site those options describe."""
        save, building, addr = self.site(**options)
        latest = {addr: {"TotalSales": 1000, "TotalProfit": 500}} if trading else {}
        by_addr, _ = _staff(save, Names({}))
        business = _business(save, Names({}), building, addr, latest, [], by_addr, 8)
        supply = {"graph": {"links": []}, "shops": [], "idle": [],
                  "nextImportWeekday": None, "imports": []}
        result = _alerts([business], supply, [], [], [], [], [], 8, 1000000)
        return [a for a in result["lines"] if a["group"] == group]

    # --- uniforms, read off the roster ---------------------------------

    def test_uncovered_role_is_named(self):
        warnings = self.warnings(
            items=[LOCKER], posts=[((GUARD,), GUARD_POST)], uniforms=[SERVICE]
        )
        self.assertEqual(len(warnings), 1)
        self.assertMsg(warnings[0]["text"], "f.uniform.gaps", roles="Securityguard")
        self.assertEqual(warnings[0]["level"], "warn")
        self.assertEqual(warnings[0]["siteKey"], "ba:street_fifthavenue#46")

    def test_every_role_covered_does_not_warn(self):
        self.assertEqual(
            self.warnings(items=[LOCKER], posts=[((GUARD,), GUARD_POST)],
                          uniforms=[GUARD]),
            [],
        )

    def test_uncovered_roles_are_named_in_one_line_in_a_fixed_order(self):
        # Set iteration follows the per-process hash seed, so without a sort
        # these names reshuffle between runs and page loads. Eight roles make an
        # accidental match vanishingly unlikely; checked over 40 seeds.
        posts = [((skill,), station) for station, skill in EIGHT_STATIONS]
        warnings = self.warnings(items=[LOCKER], posts=posts, uniforms=[])
        self.assertEqual(len(warnings), 1)
        named = self.assertMsg(warnings[0]["text"], "f.uniform.gaps").p["roles"]
        self.assertEqual(
            [plain(role) for role in list_items(named)],
            [Names({}).label(skill) for _station, skill in sorted(
                EIGHT_STATIONS, key=lambda pair: pair[1])],
        )

    def test_a_cached_fulfilled_uniform_demand_does_not_hide_a_gap(self):
        # The game's snapshot says fine because its floor was empty at the time.
        warnings = self.warnings(
            items=[LOCKER], posts=[((GUARD,), GUARD_POST)], uniforms=[]
        )
        self.assertEqual(len(warnings), 1)
        self.assertMsg(warnings[0]["text"], "f.uniform.gaps")

    def test_cached_unfulfilled_uniform_demand_does_not_invent_a_gap(self):
        self.assertEqual(
            self.warnings(items=[LOCKER], posts=[((GUARD,), GUARD_POST)],
                          uniforms=[GUARD],
                          demands=[s for s in AMENITY_DEMANDS]),
            [],
        )

    def test_cleaning_shifts_are_not_checked(self):
        self.assertEqual(
            self.warnings(items=[LOCKER], posts=[((GUARD,), GUARD_POST)],
                          uniforms=[], shift_type=CLEANING_SHIFT),
            [],
        )

    def test_shifts_on_a_closed_day_are_not_checked(self):
        self.assertEqual(
            self.warnings(items=[LOCKER], posts=[((GUARD,), GUARD_POST)],
                          uniforms=[], is_open=False),
            [],
        )

    def test_a_worker_without_the_stations_skill_is_not_checked(self):
        # No uniform is set at all, so reading the worker's own skills instead of
        # the station's would report Customer Service here. The game reads the
        # station's, finds nothing the worker holds, and asks for no uniform.
        self.assertEqual(
            self.warnings(items=[LOCKER], posts=[((SERVICE,), GUARD_POST)],
                          uniforms=[]),
            [],
        )

    def test_the_station_decides_the_skill_not_the_worker(self):
        # A coat check lists only Customer Service; a worker who holds that and
        # Security Guard owes a Customer Service uniform, not a guard's.
        warnings = self.warnings(
            items=[LOCKER], posts=[((GUARD, SERVICE), "ba:itemname_coatcheckleft")],
            uniforms=[GUARD],
        )
        self.assertEqual(len(warnings), 1)
        self.assertMsg(warnings[0]["text"], "f.uniform.gaps", roles="Customerservice")

    def test_the_first_station_skill_the_worker_holds_wins(self):
        # A computer lists ten skills; the game takes the first the worker has
        # and stops, so a worker holding both owes for Lawyer, not Programmer.
        # Covering the later one is not enough.
        gaps = self.warnings(
            items=[LOCKER], posts=[((PROGRAMMER, LAWYER), "ba:itemname_desktopcomputer")],
            uniforms=[PROGRAMMER],
        )
        self.assertEqual(len(gaps), 1)
        self.assertMsg(gaps[0]["text"], "f.uniform.gaps", roles="Lawyer")
        self.assertEqual(
            self.warnings(items=[LOCKER],
                          posts=[((PROGRAMMER, LAWYER), "ba:itemname_desktopcomputer")],
                          uniforms=[LAWYER]),
            [],
        )

    def test_a_shift_left_behind_by_a_departed_worker_is_skipped(self):
        # The shift still names an employeeId that is no longer on the roster.
        warnings = self.warnings(items=[LOCKER], posts=[((GUARD,), GUARD_POST)],
                                 uniforms=[], strand_shifts=True)
        self.assertEqual(warnings, [])

    def test_a_save_with_no_uniforms_field_owes_every_role(self):
        warnings = self.warnings(items=[LOCKER], posts=[((GUARD,), GUARD_POST)],
                                 uniforms=None)
        self.assertEqual(len(warnings), 1)
        self.assertMsg(warnings[0]["text"], "f.uniform.gaps", roles="Securityguard")

    def test_a_station_the_table_does_not_know_yields_no_role(self):
        self.assertEqual(
            self.warnings(items=[LOCKER], posts=[((GUARD,), "ba:itemname_beanbag")],
                          uniforms=[]),
            [],
        )

    def test_a_site_with_no_staff_owes_no_uniforms(self):
        self.assertEqual(self.warnings(items=[LOCKER], uniforms=[]), [])

    # --- the locker, which is how uniforms get set at all ---------------

    def test_missing_locker_stands_in_for_the_roles_behind_it(self):
        warnings = self.warnings(posts=[((GUARD,), GUARD_POST)], uniforms=[])
        self.assertEqual(len(warnings), 1)
        self.assertMsg(warnings[0]["text"], "f.uniform.locker")

    def test_missing_locker_warns_even_when_every_role_is_covered(self):
        warnings = self.warnings(posts=[((GUARD,), GUARD_POST)], uniforms=[GUARD])
        self.assertEqual(len(warnings), 1)
        self.assertMsg(warnings[0]["text"], "f.uniform.locker")

    def test_boxed_locker_is_not_installed(self):
        box = {"itemName": "ba:itemname_closedcardboardbox",
               "cargoInstances": {"$items": [{"itemName": LOCKER, "amount": 1}]}}
        warnings = self.warnings(items=[box])
        self.assertEqual(len(warnings), 1)
        self.assertMsg(warnings[0]["text"], "f.uniform.locker")

    # --- demands a business type never makes ---------------------------

    def test_a_hairdressers_customers_never_ask_about_uniforms(self):
        for options in ({"uniforms": []}, {"items": [LOCKER], "uniforms": []}):
            with self.subTest(options=options):
                self.assertEqual(
                    self.warnings(btype="hairdresser", name="Salon",
                                  posts=[((GUARD,), GUARD_POST)], **options),
                    [],
                )

    def test_a_florist_and_a_theater_are_never_asked_for_music(self):
        for btype in ("florist", "theater"):
            with self.subTest(btype=btype):
                missing = [s for s in AMENITY_DEMANDS if s not in (MUSIC, SINK)]
                self.assertEqual(
                    self.warnings(items=[LOCKER], group="music", btype=btype,
                                  demands=missing),
                    [],
                )
                # and the demands they do make are still reported
                sink = self.warnings(items=[LOCKER], group="sink", btype=btype,
                                     demands=missing)
                self.assertEqual(len(sink), 1)

    def test_a_shop_whose_customers_do_ask_for_music_still_warns(self):
        warnings = self.warnings(
            items=[LOCKER], group="music",
            demands=[s for s in AMENITY_DEMANDS if s != MUSIC],
        )
        self.assertEqual(len(warnings), 1)
        self.assertMsg(warnings[0]["text"], "f.amenity.music")

    # --- what an absent demand means -----------------------------------

    def test_an_empty_cache_means_every_demand_failed(self):
        # The game caches only the demands it found fulfilled, so nothing cached
        # is the fail-everything state. A shop too new to have been scored is
        # held back by the not-trading gate, not by second-guessing the cache.
        for group, _text in AMENITY_DEMANDS.values():
            with self.subTest(group=group):
                self.assertEqual(
                    len(self.warnings(items=[LOCKER], group=group, demands=[])), 1
                )

    def test_every_retail_type_was_checked_against_the_games_own_table(self):
        """A retail type added later must not quietly default to asking for all.

        DEMANDS_NOT_MADE was read from the businesstypes bundle for exactly the
        types below. Adding one to RETAIL_TYPES without re-reading the bundle
        would start warning about demands that type's customers never make,
        which is the bug this whole file is about.
        """
        checked = {
            "bookstore", "cinema", "clothingstore", "coffeeshop", "electronicsstore",
            "fastfoodrestaurant", "florist", "fruitandvegetablestore", "giftshop",
            "gym", "hairdresser", "jewelrystore", "liquorstore", "nightclub",
            "supermarket", "theater",
        }
        self.assertEqual(RETAIL_TYPES, {"ba:businesstype_" + t for t in checked})
        self.assertLessEqual(set(DEMANDS_NOT_MADE), RETAIL_TYPES)

    def test_the_station_table_holds_every_station_the_game_has(self):
        # The 33 ItemData entries with a suitableSkills list at build 3680. A
        # station missing from the table asks for no uniform, so a game that
        # adds one should fail here rather than go quiet in the alert.
        self.assertEqual(len(STATION_SKILLS), 33)

    def test_only_the_desk_stations_list_more_than_one_skill(self):
        """Order inside a station's list decides which uniform is owed.

        The count above cannot see a reordering, and every station but the desks
        lists a single skill — so pinning the desk list, and the fact that it is
        the only multi-skill one, is what keeps the first-match rule honest.
        """
        several = {skills for skills in STATION_SKILLS.values() if len(skills) > 1}
        self.assertEqual(several, {OFFICE_SKILLS})
        self.assertEqual(OFFICE_SKILLS, (
            "ba:skill_lawyer", "ba:skill_purchasingagent", "ba:skill_logisticsmanager",
            "ba:skill_programmer", "ba:skill_hrmanager", "ba:skill_graphicdesigner",
            "ba:skill_headhunter", "ba:skill_travelagent", "ba:skill_eventplanner",
            "ba:skill_pricingmanager",
        ))

    def test_the_line_uses_the_games_own_role_names(self):
        # Names({}) falls back to title-casing the slug; a real locale is what
        # players see, and it is the locale label that reaches the alert.
        locale = {GUARD: "Security Guard", SERVICE: "Customer Service"}
        save, building, addr = self.site(items=[LOCKER],
                                         posts=[((GUARD,), GUARD_POST)], uniforms=[])
        names = Names(locale)
        by_addr, _ = _staff(save, names)
        business = _business(save, names, building, addr,
                             {addr: {"TotalSales": 1000, "TotalProfit": 500}},
                             [], by_addr, 8)
        self.assertEqual(business["uniformGaps"], ["Security Guard"])

    def test_the_skill_ids_ride_beside_the_names_in_the_same_order(self):
        # A write sets uniforms by skill id, so the payload carries the ids too,
        # sorted by id and parallel to the names.
        locale = {GUARD: "Security Guard", SERVICE: "Customer Service"}
        save, building, addr = self.site(items=[LOCKER],
                                         posts=[((SERVICE,), "ba:itemname_cashregister"),
                                                ((GUARD,), GUARD_POST)],
                                         uniforms=[])
        names = Names(locale)
        by_addr, _ = _staff(save, names)
        business = _business(save, names, building, addr,
                             {addr: {"TotalSales": 1000, "TotalProfit": 500}},
                             [], by_addr, 8)
        self.assertEqual(business["uniformGapSkills"], sorted([GUARD, SERVICE]))
        self.assertEqual(business["uniformGaps"],
                         [locale[skill] for skill in business["uniformGapSkills"]])

    # --- the checklist's readings of the same shifts --------------------

    def business(self, latest=None, history=(), opened=None, **options):
        save, building, addr = self.site(**options)
        if opened is not None:
            building["creationDay"] = opened
        by_addr, _ = _staff(save, Names({}))
        latest = {addr: {"TotalSales": 0, "TotalProfit": 0}} if latest is None else {addr: latest}
        return _business(save, Names({}), building, addr, latest,
                         [(d, {addr: st}) for d, st in history], by_addr, 8)

    def test_station_shifts_count_open_days_of_people_on_staff(self):
        post = [((GUARD,), GUARD_POST)]
        self.assertEqual(self.business(items=[LOCKER], posts=post)["stationShifts"], 1)
        self.assertEqual(self.business(items=[LOCKER], posts=post, is_open=False)["stationShifts"], 0)
        self.assertEqual(self.business(items=[LOCKER], posts=post, strand_shifts=True)["stationShifts"], 0)
        self.assertEqual(self.business(items=[LOCKER], posts=post, shift_type=CLEANING_SHIFT)["stationShifts"], 0)

    def test_a_shop_has_traded_when_any_day_sold_not_only_the_last_statement(self):
        zero = {"TotalSales": 0, "TotalProfit": 0}
        self.assertFalse(self.business(latest=zero, history=[(6, zero)])["hasTraded"])
        self.assertTrue(self.business(latest=zero, history=[(6, {"TotalSales": 420, "TotalProfit": 90}), (7, zero)])["hasTraded"])
        self.assertTrue(self.business(latest={"TotalSales": 55, "TotalProfit": 5})["hasTraded"])

    def test_sales_at_the_address_before_this_business_opened_are_not_its_own(self):
        sold = {"TotalSales": 420, "TotalProfit": 90}
        zero = {"TotalSales": 0, "TotalProfit": 0}
        # The old tenant sold on days 2-4; this business opened on day 6.
        old_tenant = [(2, sold), (3, sold), (4, sold), (5, zero)]
        b = self.business(latest=zero, history=old_tenant + [(7, zero)], opened=6)
        self.assertFalse(b["hasTraded"])
        self.assertEqual(b["revenue"], 0)
        # Its own opening day and after count.
        self.assertTrue(self.business(latest=zero, history=old_tenant + [(6, sold), (7, zero)], opened=6)["hasTraded"])
        # The last statement is itself from before the opening: not this shop's takings.
        stale = self.business(latest=sold, history=[(4, sold)], opened=6)
        self.assertEqual((stale["revenue"], stale["hasTraded"]), (0, False))
        # A statement on or after the opening day is.
        fresh = self.business(latest=sold, history=[(7, sold)], opened=6)
        self.assertEqual((fresh["revenue"], fresh["hasTraded"]), (420, True))

    def test_only_cargo_with_an_amount_counts_as_stocked(self):
        shelf = lambda amount: {"itemName": "ba:itemname_shelf", "cargoInstances": {"$items": [
            {"itemName": "ba:itemname_beer", "amount": amount}]}}
        furniture = {"ba:itemname_shelf": {"h": ["ba:itemname_beer"]}}
        for amount, expected in ((0, set()), (12, {"ba:itemname_beer"})):
            save, building, _addr = self.site(items=[shelf(amount)])
            self.assertEqual(_stocked_products(save, building, furniture), expected)

    def test_cargo_held_in_storage_is_not_on_display(self):
        held = lambda name: {"itemName": name, "cargoInstances": {"$items": [
            {"itemName": "ba:itemname_beer", "amount": 12}]}}
        furniture = {"ba:itemname_shelf": {"h": ["ba:itemname_beer"]}, "ba:itemname_storageshelf": {"h": []}}
        save, building, _addr = self.site(items=[held("ba:itemname_storageshelf")])
        self.assertEqual(_stocked_products(save, building, furniture), set())
        save, building, _addr = self.site(items=[held("ba:itemname_storageshelf"), held("ba:itemname_shelf")])
        self.assertEqual(_stocked_products(save, building, furniture), {"ba:itemname_beer"})

    # --- sites with no shop floor --------------------------------------

    def test_support_vacant_and_new_nontrading_sites_are_not_flagged(self):
        for options in ({"btype": "warehouse"}, {"btype": "factory"}, {"btype": "lawfirm"},
                        {"name": ""}, {"trading": False}):
            with self.subTest(options=options):
                self.assertEqual(self.warnings(**options), [])


if __name__ == "__main__":
    unittest.main()
