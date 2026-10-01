"""Every stylesheet reads as its author wrote it: each comment opens before it
closes and closes before the sheet ends, and no conflict marker is left in it.

A comment whose opener has gone (a merge that took the line for a conflict
marker, say) does not fail loudly: the browser reads the comment's prose as the
selector of the next rule and drops that rule. The shell's dark-theme variables
were lost that way once (docs/ui-chunk-1-handoff.md), and a count of openers
against closers does not see it, since the stray opener left elsewhere
balances the orphan closer. So each sheet is walked in order.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MARKER = re.compile(r"^(<{7}|={7}|>{7})( |$)", re.M)


def walk(css):
    """The problems in one sheet, in order: an orphan closer, an opener inside
    a comment, or a comment still open at the end. Strings are skipped."""
    problems, i, n = [], 0, len(css)
    line = lambda at: css.count("\n", 0, at) + 1
    while i < n:
        c = css[i]
        if c in "\"'":
            end = css.find(c, i + 1)
            while end != -1 and css[end - 1] == "\\":
                end = css.find(c, end + 1)
            if end == -1 or "\n" in css[i:end]:
                i += 1  # an apostrophe in a value, not a string
                continue
            i = end + 1
        elif css.startswith("/*", i):
            end = css.find("*/", i + 2)
            if end == -1:
                problems.append(f"line {line(i)}: a comment is still open at the end of the sheet")
                break
            i = end + 2
        elif css.startswith("*/", i):
            problems.append(f"line {line(i)}: '*/' closes no comment")
            i += 2
        else:
            i += 1
    return problems


class CssIntegrity(unittest.TestCase):
    def sheets(self):
        styles = re.findall(r"<style[^>]*>(.*?)</style>", (ROOT / "template" / "board.html").read_text(encoding="utf-8"), re.S)
        self.assertTrue(styles, "template/board.html has its stylesheet")
        out = [(f"template/board.html <style> {k + 1}", css) for k, css in enumerate(styles)]
        for name in ("map.css", "wiki.css", "community.css"):
            out.append((f"web/{name}", (ROOT / "web" / name).read_text(encoding="utf-8")))
        return out

    def test_every_comment_opens_and_closes_in_order(self):
        for name, css in self.sheets():
            with self.subTest(sheet=name):
                self.assertEqual(walk(css), [])

    def test_no_conflict_marker_is_left_in_a_sheet(self):
        for name, css in self.sheets():
            with self.subTest(sheet=name):
                self.assertIsNone(MARKER.search(css), name)

    def test_the_walk_sees_a_moved_opener(self):
        # The failure it guards against, in small: an opener moved to the end.
        broken = "a{b:c}\n   prose of a comment. */\n:root{--x:1}\n/* opener ==</style>"
        found = walk(broken)
        self.assertTrue(any("closes no comment" in p for p in found), found)
        self.assertTrue(any("still open" in p for p in found), found)
        self.assertEqual(walk("a{b:c}/* fine */\n:root{--x:'*/'}"), [])


if __name__ == "__main__":
    unittest.main()
