"""The payload's sections (#238): a core on every build, the rest on demand.

build_core() computes what every build needs and records the history;
section() computes one section from the Build it keeps; materialize_all() is
both together, which extract(), the CLI and the watch server use. The
browser's worker sends the core alone (browser_build()) and a section when a
page asks (browser_section()). Synthetic saves only: never a real save.
"""
from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import unittest
import unittest.mock

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, ROOT)

import ba_dashboard  # noqa: E402
from tests import es3_fixture  # noqa: E402
from tests import save_fixtures  # noqa: E402
from ba_save import Names, load_save  # noqa: E402
from tests.test_payload_snapshot import normalise  # noqa: E402

PRIVATE = ("_posts", "_hire", "_took")


def private_fields(value, at=""):
    """Every private field (a factory line's `_posts`, a plan row's `_hire`) under `value`."""
    if isinstance(value, dict):
        for key, item in value.items():
            if key in PRIVATE:
                yield f"{at}.{key}"
            yield from private_fields(item, f"{at}.{key}")
    elif isinstance(value, list):
        for i, item in enumerate(value):
            yield from private_fields(item, f"{at}[{i}]")


class Registry(unittest.TestCase):
    def test_every_payload_key_is_the_core_s_or_one_section_s(self):
        owners = {}
        for name, spec in ba_dashboard.SECTIONS.items():
            for key in spec["keys"]:
                self.assertNotIn(key, owners, f"{key} is in two sections")
                self.assertIn(key, ba_dashboard.PAYLOAD_KEYS)
                owners[key] = name
            for need in spec["needs"]:
                self.assertIn(need, ba_dashboard.SECTIONS, f"{name} needs an unknown section")
        self.assertEqual(len(set(ba_dashboard.PAYLOAD_KEYS)), len(ba_dashboard.PAYLOAD_KEYS))

    def test_render_generates_section_metadata_for_both_front_doors(self):
        expected = ba_dashboard.section_metadata()
        for site in (False, True):
            with self.subTest(site=site):
                page = ba_dashboard.render(None, site=site)
                block = re.search(r"const OD_SECTIONS = (\{[^\n]+\});", page)
                self.assertIsNotNone(block)
                self.assertEqual(json.loads(block.group(1)), expected)
                self.assertNotIn("/*__SECTION_META__*/", page)
        self.assertEqual(expected, {name: {"keys": list(spec["keys"]),
                                          "needs": list(spec["needs"])}
                                    for name, spec in ba_dashboard.SECTIONS.items()})

    def test_new_registry_entry_is_rendered_without_a_browser_edit(self):
        spec = {"keys": ("example", "other"), "needs": ("products",),
                "produce": lambda _: {}, "words": "Example"}
        with unittest.mock.patch.dict(ba_dashboard.SECTIONS, example=spec):
            page = ba_dashboard.render(None)
        block = re.search(r"const OD_SECTIONS = (\{[^\n]+\});", page)
        self.assertEqual(json.loads(block.group(1))["example"],
                         {"keys": ["example", "other"], "needs": ["products"]})

    def test_no_warning_reads_a_section(self):
        # The core is everything the warnings need: the alert keys are core.
        sections = {key for spec in ba_dashboard.SECTIONS.values() for key in spec["keys"]}
        for key in ("alerts", "minor", "alertsDemand", "businesses", "supply",
                    "hours", "hourFindings"):
            self.assertNotIn(key, sections)


