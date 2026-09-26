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
