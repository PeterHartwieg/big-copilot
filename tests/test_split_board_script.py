"""tools/split_board_script.py undoes ba_dashboard.load_template()'s splice: a page
with the board script inline splits back into the committed board.html and board.js,
--join puts it back, and --resolve merges an inline branch with a split one, by
merge or by rebase, keeping both sides' edits."""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))

import split_board_script  # noqa: E402
from ba_dashboard import load_template, splice_board_script  # noqa: E402


def read(name: str) -> str:
    with open(os.path.join(ROOT, "template", name), encoding="utf-8") as fh:
        return fh.read()


class SplitBoardScript(unittest.TestCase):
    def test_the_inline_page_splits_into_the_two_files(self):
        self.assertEqual(split_board_script.split(load_template()), (read("board.html"), read("board.js")))

    def test_a_split_page_is_left_alone(self):
        self.assertIsNone(split_board_script.split(read("board.html")))

    def test_join_and_split_round_trip(self):
        joined = split_board_script.join(read("board.html"), read("board.js"))
        self.assertEqual(joined, load_template())
        self.assertEqual(splice_board_script(*split_board_script.split(joined)), joined)

    def test_a_second_slot_is_refused(self):
        page = read("board.html").replace("<body>", "<body>/*__BOARD_SCRIPT__*/", 1)
        with self.assertRaises(SystemExit):
            split_board_script.split(page)

    def test_the_slot_beside_an_inline_script_is_refused(self):
        page = load_template().replace("<body>", "<body>/*__BOARD_SCRIPT__*/", 1)
        with self.assertRaises(SystemExit):
            split_board_script.split(page)

    def test_a_last_block_that_is_not_the_board_script_is_refused(self):
        page = load_template() + "<script>\nconsole.log(1);\n</script>\n"
        with self.assertRaises(SystemExit):
            split_board_script.split(page)

    def test_conflict_markers_are_refused_by_split_and_join(self):
        marked = load_template().replace("<body>", "<<<<<<< HEAD\n<body>\n=======\n<body>\n>>>>>>> old\n", 1)
        with self.assertRaises(SystemExit):
            split_board_script.split(marked)
        with self.assertRaises(SystemExit):
            split_board_script.join(read("board.html"), "<<<<<<< HEAD\n" + read("board.js"))

    def test_line_endings_are_kept(self):
        page, script = split_board_script.split(load_template().replace("\n", "\r\n"))
        self.assertEqual((page, script), (read("board.html").replace("\n", "\r\n"), read("board.js").replace("\n", "\r\n")))


# A small board: CSS, then the board script inline, with unchanged lines
# between the edits so that git can tell them apart.
CSS = [".a{color:red}", ".pad1{}", ".pad2{}", ".c{color:green}"]
SCRIPT = ["let D = /*__DATA__*/null;", "function one(){ return 1; }", "const pad1 = 0;",
          "const pad2 = 0;", "function three(){ return 3; }"]


def inline_page(css=CSS, script=SCRIPT) -> str:
    return ("<title>t</title>\n<style>\n" + "\n".join(css) + "\n</style>\n<body>\n<script>\n"
            + "\n".join(script) + "\n</script>\n")


@unittest.skipUnless(shutil.which("git"), "needs git")
class Resolve(unittest.TestCase):
    """main splits the script and then edits the CSS and the script; an old
    branch, from before the split, edits other lines of both inline."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        os.makedirs(os.path.join(self.root, "template"))
        self.git("init", "-q", "-b", "main")
        for key, value in (("user.name", "t"), ("user.email", "t@t"), ("core.autocrlf", "false"),
                           ("commit.gpgsign", "false")):
            self.git("config", key, value)
        self.commit("base", inline_page())
        self.git("branch", "old")
        page, script = split_board_script.split(inline_page())
        self.commit("split", page, script)
        css = [c.replace("green", "lime") for c in CSS]
        script = [s.replace("return 3", "return 33") for s in SCRIPT]
        page, script = split_board_script.split(inline_page(css, script))
        self.commit("main edits", page, script)
        self.git("checkout", "-q", "old")
        css = [c.replace("red", "black") for c in CSS]
        script = [s.replace("return 1", "return 11") for s in SCRIPT]
        self.commit("old edits", inline_page(css, script))

    def tearDown(self):
        self.tmp.cleanup()

    def git(self, *args, check=True):
        return subprocess.run(["git", *args], cwd=self.root, capture_output=True, text=True, check=check,
                              env={**os.environ, "GIT_EDITOR": "true"})

    def commit(self, message, page, script=None):
        with open(os.path.join(self.root, "template", "board.html"), "w", encoding="utf-8", newline="") as fh:
            fh.write(page)
        if script is not None:
            with open(os.path.join(self.root, "template", "board.js"), "w", encoding="utf-8", newline="") as fh:
                fh.write(script)
        self.git("add", "-A")
        self.git("commit", "-q", "-m", message)

    def file(self, name):
        with open(os.path.join(self.root, "template", name), encoding="utf-8") as fh:
            return fh.read()

    def assert_both_sides(self):
        page, script = self.file("board.html"), self.file("board.js")
        self.assertIn("/*__BOARD_SCRIPT__*/", page)
        self.assertIn(".a{color:black}", page)
        self.assertIn(".c{color:lime}", page)
        self.assertIn("return 11", script)
        self.assertIn("return 33", script)
        self.assertNotIn("return 1;", script)
        self.assertNotIn("return 3;", script)

    def stopped(self, *args):
        out = self.git(*args, check=False)
        self.assertNotEqual(out.returncode, 0, "expected a conflict on board.html")
        self.assertIn("template/board.html", self.git("diff", "--name-only", "--diff-filter=U").stdout)

    def test_merging_the_old_branch_into_main(self):
        self.git("checkout", "-q", "main")
        self.stopped("merge", "old")
        self.assertEqual(split_board_script.resolve(self.root), 0)
        self.git("commit", "-q", "--no-edit")
        self.assert_both_sides()

    def test_merging_main_into_the_old_branch(self):
        self.stopped("merge", "main")
        self.assertEqual(split_board_script.resolve(self.root), 0)
        self.git("commit", "-q", "--no-edit")
        self.assert_both_sides()

    def test_rebasing_the_old_branch_onto_main(self):
        self.stopped("rebase", "main")
        self.assertEqual(split_board_script.resolve(self.root), 0)
        self.git("rebase", "--continue")
        self.assert_both_sides()
        self.assertEqual(self.git("log", "--format=%s", "-1").stdout.strip(), "old edits")

    def test_edits_to_the_same_line_are_left_for_a_human(self):
        # main made it return 33; the old branch makes it return 4.
        self.commit("old edits the same line", inline_page(script=[s.replace("return 3", "return 4") for s in SCRIPT]))
        self.git("checkout", "-q", "main")
        self.stopped("merge", "old")
        self.assertEqual(split_board_script.resolve(self.root), 1)
        script = self.file("board.js")
        self.assertIn("<<<<<<< template/board.js (ours)", script)
        self.assertIn("template/board.js", self.git("diff", "--name-only", "--diff-filter=U").stdout
                      + self.git("status", "--porcelain").stdout)


if __name__ == "__main__":
    unittest.main()
