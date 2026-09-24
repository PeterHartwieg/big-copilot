"""skillNames: the game's own name for every skill a station can ask for, so the
write dialogs never spell a role from its slug."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
import es3_fixture  # noqa: E402
import ba_dashboard  # noqa: E402
from ba_save import Names, load_save  # noqa: E402


class SkillNames(unittest.TestCase):
    def test_every_station_skill_is_named_from_the_game_text(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "link.hsg")
            es3_fixture.write_link_save(path)
            data = ba_dashboard.extract(load_save(path), Names({"ba:skill_securityguard": "Security Guard"}), None)
        skills = {s for kinds in ba_dashboard.STATION_SKILLS.values() for s in kinds}
        self.assertEqual(list(data["skillNames"]), sorted(skills), "every skill, in a stable order")
        self.assertEqual(data["skillNames"]["ba:skill_securityguard"], "Security Guard")
        # A skill the text does not name falls back as names.label() does.
        self.assertEqual(data["skillNames"]["ba:skill_cleaning"], "Cleaning")


if __name__ == "__main__":
    unittest.main()
