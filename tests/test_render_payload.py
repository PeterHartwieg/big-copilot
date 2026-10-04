"""render() inlines the payload in a <script>: a save's names cannot break out.

Synthetic payloads only; the page as a whole is tests/hostile_names.test.cjs.
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import ba_dashboard  # noqa: E402

NAME = 'x<!--<script></script>/*__MAP_SCRIPT__*/__TITLE__<!--__FOOTER__-->'


def inlined(page: str) -> dict:
    at = page.index("let D = ") + len("let D = ")
    return json.JSONDecoder().raw_decode(page[at:])[0]


class RenderPayload(unittest.TestCase):
    def test_script_json_keeps_the_value_and_drops_every_angle_bracket(self):
        text = json.dumps({"name": NAME})
        safe = ba_dashboard.script_json(text)
        self.assertNotIn("<", safe)
        self.assertEqual(json.loads(safe), {"name": NAME})

    def test_standalone_and_browser_render_embed_the_same_calculation_source(self):
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        cores = []
        for name in ("open-store-model.js", "open-factory-model.js"):
            with open(os.path.join(root, "template", name), encoding="utf-8") as fh:
                cores.append(fh.read())
        for live in (False, True):
            with self.subTest(live=live):
                page = ba_dashboard.render(None, live=live)
                for core in cores:
                    self.assertEqual(page.count(core), 1)
                    self.assertLess(page.index(core), page.index("let D = "))
                self.assertLess(page.index(cores[0]), page.index(cores[1]))

    def test_a_name_reaches_the_board_whole(self):
        data = {"meta": {"save": "Plain Co"}, "businesses": [{"name": NAME}]}
        page = ba_dashboard.render(data, live=True)
        self.assertEqual(inlined(page)["businesses"][0]["name"], NAME)
        start = page.index("let D = ")
        self.assertNotIn("<", page[start:page.index(";", page.index("]}", start))])
        # No placeholder was filled inside the save's text.
        self.assertEqual(page.count("\x00"), 0)


if __name__ == "__main__":
    unittest.main()
