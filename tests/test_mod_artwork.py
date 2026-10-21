"""Workshop covers remain local on the site and portable in CLI exports."""
import base64
import json
from pathlib import Path
import re
import unittest

from ba_dashboard import MOD_ART_FILES, render
from build_web import STAMP_INPUTS


ROOT = Path(__file__).resolve().parents[1]


class ModArtwork(unittest.TestCase):
    def test_catalogue_artwork_is_embedded_in_cli_and_versioned_on_site(self):
        source = (ROOT / "template/board.js").read_text(encoding="utf-8")
        catalogue = dict(re.findall(r'\{id: "(\d+)", name: [^\n]+?image: "([^"]+)"', source))
        self.assertEqual(catalogue, MOD_ART_FILES)
        for live in (False, True):
            page = render(None, live=live)
            match = re.search(r'window\.BIG_COPILOT_MOD_ART=(\{.*?\});</script>', page)
            self.assertIsNotNone(match, "CLI pages need their own cover images")
            embedded = json.loads(match[1])
            self.assertEqual(set(embedded), set(catalogue))
            for item_id, path in catalogue.items():
                prefix, content = embedded[item_id].split(",", 1)
                self.assertEqual(prefix, "data:image/webp;base64")
                self.assertEqual(base64.b64decode(content), (ROOT / "web" / path).read_bytes())
                self.assertIn("web/" + path, STAMP_INPUTS)

    def test_hosted_page_leaves_images_as_local_assets(self):
        page = render(None, site=True)
        self.assertNotIn("window.BIG_COPILOT_MOD_ART=", page)
        self.assertNotIn("data:image/webp;base64,", page)
        self.assertNotIn("images.steamusercontent.com", page)


if __name__ == "__main__":
    unittest.main()