class Sections(unittest.TestCase):
    """The data company (shops, a factory and staff) on its day N."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, "payload.hsg")
        save_fixtures.write_data_save(self.path, save_fixtures.DAY)
        self.names = save_fixtures.data_names()

    def tearDown(self):
        self.tmp.cleanup()
        ba_dashboard.set_progress(None)

    def build(self, history=None, generation=None):
        return ba_dashboard.build_core(load_save(self.path), Names(dict(self.names)), history,
                                       generation)

    def test_the_core_holds_no_section_and_no_private_field(self):
        build = self.build()
        sections = {key for spec in ba_dashboard.SECTIONS.values() for key in spec["keys"]}
        self.assertEqual(set(build.core) & sections, set())
        # The fixture is a vanilla save, so it carries no optional key (`mods`).
        self.assertEqual(list(build.core),
                         [k for k in ba_dashboard.PAYLOAD_KEYS
                          if k not in sections and k not in ba_dashboard.OPTIONAL_KEYS])
        self.assertEqual(list(private_fields(build.core)), [])
        # The private parts are kept on the Build instead.
        self.assertNotIn("world", build.shared, "planning world is deferred too")
        self.assertEqual(build.shared["planning"], {})
        self.assertTrue(build.private["posts"])
        self.assertEqual(build.private["hires"], {})
        self.assertIn("catalogue", build.private)

    def test_payroll_is_core_and_the_staff_list_stays_shared(self):
        build = self.build()
        self.assertNotIn("staff", ba_dashboard.SECTIONS)
        self.assertEqual(build.core["staff"],
                         ba_dashboard._staff_summary(build.shared["staff"], build.shared["businesses"]))
        self.assertEqual(build.core["staff"]["total"], build.core["kpi"]["employees"])

    def test_products_reads_one_private_copy_without_mutating_raw_totals(self):
        build = self.build()
        private = build.private["product_businesses"]
        before = json.dumps(private, sort_keys=True)
        real = ba_dashboard._products
        with unittest.mock.patch.object(ba_dashboard, "_products", wraps=real) as products:
            first = ba_dashboard._products_section(build)
            self.assertIs(products.call_args.args[0], private)
        self.assertEqual(json.dumps(private, sort_keys=True), before)
        self.assertEqual(ba_dashboard._products_section(build), first)

    def test_the_fixture_exercises_every_section(self):
        whole = ba_dashboard.materialize_all(self.build())
        self.assertTrue(whole["factoryStaffing"]["cap"], "a factory to staff")
        self.assertTrue(whole["hiring"]["sites"], "sites to hire for")

    def test_every_section_computed_is_the_whole_payload(self):
        whole = normalise(ba_dashboard.extract(load_save(self.path), Names(dict(self.names)), None))
        build = self.build()
        # A section asked for first brings what it needs with it.
        ba_dashboard.section(build, "hiring")
        self.assertEqual(set(build.sections), {"staffing", "officeStaffing", "factoryStaffing", "hiring"})
        again = normalise(ba_dashboard.materialize_all(build))
        self.assertEqual(list(again), [k for k in ba_dashboard.PAYLOAD_KEYS if k not in ba_dashboard.OPTIONAL_KEYS])
        self.assertEqual(json.dumps(again), json.dumps(whole))
        for name in ba_dashboard.SECTIONS:
            self.assertEqual(list(private_fields(build.sections[name])), [], name)

    def test_no_section_changes_the_core_after_it_was_sent(self):
        build = self.build()
        sent = json.dumps(build.core)
        for name in ba_dashboard.SECTIONS:
            ba_dashboard.section(build, name)
            self.assertEqual(json.dumps(build.core), sent, name)
            self.assertEqual(list(private_fields(build.sections[name])), [], name)
        self.assertNotIn("catalogue", build.core["market"])

    def test_a_section_is_computed_once_and_writes_no_history(self):
        history = os.path.join(self.tmp.name, "history.json")
        build = self.build(history)
        with open(history, encoding="utf-8") as fh:
            recorded = fh.read()
        stamp = os.path.getmtime(history)
        first = ba_dashboard.section(build, "factoryStaffing")
        self.assertIs(ba_dashboard.section(build, "factoryStaffing"), first)
        ba_dashboard.section(build, "hiring")
        with open(history, encoding="utf-8") as fh:
            self.assertEqual(fh.read(), recorded)
        self.assertEqual(os.path.getmtime(history), stamp)

    def test_a_section_says_it_is_working(self):
        heard = []
        ba_dashboard.set_progress(lambda stage, detail: heard.append((stage, detail)))
        build = self.build()
        heard.clear()
        ba_dashboard.section(build, "hiring")
        details = [detail for _stage, detail in heard]
        self.assertIn("Working out factory staffing", details)
        self.assertIn("Working out staff needs", details)
        self.assertLess(details.index("Working out factory staffing"),
                        details.index("Working out staff needs"))

    def test_hiring_keeps_saying_it_is_working(self):
        # Every site of the Staff page's key ticks the heartbeat: with no wait
        # between messages, each one is heard.
        build = self.build()
        ba_dashboard.section(build, "factoryStaffing")
        heard = []
        ba_dashboard.set_progress(lambda stage, detail: heard.append(detail))
        with unittest.mock.patch.object(ba_dashboard, "PROGRESS_EVERY_S", 0):
            ba_dashboard.section(build, "hiring")
        self.assertEqual(heard[0], "Working out staff needs")
        self.assertGreater(len(heard), 1, "a heartbeat after the start")

    def test_a_failed_factory_section_leaves_the_pool_whole(self):
        build = self.build()
        ba_dashboard.section(build, "officeStaffing")
        bench = [p["id"] for p in build.shared["world"]["bench"]]
        state = json.dumps(build.shared["world"]["state"], default=sorted)
        def half_way(*args):
            args[-1].clear()  # the weeks it was writing into
            raise RuntimeError("half way")

        with unittest.mock.patch.object(ba_dashboard, "_factory_site_plan", side_effect=half_way):
            ba_dashboard.section(build, "factoryStaffing")  # each factory fails alone
        self.assertTrue(state != "{}")
        self.assertEqual([p["id"] for p in build.shared["world"]["bench"]], bench)
        self.assertEqual(json.dumps(build.shared["world"]["state"], default=sorted), state)

    def test_core_is_exactly_the_issue_list_and_cheap_map_layers_payroll_and_recipes(self):
        expected = "meta kpi names skillNames businesses daily loans supply rhythm market chains trends hypeExposure hours hourFindings marketingAgencies alerts minor alertsDemand payback cashFlow ledgerDays ownedBuildings homes staff plan".split()
        # The Rivals leaderboard writes the history its run in first place is
        # counted from, as cashFlow's ledger does (#414).
        expected.append("rivalry")
        self.assertEqual(set(self.build().core), set(expected))

    def test_later_planning_first_equals_each_stage_in_order(self):
        for last in ("staffing", "officeStaffing", "factoryStaffing", "hiring"):
            with self.subTest(last=last):
                first, ordered = self.build(), self.build()
                ba_dashboard.section(first, last)
                for name in ("staffing", "officeStaffing", "factoryStaffing", "hiring"):
                    ba_dashboard.section(ordered, name)
                    if name == last:
                        break
                self.assertEqual(json.dumps(first.sections), json.dumps(ordered.sections))
                self.assertEqual(json.dumps(first.shared["planning"], default=sorted),
                                 json.dumps(ordered.shared["planning"], default=sorted))

    def test_each_failed_stage_can_retry_without_damaging_earlier_state(self):
        for name, producer in (("staffing", "_staffing"), ("officeStaffing", "_office_staffing"),
                               ("factoryStaffing", "_factory_staffing")):
            with self.subTest(stage=name):
                build = self.build()
                for need in ba_dashboard.SECTIONS[name]["needs"]:
                    ba_dashboard.section(build, need)
                # Materialise just the initial world where no earlier stage exists.
                ba_dashboard._planning_world(build)
                before = json.dumps({"world": build.shared["world"],
                                     "planning": build.shared["planning"]}, default=sorted)
                def fail(*args, **kwargs):
                    world = kwargs.get("world", args[-1])
                    world["bench"].clear()
                    world["state"].clear()
                    raise RuntimeError("half way")
                with unittest.mock.patch.object(ba_dashboard, producer, side_effect=fail):
                    with self.assertRaisesRegex(RuntimeError, "half way"):
                        ba_dashboard.section(build, name)
                self.assertNotIn(name, build.sections)
                self.assertEqual(json.dumps({"world": build.shared["world"],
                                             "planning": build.shared["planning"]}, default=sorted), before)
                retried = ba_dashboard.section(build, name)
                fresh = ba_dashboard.section(self.build(), name)
                self.assertEqual(json.dumps(retried), json.dumps(fresh))

    def test_cross_family_orders_keep_every_section_and_core_identical(self):
        ordered = self.build()
        ba_dashboard.materialize_all(ordered)
        names = list(ba_dashboard.SECTIONS)
        orders = [names[::-1],
                  ["openStore", "staffing", "hiring", "goals", "products",
                   "openFactory", "premises", "factoryStaffing", "officeStaffing"]]
        import random
        shuffled = names[:]
        random.Random(238).shuffle(shuffled)
        orders.append(shuffled)
        for order in orders:
            with self.subTest(order=order):
                build = self.build()
                core = json.dumps(build.core)
                for name in order:
                    ba_dashboard.section(build, name)
                    self.assertEqual(json.dumps(build.core), core)
                self.assertEqual(json.dumps(build.core), json.dumps(ordered.core))
                for name in names:
                    self.assertEqual(json.dumps(build.sections[name]),
                                     json.dumps(ordered.sections[name]), name)

    def test_failed_hiring_keeps_completed_plans_and_private_hires_for_retry(self):
        build = self.build()
        ba_dashboard.section(build, "factoryStaffing")
        earlier = json.dumps(build.sections)
        worlds = json.dumps(build.shared["planning"], default=sorted)
        hires = dict(build.private["hires"])
        with unittest.mock.patch.object(ba_dashboard, "_hiring", side_effect=RuntimeError("half way")):
            with self.assertRaisesRegex(RuntimeError, "half way"):
                ba_dashboard.section(build, "hiring")
        self.assertNotIn("hiring", build.sections)
        self.assertEqual(json.dumps(build.sections), earlier)
        self.assertEqual(json.dumps(build.shared["planning"], default=sorted), worlds)
        self.assertEqual(build.private["hires"], hires)
        retried = ba_dashboard.section(build, "hiring")
        self.assertEqual(json.dumps(retried), json.dumps(ba_dashboard.section(self.build(), "hiring")))

    def test_every_section_is_once_and_never_records_history(self):
        build = self.build()
        with unittest.mock.patch.object(ba_dashboard.History, "write", side_effect=AssertionError("history")):
            for name in ba_dashboard.SECTIONS:
                first = ba_dashboard.section(build, name)
                self.assertIs(ba_dashboard.section(build, name), first)

    def test_shop_and_office_placers_tick_progress(self):
        for name in ("staffing", "officeStaffing"):
            build = self.build()
            heard = []
            ba_dashboard.set_progress(lambda stage, detail: heard.append(detail))
            with unittest.mock.patch.object(ba_dashboard, "PROGRESS_EVERY_S", 0):
                ba_dashboard.section(build, name)
            self.assertGreater(len(heard), len(build.sections), name)


    def test_an_office_stage_ticks_inside_its_placer(self):
        from tests.test_staff_hire import office_registration, lawyer, save_of, STREET, COMPUTER
        reg = office_registration(1, [[[8, 20]] for _ in range(7)])
        save = save_of({"EmployeeInstances": {"$items": [lawyer("p1", here=False)]},
                        "BuildingRegistrations": {"$items": [reg]}})
        names = Names({})
        business = {"key": ba_dashboard.site_key((STREET, 10)), "name": "Halden Law",
                    "status": "office", "typeSlug": "ba:businesstype_lawfirm", "basket": 388.0, "staff": 0}
        _by_addr, staff = ba_dashboard._staff(save, names)
        grids = ba_dashboard._hourly(save, [reg], [business], {}, {COMPUTER},
                                    {p["id"]: p["skill"] for p in staff}, names)
        build = ba_dashboard.Build(save, names)
        build.shared.update(businesses=[business], staff=staff, all_grids=grids,
                            base_promotion=0.55, planning={})
        build.private["hires"] = {}
        ba_dashboard.section(build, "staffing")
        heard = []
        ba_dashboard.set_progress(lambda stage, detail: heard.append(detail))
        with unittest.mock.patch.object(ba_dashboard, "PROGRESS_EVERY_S", 0):
            result = ba_dashboard.section(build, "officeStaffing")
        self.assertTrue(result["officeStaffing"])
        self.assertGreater(len(heard), 1, "heartbeats inside office placing, after the stage start")
        self.assertIsNot(build.shared["planning"]["officeStaffing"],
                         build.shared["planning"]["staffing"])



class BrowserSections(unittest.TestCase):
    """browser_build() and browser_section(), called as web/worker.js calls them."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        data = os.path.join(self.tmp.name, "data")
        os.makedirs(data)
        self.history = os.path.join(data, "market_history.json")
        self.locale = os.path.join(data, "en.json")
        self.names = os.path.join(data, "gametext.json")
        with open(self.names, "w", encoding="utf-8") as fh:
            json.dump(save_fixtures.data_names(), fh)
        self.path = os.path.join(self.tmp.name, "payload.hsg")
        save_fixtures.write_data_save(self.path, save_fixtures.DAY)

    def tearDown(self):
        self.tmp.cleanup()

    def build(self, generation):
        return json.loads(ba_dashboard.browser_build(
            self.path, self.locale, self.history, self.names, generation))

    def test_the_build_sends_the_core_and_a_section_follows(self):
        core = self.build(7)
        for key in ("factoryStaffing", "hiring", "candidates"):
            self.assertNotIn(key, core)
        got = json.loads(ba_dashboard.browser_section("hiring", 7))
        self.assertEqual(got["generation"], 7)
        # Asked for first, hiring brings the factory staffing it was planned over.
        self.assertEqual(set(got["sections"]), {"staffing", "officeStaffing", "factoryStaffing", "hiring"})
        self.assertEqual(set(got["sections"]["hiring"]), {"hiring", "candidates"})
        # Asked again, what was asked for: nothing is computed twice.
        again = json.loads(ba_dashboard.browser_section("factoryStaffing", 7))
        self.assertEqual(set(again["sections"]), {"staffing", "officeStaffing", "factoryStaffing"})
        self.assertEqual(again["sections"]["factoryStaffing"],
                         got["sections"]["factoryStaffing"])

    def test_a_retry_after_a_failure_still_sends_what_it_needs(self):
        # Factory staffing is computed, then hiring fails: the page got
        # neither. The retry that works sends both.
        self.build(8)
        real = ba_dashboard.SECTIONS["hiring"]["produce"]
        ba_dashboard.SECTIONS["hiring"]["produce"] = lambda build: 1 / 0
        try:
            with self.assertRaises(ba_dashboard.SaveShapeError):
                ba_dashboard.browser_section("hiring", 8)
        finally:
            ba_dashboard.SECTIONS["hiring"]["produce"] = real
        got = json.loads(ba_dashboard.browser_section("hiring", 8))
        self.assertEqual(set(got["sections"]), {"staffing", "officeStaffing", "factoryStaffing", "hiring"})

    def test_a_section_of_another_build_is_stale(self):
        self.build(1)
        self.build(2)
        with self.assertRaises(ba_dashboard.StaleBuild):
            ba_dashboard.browser_section("hiring", 1)
        json.loads(ba_dashboard.browser_section("hiring", 2))

    def test_a_failed_build_holds_none(self):
        self.build(1)
        with open(self.path, "wb") as fh:
            fh.write(b"not gzip at all")
        with self.assertRaises(ba_dashboard.SaveShapeError):
            self.build(2)
        for generation in (1, 2):
            with self.assertRaises(ba_dashboard.StaleBuild):
                ba_dashboard.browser_section("hiring", generation)

    def test_an_unknown_section_is_refused(self):
        self.build(3)
        with self.assertRaises(ValueError):
            ba_dashboard.browser_section("unknown", 3)


if __name__ == "__main__":
    unittest.main()
