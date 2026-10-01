"""tools/split_board_script.py undoes ba_dashboard.load_template()'s splice: a page
with the board script inline splits back into the committed board.html and board.js."""
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))

import split_board_script  # noqa: E402
from ba_dashboard import load_template  # noqa: E402


def read(name: str) -> str:
    with open(os.path.join(ROOT, "template", name), encoding="utf-8") as fh:
        return fh.read()


class SplitBoardScript(unittest.TestCase):
    def test_the_inline_page_splits_into_the_two_files(self):
        self.assertEqual(split_board_script.split(load_template()), (read("board.html"), read("board.js")))

    def test_a_split_page_is_left_alone(self):
        self.assertIsNone(split_board_script.split(read("board.html")))

    def test_a_second_slot_is_refused(self):
        page = read("board.html").replace("<body>", "<body>/*__BOARD_SCRIPT__*/", 1)
        with self.assertRaises(SystemExit):
            split_board_script.split(page)

    def test_line_endings_are_kept(self):
        page, script = split_board_script.split(load_template().replace("\n", "\r\n"))
        self.assertEqual((page, script), (read("board.html").replace("\n", "\r\n"), read("board.js").replace("\n", "\r\n")))


if __name__ == "__main__":
    unittest.main()
