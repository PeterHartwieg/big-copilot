"""The CLI says what is wrong when there is no save folder to read.

SAVE_ROOT is built from USERPROFILE, which only Windows sets, so off Windows it
is a bare relative string rather than a path. A run with no argument used to
hand that string to os.listdir and print the traceback; --list quietly fell back
to it when its argument was a typo.
"""
import os
import sys
import tempfile
import unittest
from unittest import mock

import ba_dashboard

# What SAVE_ROOT holds off Windows: the join with an unset USERPROFILE.
RELATIVE = os.path.join("", r"AppData\LocalLow\Hovgaard Games\Big Ambitions")
# A Windows-shaped SAVE_ROOT that is simply not there.
ABSENT = os.path.join(tempfile.gettempdir(), "big-copilot-no-such-save-folder")


class NoSaveFolder(unittest.TestCase):
    def test_no_argument_off_windows_names_no_path(self):
        with mock.patch.object(ba_dashboard, "SAVE_ROOT", RELATIVE):
            with self.assertRaises(SystemExit) as cm:
                ba_dashboard.resolve_target(None)
        message = str(cm.exception)
        self.assertIn("no save folder to look in", message)
        self.assertNotIn("AppData", message)
        self.assertIn(".hsg", message)
        self.assertIn("bigcopilot.com", message)

    def test_the_message_holds_no_windows_separator_off_windows(self):
        """Only macOS and Linux see this branch, where a \\ is not a path."""
        with mock.patch.object(ba_dashboard, "SAVE_ROOT", RELATIVE):
            with self.assertRaises(SystemExit) as cm:
                ba_dashboard.resolve_target(None)
        self.assertNotIn("\\", str(cm.exception))

    def test_no_argument_on_windows_names_the_folder(self):
        with mock.patch.object(ba_dashboard, "SAVE_ROOT", ABSENT):
            with self.assertRaises(SystemExit) as cm:
                ba_dashboard.resolve_target(None)
        self.assertIn(ABSENT, str(cm.exception))

    def test_a_name_without_a_save_folder_says_both(self):
        with mock.patch.object(ba_dashboard, "SAVE_ROOT", RELATIVE):
            with self.assertRaises(SystemExit) as cm:
                ba_dashboard.resolve_target("Costy Co")
        message = str(cm.exception)
        self.assertIn("Costy Co does not exist", message)
        self.assertIn("no save folder to look in", message)

    def test_list_without_a_save_folder_says_the_same(self):
        with mock.patch.object(ba_dashboard, "SAVE_ROOT", RELATIVE), \
                mock.patch.object(sys, "argv", ["ba_dashboard.py", "--list"]):
            with self.assertRaises(SystemExit) as cm:
                ba_dashboard.main()
        self.assertIn("no save folder to look in", str(cm.exception))

    def test_list_names_an_argument_that_is_not_there(self):
        missing = os.path.join(ABSENT, "Costy Co")
        with mock.patch.object(ba_dashboard, "SAVE_ROOT", RELATIVE), \
                mock.patch.object(sys, "argv", ["ba_dashboard.py", "--list", missing]):
            with self.assertRaises(SystemExit) as cm:
                ba_dashboard.main()
        message = str(cm.exception)
        self.assertTrue(message.startswith(f"{missing} does not exist"), message)
        # A dead end would be the old silent fallback in a new coat: say what --list takes.
        self.assertIn("takes the save folder or a save file", message)

    def test_list_takes_a_save_file_and_reads_its_folder(self):
        printed = []
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "New Costy Co Save Game.hsg")
            open(path, "wb").close()
            with mock.patch.object(ba_dashboard, "SAVE_ROOT", RELATIVE), \
                    mock.patch.object(sys, "argv", ["ba_dashboard.py", "--list", path]), \
                    mock.patch("builtins.print", lambda *a, **k: printed.append(" ".join(str(x) for x in a))):
                ba_dashboard.main()
        self.assertIn("New Costy Co Save Game", "\n".join(printed))

    def test_a_save_file_named_on_its_own_has_a_folder(self):
        """`--list mysave.hsg` from the folder holding it: dirname is empty."""
        here = os.getcwd()
        with tempfile.TemporaryDirectory() as folder:
            open(os.path.join(folder, "New Costy Co Save Game.hsg"), "wb").close()
            try:
                os.chdir(folder)
                groups = ba_dashboard.catalogue("New Costy Co Save Game.hsg")
            finally:
                os.chdir(here)
        self.assertEqual([s["name"] for g in groups for s in g["saves"]],
                         ["New Costy Co Save Game"])

    def test_backfill_from_a_save_named_on_its_own(self):
        """--backfill has the same empty dirname; the save itself need not parse."""
        here = os.getcwd()
        printed = []
        with tempfile.TemporaryDirectory() as folder:
            open(os.path.join(folder, "New Costy Co Save Game.hsg"), "wb").close()
            try:
                os.chdir(folder)
                with mock.patch("builtins.print", lambda *a, **k: printed.append(str(a[0]))):
                    recorded = ba_dashboard.backfill_history(
                        "New Costy Co Save Game.hsg", "market_history.json", None
                    )
            finally:
                os.chdir(here)
        self.assertEqual(recorded, 0)  # unparseable, but it was found and tried
        self.assertIn("Seeding demand history from 1 saves", "\n".join(printed))


class SaveFolderPresent(unittest.TestCase):
    """The guard must stay out of the way when the folder is really there."""

    def test_no_argument_returns_the_save_folder(self):
        with tempfile.TemporaryDirectory() as folder:
            with mock.patch.object(ba_dashboard, "SAVE_ROOT", folder):
                self.assertEqual(ba_dashboard.resolve_target(None), folder)

    def test_list_refuses_a_name_rather_than_ignoring_it(self):
        """main silently listed everything when --list was handed a name."""
        with tempfile.TemporaryDirectory() as folder:
            character = os.path.join(folder, "0123456789abcdef")
            os.mkdir(character)
            open(os.path.join(character, "New Costy Co Save Game.hsg"), "wb").close()
            with mock.patch.object(ba_dashboard, "SAVE_ROOT", folder), \
                    mock.patch.object(sys, "argv", ["ba_dashboard.py", "--list", "Costy"]):
                with self.assertRaises(SystemExit) as cm:
                    ba_dashboard.main()
        self.assertIn("Costy does not exist", str(cm.exception))

    def test_a_name_is_still_looked_up_in_that_folder(self):
        with tempfile.TemporaryDirectory() as folder:
            character = os.path.join(folder, "0123456789abcdef")
            os.mkdir(character)
            path = os.path.join(character, "New Costy Co Save Game.hsg")
            open(path, "wb").close()
            with mock.patch.object(ba_dashboard, "SAVE_ROOT", folder):
                found = ba_dashboard.resolve_target("New Costy Co Save Game")
        self.assertEqual(found, path)


if __name__ == "__main__":
    unittest.main()
