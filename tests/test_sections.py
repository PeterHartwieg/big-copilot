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
import es3_fixture  # noqa: E402
import save_fixtures  # noqa: E402
from ba_save import Names, load_save  # noqa: E402
from test_payload_snapshot import normalise  # noqa: E402

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

    def test_the_board_s_table_mirrors_python_s(self):
        with open(os.path.join(ROOT, "template", "board.js"), encoding="utf-8") as fh:
            source = fh.read()
        block = re.search(r"^const OD_SECTIONS = \{\n(.*?)^\};", source, re.S | re.M)
        self.assertIsNotNone(block, "OD_SECTIONS in template/board.js")
        board = {}
        for name, keys, needs in re.findall(
                r'^\s+(\w+): \{keys: \[([^\]]*)\], needs: \[([^\]]*)\]\},?$', block.group(1), re.M):
            board[name] = (re.findall(r'"(\w+)"', keys), re.findall(r'"(\w+)"', needs))
        python = {name: (list(spec["keys"]), list(spec["needs"]))
                  for name, spec in ba_dashboard.SECTIONS.items()}
        self.assertEqual(board, python)

    def test_no_warning_reads_a_section(self):
        # The core is everything the warnings need: the alert keys are core.
        sections = {key for spec in ba_dashboard.SECTIONS.values() for key in spec["keys"]}
        for key in ("alerts", "minor", "alertsDemand", "businesses", "supply", "staffing",
                    "officeStaffing", "hours", "hourFindings"):
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
        self.assertEqual(list(build.core),
                         [k for k in ba_dashboard.PAYLOAD_KEYS if k not in sections])
        self.assertEqual(list(private_fields(build.core)), [])
        # The private parts are kept on the Build instead.
        self.assertTrue(build.private["posts"])
        self.assertTrue(build.private["hires"])
        self.assertIn("catalogue", build.private)

    def test_the_fixture_exercises_every_section(self):
        whole = ba_dashboard.materialize_all(self.build())
        self.assertTrue(whole["factoryStaffing"]["cap"], "a factory to staff")
        self.assertTrue(whole["hiring"]["sites"], "sites to hire for")

    def test_every_section_computed_is_the_whole_payload(self):
        whole = normalise(ba_dashboard.extract(load_save(self.path), Names(dict(self.names)), None))
        build = self.build()
        # A section asked for first brings what it needs with it.
        ba_dashboard.section(build, "hiring")
        self.assertEqual(set(build.sections), set(ba_dashboard.SECTIONS))
        again = normalise(ba_dashboard.materialize_all(build))
        self.assertEqual(list(again), list(ba_dashboard.PAYLOAD_KEYS))
        self.assertEqual(json.dumps(again), json.dumps(whole))
        for name in ba_dashboard.SECTIONS:
            self.assertEqual(list(private_fields(build.sections[name])), [], name)

    def test_no_section_changes_the_core_after_it_was_sent(self):
        build = self.build()
        sent = json.dumps(build.core)
        ba_dashboard.materialize_all(build)
        self.assertEqual(json.dumps(build.core), sent)

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
        self.assertEqual(set(got["sections"]), {"factoryStaffing", "hiring"})
        self.assertEqual(set(got["sections"]["hiring"]), {"hiring", "candidates"})
        # Asked again, what was asked for: nothing is computed twice.
        again = json.loads(ba_dashboard.browser_section("factoryStaffing", 7))
        self.assertEqual(set(again["sections"]), {"factoryStaffing"})
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
        self.assertEqual(set(got["sections"]), {"factoryStaffing", "hiring"})

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
            ba_dashboard.browser_section("goals", 3)


if __name__ == "__main__":
    unittest.main()
