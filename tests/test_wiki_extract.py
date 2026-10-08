"""Regression tests for the wiki parser and source paths (tools/wiki_data.py).

The fixtures are synthetic: a small locale and help structure written into a
temporary directory, carrying the shapes the real game files use. Nothing here
reads a private save or the installed game, so the tests hold wherever they
run, and every claim the parser makes about a source is checked against
text this file wrote itself.

    python -m unittest tests.test_wiki_extract
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools")
)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ba_save
import wiki_paths
import wiki_data


# --- fixtures -----------------------------------------------------------

GIFT_HELP = """**Gift Shop** businesses operate out of retail buildings.

Some of this store's items can be ordered from [Wholesalers](wholesalers-locations) and the rest can be ordered from [Importers](importers-contract) in your [Headquarters](businesstypes-headquarters).

Customers are self-serving.

The business requires the following furniture to function:

* [Stack of Shopping Baskets](furniture-stackofshoppingbaskets)
* At least one product to sell (see below)

Businesses of this type primarily sell:

* [Gift (Cheap)](products-cheapgift)
* [Umbrella](products-umbrella)

And can additionally sell:

* [Soda Can](products-sodacan)

Employees with the following skills can be assigned:

* [Customer Service](skill-customerservice)
"""

CHEAPGIFT_HELP = """**Gift (Cheap)** is a type of product primarily sold from [Gift Shops](businesstypes-giftshop).

Additionally, it can be sold from [Florists](businesstypes-florist).

The product can be placed in the following furniture:
* [Rounded Shelf](furniture-roundedshelf)

The product can be purchased from any [wholesale location](wholesalers-locations).

The product can be imported from the following locations:
* [BlueStone Imports](address: 4 pier)

The product can be manufactured using the following recipes:
* [Gift (Cheap) Recipe](recipes-cheapgiftrecipe)
"""

CLAY_HELP = """**Clay** is a raw ingredient used by [Factories](businesstypes-factory).

The product can be used by the following Factory Workstations:

* [Consumer Goods Workstation](furniture-consumergoodsworkstation)

The product can be used in the following recipes:

* [Gift (Cheap) Recipe](recipes-cheapgiftrecipe)

The product can be imported from the following locations:
* [Global Harvest Traders](address: 9 pier)
"""

ROUNDED_SHELF_HELP = """**Rounded Shelf** can be used to sell:

* [Gift (Cheap)](products-cheapgift)

**Product Capacity:**
* Gifts: 1,200
**Customer Capacity:** 15

The furniture can be purchased from the following locations:
* [AJ Pederson & Son](address:13 5a)
"""

FEE_HELP = """**Hair Cutting Fee** is collected from customers when they enter a [Hairdresser](businesstypes-hairdresser) business and choose that service.

To collect this fee, the following is required:
* [Hairdresser Chair](furniture-hairdresserchair) or [Hairdresser Chair (Modern)](furniture-hairdresserchairmodern)
* [Hair Stylist](skill-hairstylist)
"""

RECIPE_HELP = """**Gift (Cheap) Recipe** can be manufactured in a [Factory](businesstypes-factory).

**Required Workstation**:
* [Consumer Goods Workstation](furniture-consumergoodsworkstation)

**Required Raw Ingredients Per Hour:**

* 50 X [Clay](products-clay)

**Max Production Rate Per Hour:**

* 1,000 [Gift (Cheap)](products-cheapgift)
"""

WORKSTATION_HELP = """A **Consumer Goods Workstation** is created by adding Production Machines:
* [Laser Cutting Machine](furniture-lasercuttingmachine)

To an Assembly Machine
* [Consumer Goods Assembly Machine](furniture-consumergoodsassemblymachine)

The workstation can be used to create:
* [Gift (Cheap)](recipes-cheapgiftrecipe)
"""

LOCALE = {
    "ba:businesstype_giftshop": "Gift Shop",
    "help_ba:businesstype_giftshop_content": GIFT_HELP,
    "ba:itemname_cheapgift": "Gift (Cheap)",
    "help_ba:itemname_cheapgift_content": CHEAPGIFT_HELP,
    "ba:itemname_umbrella": "Umbrella",
    "ba:itemname_sodacan": "Soda Can",
    "ba:itemname_stackofshoppingbaskets": "Stack of Shopping Baskets",
    "ba:itemname_clay": "Clay",
    "help_ba:itemname_clay_content": CLAY_HELP,
    "ba:itemname_roundedshelf": "Rounded Shelf",
    "help_ba:itemname_roundedshelf_content": ROUNDED_SHELF_HELP,
    "ba:itemname_haircuttingfee": "Hair Cutting Fee",
    "help_ba:itemname_haircuttingfee_content": FEE_HELP,
    "ba:itemname_lasercuttingmachine": "Laser Cutting Machine",
    "ba:itemname_consumergoodsassemblymachine": "Consumer Goods Assembly Machine",
    "ba:itemname_consumergoodsworkstation": "Consumer Goods Workstation",
    "recipes_cheapgiftrecipe": "Gift (Cheap) Recipe",
    "help_recipes_cheapgiftrecipe_content": RECIPE_HELP,
    "help_factory_workstation_consumergoods_content": WORKSTATION_HELP,
}

# Trailing commas on purpose: the game's own file is hand-edited the same way.
HELP_STRUCTURE = """[
  {
    "CategoryLocalizorKey": "help_biztypes",
    "pages": [
	  {
        "slug": "businesstypes-giftshop",
        "pageLocalizorKeyPrefix" : "ba:businesstype_giftshop"
      },
    ]
  },
  {
    "CategoryLocalizorKey": "help_products",
  \t"pages": [
	  {
        "slug": "products-cheapgift",
        "pageLocalizorKeyPrefix": "ba:itemname_cheapgift"
      }
    ]
  },
]
"""


class FixtureCase(unittest.TestCase):
    """A case with its own synthetic StreamingAssets directory."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.game = os.path.join(self._tmp.name, "StreamingAssets")
        os.makedirs(os.path.join(self.game, "locale"))
        with open(os.path.join(self.game, "locale", "en.json"), "w", encoding="utf-8") as fh:
            fh.write(json.dumps(LOCALE, ensure_ascii=False))
        with open(os.path.join(self.game, "helpstructure.json"), "w", encoding="utf-8") as fh:
            fh.write(HELP_STRUCTURE)

    # helpers
    def extract(self, locale=None):
        """Parsed records from the fixture directory."""
        return wiki_data.build_catalogue(
            wiki_data.load_locale(self.locale_path() if locale is None else locale),
            help_pages=wiki_data.load_help_structure(self.structure_path())[0],
        )

    def locale_path(self):
        return os.path.join(self.game, "locale", "en.json")

    def structure_path(self):
        return os.path.join(self.game, "helpstructure.json")

    def write(self, relative, text):
        path = os.path.join(self._tmp.name, relative)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text)
        return path

    def record(self, catalogue, record_id):
        return next(r for r in catalogue["records"] if r["id"] == record_id)

    def read(self, path):
        with open(path, encoding="utf-8") as fh:
            return fh.read()

    def link_dir(self, link, target):
        """A directory link, by whatever means this platform allows.

        os.symlink needs a privilege Windows does not grant by default, and a
        skip there would leave game_layout's literal half untested on the only
        platform this suite runs on. Junctions need no such right.
        """
        os.makedirs(os.path.dirname(link), exist_ok=True)
        if sys.platform == "win32":
            import subprocess
            done = subprocess.run(["cmd", "/c", "mklink", "/J", link, target],
                                  capture_output=True, text=True)
            if done.returncode:
                self.skipTest(f"mklink failed: {(done.stdout + done.stderr).strip()}")
        else:
            try:
                os.symlink(target, link, target_is_directory=True)
            except (OSError, NotImplementedError, AttributeError) as exc:
                self.skipTest(f"directory links unavailable here: {exc}")
        return link

    def loose_locale(self):
        """A real en.json, with text, sitting outside any install."""
        path = os.path.join(self._tmp.name, "Desktop", "en.json")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"ba:itemname_gymcovercharge": "Gym Cover Charge"}, fh)
        return path

# --- parsing: requirements, ranges and recipes ---------------------------


class ParsingTests(FixtureCase):
    def test_a_business_record_carries_its_range_and_fittings(self):
        gift = self.record(self.extract(), "businesstype/giftshop")
        self.assertEqual(gift["name"], "Gift Shop")
        self.assertEqual(
            [item["slug"] for item in gift["products"]["primary"]],
            ["ba:itemname_cheapgift", "ba:itemname_umbrella"],
        )
        self.assertEqual(
            [item["slug"] for item in gift["products"]["additional"]],
            ["ba:itemname_sodacan"],
        )
        self.assertEqual(
            [item["slug"] for item in gift["furnitureRequired"]],
            ["ba:itemname_stackofshoppingbaskets"],
        )
        self.assertEqual(
            [skill["slug"] for skill in gift["skills"]], ["ba:skill_customerservice"]
        )
        self.assertEqual(gift["suppliers"], {"wholesalers": "some", "importers": "rest"})

    def test_a_requirement_the_help_states_in_words_is_reported_not_dropped(self):
        issues = self.extract()["unparsed"]
        issue = next(i for i in issues if i["record"] == "businesstype/giftshop")
        self.assertEqual(issue["field"], "furnitureRequired")
        self.assertIn("At least one product to sell", issue["text"])

    def test_a_requirement_offered_as_alternatives_is_not_read_as_a_list(self):
        fee = self.record(self.extract(), "item/haircuttingfee")
        self.assertEqual(fee["kind"], "fee")
        # The "or" bullet is not claimed as "all of these"; the unambiguous
        # skill link stands and the alternative stays in the raw help.
        self.assertEqual(
            [r["slug"] for r in fee["feeRequirements"]], ["ba:skill_hairstylist"]
        )
        issue = next(
            i for i in self.extract()["unparsed"] if i["record"] == "item/haircuttingfee"
        )
        self.assertEqual(issue["field"], "feeRequirements")
        self.assertIn("alternatives", issue["reason"])
        self.assertIn("Hairdresser Chair", issue["text"])

    def test_item_records_carry_furniture_recipes_and_suppliers(self):
        gift = self.record(self.extract(), "item/cheapgift")
        self.assertEqual(gift["kind"], "product")
        self.assertEqual(
            [ref["slug"] for ref in gift["soldFrom"]["primaryBusinesses"]],
            ["ba:businesstype_giftshop"],
        )
        self.assertEqual(
            [ref["slug"] for ref in gift["soldFrom"]["otherBusinesses"]],
            ["ba:businesstype_florist"],
        )
        self.assertEqual(
            [ref["slug"] for ref in gift["furniture"]], ["ba:itemname_roundedshelf"]
        )
        self.assertEqual(
            [ref["slug"] for ref in gift["recipes"]["makes"]], ["recipe/cheapgiftrecipe"]
        )
        self.assertIs(gift["suppliers"]["wholesale"], True)
        self.assertEqual(
            gift["suppliers"]["importers"],
            [{"name": "BlueStone Imports", "address": "4 pier"}],
        )

    def test_capacities_come_from_the_text_and_not_from_a_default(self):
        catalogue = self.extract()
        shelf = self.record(catalogue, "item/roundedshelf")
        self.assertEqual(shelf["capacities"]["customer"], 15)
        self.assertEqual(shelf["capacities"]["product"], [{"label": "Gifts", "value": 1200}])
        gift = self.record(catalogue, "item/cheapgift")
        self.assertIsNone(gift["capacities"]["customer"])
        self.assertEqual(gift["capacities"]["product"], [])

    def test_recipe_rates_ingredients_and_workstation(self):
        recipe = self.record(self.extract(), "recipe/cheapgiftrecipe")
        self.assertEqual(recipe["name"], "Gift (Cheap) Recipe")
        self.assertEqual(
            recipe["output"],
            {"slug": "ba:itemname_cheapgift", "name": "Gift (Cheap)", "perHour": 1000},
        )
        self.assertEqual(
            recipe["ingredients"],
            [{"slug": "ba:itemname_clay", "name": "Clay", "perHour": 50}],
        )
        self.assertEqual(
            recipe["workstation"]["slug"], "ba:itemname_consumergoodsworkstation"
        )

    def test_a_recipe_without_a_rated_output_produces_no_record(self):
        """The dashboard skips these too; a rate invented here would be a lie."""
        locale = dict(LOCALE)
        locale["help_recipes_ghostrecipe_content"] = (
            "**Ghost Recipe** can be manufactured in a [Factory](businesstypes-factory)."
        )
        catalogue = wiki_data.build_catalogue(locale)
        self.assertNotIn("recipe/ghostrecipe", [r["id"] for r in catalogue["records"]])

    def test_workstation_records_carry_machines_assembly_and_recipes(self):
        station = self.record(self.extract(), "workstation/consumergoods")
        self.assertEqual(
            [ref["slug"] for ref in station["machines"]], ["ba:itemname_lasercuttingmachine"]
        )
        self.assertEqual(
            [ref["slug"] for ref in station["assemblyMachines"]],
            ["ba:itemname_consumergoodsassemblymachine"],
        )
        self.assertEqual(
            [ref["slug"] for ref in station["recipes"]], ["recipe/cheapgiftrecipe"]
        )

    def test_a_locale_without_business_help_is_not_an_empty_catalogue(self):
        with self.assertRaisesRegex(wiki_data.SourceError, "no help_ba:businesstype"):
            wiki_data.build_catalogue({"ba:itemname_clay": "Clay"})


# --- provenance ----------------------------------------------------------


class ProvenanceTests(FixtureCase):
    def test_every_record_names_the_keys_it_was_read_from(self):
        catalogue = self.extract()
        for entry in catalogue["records"]:
            self.assertTrue(entry["sources"], entry["id"])
        gift = self.record(catalogue, "businesstype/giftshop")
        for key in (
            "ba:businesstype_giftshop",
            "help_ba:businesstype_giftshop_content",
            "helpstructure:businesstypes-giftshop",
        ):
            self.assertIn(key, gift["sources"])

    def test_helpstructure_parse_is_recorded_with_its_repairs(self):
        _, info = wiki_data.load_help_structure(self.structure_path())
        self.assertEqual(info["parseMode"], "lenient")
        self.assertTrue(info["repairs"])

    def test_clean_helpstructure_needs_no_repair(self):
        _, info = wiki_data.load_help_structure(
            self.write("clean.json", json.dumps([{"CategoryLocalizorKey": "c", "pages": []}]))
        )
        self.assertEqual(info, {"parseMode": "strict", "repairs": []})

    def test_a_broken_helpstructure_fails_rather_than_lying(self):
        with self.assertRaisesRegex(wiki_data.SourceError, "will not parse"):
            wiki_data.load_help_structure(self.write("broken.json", '{"unbalanced": [}'))

    def test_a_steam_manifest_gives_its_build_id_and_says_where_from(self):
        manifest = self.write("appmanifest_1331550.acf", '"AppState"\n{\n"appid" "1331550"\n\t"buildid"\t\t"4242"\n}\n')
        meta = wiki_data.steam_build_id(manifest)
        self.assertEqual(meta["steamBuildId"], "4242")
        self.assertTrue(meta["steamBuildIdSource"].endswith("appmanifest_1331550.acf"))
        self.assertIsNone(meta["saveBuildNumber"])
        self.assertIn("save build number", meta["note"])

    def test_a_manifest_without_a_build_id_is_an_error_not_a_zero(self):
        manifest = self.write("appmanifest_1331550.acf", '"AppState"\n{\n"appid" "1331550"\n}\n')
        with self.assertRaisesRegex(wiki_data.SourceError, "no buildid"):
            wiki_data.steam_build_id(manifest)

    def test_another_games_manifest_cannot_supply_the_build_id(self):
        manifest = self.write("wrong.acf", '"appid" "1"\n"buildid" "4242"')
        with self.assertRaisesRegex(wiki_data.SourceError, "appid 1331550"):
            wiki_data.steam_build_id(manifest)

    def test_manifest_discovery_selects_only_big_ambitions(self):
        data_dir = os.path.join(self._tmp.name, "steamapps", "common", "Big Ambitions", "Big Ambitions_Data")
        self.write("steamapps/appmanifest_1.acf", '"appid" "1"')
        self.assertIsNone(wiki_paths.find_steam_manifest(data_dir))
        expected = self.write("steamapps/appmanifest_1331550.acf", '"appid" "1331550"')
        self.assertEqual(wiki_paths.find_steam_manifest(data_dir), os.path.abspath(expected))

    def test_manifest_discovery_survives_the_macos_app_bundle(self):
        # Inside a .app the data directory sits four levels below steamapps, not
        # two, so counting levels finds nothing and the build id goes unknown.
        data_dir = os.path.join(
            self._tmp.name, "steamapps", "common", "Big Ambitions",
            "Big Ambitions.app", "Contents", "Resources", "Data",
        )
        expected = self.write("steamapps/appmanifest_1331550.acf", '"appid" "1331550"')
        self.assertEqual(wiki_paths.find_steam_manifest(data_dir), os.path.abspath(expected))

    def test_a_copy_outside_common_does_not_borrow_the_build_id(self):
        # Built under its own root so the answer cannot depend on where the
        # machine puts its temp directory.
        self.write("steamapps/appmanifest_1331550.acf", '"appid" "1331550"')
        stray = os.path.join(self._tmp.name, "steamapps", "backups", "Big Ambitions_Data")
        os.makedirs(stray, exist_ok=True)
        self.assertIsNone(wiki_paths.find_steam_manifest(stray))

    def test_a_library_at_a_drive_or_share_root_is_still_found(self):
        # At S:\ or \nas\steamapps the basename is empty, so a library there
        # can never be recognised by name; the manifest beside common/ is.
        root = os.path.join(self._tmp.name, "library")
        data_dir = os.path.join(root, "common", "Big Ambitions", "Big Ambitions_Data")
        os.makedirs(data_dir, exist_ok=True)
        expected = os.path.join(root, "appmanifest_1331550.acf")
        with open(expected, "w", encoding="utf-8") as fh:
            fh.write('"appid" "1331550"')
        self.assertEqual(wiki_paths.find_steam_manifest(data_dir), expected)

    def test_a_path_reaching_the_install_through_dotdot_is_accepted(self):
        through = os.path.join(self.game, "locale", os.pardir, "locale", "en.json")
        expected = wiki_paths.game_data_dir(self.locale_path())
        self.assertIsNotNone(expected)
        self.assertEqual(wiki_paths.game_data_dir(through), expected)

    def test_a_ba_locale_outside_the_install_is_refused(self):
        # BA_LOCALE can name an en.json anywhere, but helpstructure.json is only
        # beside the real locale folder; deriving a data directory from an
        # unrelated parent used to send the build looking in the wrong place.
        loose = self.loose_locale()
        with mock.patch.object(ba_save, "_LOCALE_CANDIDATES", ()),                 mock.patch.dict(os.environ, {"BA_LOCALE": loose}, clear=True):
            with self.assertRaisesRegex(wiki_data.SourceError, "StreamingAssets"):
                wiki_paths.default_paths(None)

    def test_no_game_anywhere_says_so(self):
        # default_paths' own refusal, which nothing reached: build_web has its
        # own message, and on a machine with the game this branch never runs.
        # DEFAULT_LOCALE is _LOCALE_CANDIDATES[0], so once detection has found
        # nothing there is nothing left to try. Pointed here at a file that
        # does exist: a fallback to it would return instead of raising, which
        # is what makes this fail if that dead branch comes back.
        with mock.patch.object(ba_save, "_LOCALE_CANDIDATES", ()),                 mock.patch.object(ba_save, "DEFAULT_LOCALE", self.locale_path()),                 mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(wiki_data.SourceError, "no game text found"):
                wiki_paths.default_paths(None)

    def test_a_short_name_for_the_install_is_accepted(self):
        # The realpath half of game_layout. Judging the spelling refuses this,
        # and the Windows CLI is where 8.3 names turn up.
        if sys.platform != "win32":
            self.skipTest("8.3 short names are a Windows filesystem feature")
        import ctypes
        buf = ctypes.create_unicode_buffer(1024)
        if not ctypes.windll.kernel32.GetShortPathNameW(self.locale_path(), buf, 1024):
            self.skipTest("no short name on this volume")
        short = buf.value
        if os.path.normcase(short) == os.path.normcase(self.locale_path()):
            self.skipTest("8.3 names are disabled on this volume")
        self.assertTrue(os.path.isfile(short))
        # Both sides being None would satisfy an equality on its own, so the
        # expected answer is named outright.
        expected = wiki_paths.game_data_dir(self.locale_path())
        self.assertIsNotNone(expected)
        self.assertEqual(wiki_paths.game_data_dir(short), expected)

    def test_a_locale_folder_linked_out_of_an_install_stays_inside_it(self):
        # game_layout's literal half. The target is deliberately NOT named
        # locale/, so resolving refuses it and only the spelling as written
        # recognises the install -- which is what this pins.
        modded = os.path.join(self._tmp.name, "modded-text")
        os.makedirs(modded, exist_ok=True)
        with open(os.path.join(modded, "en.json"), "w", encoding="utf-8") as fh:
            json.dump({"ba:itemname_gymcovercharge": "Modded"}, fh)
        install = os.path.join(self._tmp.name, "other", "Big Ambitions_Data", "StreamingAssets")
        via = os.path.join(self.link_dir(os.path.join(install, "locale"), modded), "en.json")
        self.assertTrue(os.path.isfile(via))
        self.assertIsNone(wiki_paths.game_data_dir(os.path.realpath(via)))
        self.assertEqual(wiki_paths.game_data_dir(via), os.path.dirname(install))

    def test_the_two_directories_always_belong_together(self):
        # helpstructure.json is read beside the locale folder. Deriving the
        # data dir from one spelling and the streaming dir from another leaves
        # it genuinely absent, not merely named oddly, so this links a locale
        # into an install rather than reaching one through "..".
        b_locale = os.path.join(self._tmp.name, "real", "Big Ambitions_Data",
                                "StreamingAssets", "locale")
        os.makedirs(b_locale, exist_ok=True)
        with open(os.path.join(b_locale, "en.json"), "w", encoding="utf-8") as fh:
            json.dump({"ba:itemname_gymcovercharge": "Gym"}, fh)
        streaming = os.path.dirname(b_locale)
        structure = os.path.join(streaming, "helpstructure.json")
        with open(structure, "w", encoding="utf-8") as fh:
            json.dump({}, fh)
        via = os.path.join(self.link_dir(os.path.join(self._tmp.name, "away", "locale"),
                                         b_locale), "en.json")
        with mock.patch.object(ba_save, "_LOCALE_CANDIDATES", (via,)),                 mock.patch.dict(os.environ, {}, clear=True):
            paths = wiki_paths.default_paths(None)
        self.assertTrue(os.path.isfile(paths["help_structure"]), paths["help_structure"])
        self.assertEqual(os.path.realpath(paths["help_structure"]), os.path.realpath(structure))

    def test_a_locale_folder_by_another_name_is_refused(self):
        # StreamingAssets alone is not enough: helpstructure.json is found by
        # stepping out of locale/, so a sibling folder would mislocate it.
        beside = os.path.join(os.path.dirname(self.game), "StreamingAssets", "other", "en.json")
        self.assertIsNone(wiki_paths.game_data_dir(beside))

    def test_an_install_linked_into_another_is_filed_under_its_own(self):
        # game_layout's resolved half, and why it goes first: install A's
        # en.json reaching into install B must be filed under B, or the
        # catalogue records B's text beside A's help pages and build id.
        b_locale = os.path.join(self._tmp.name, "B", "Big Ambitions_Data",
                                "StreamingAssets", "locale")
        os.makedirs(b_locale, exist_ok=True)
        with open(os.path.join(b_locale, "en.json"), "w", encoding="utf-8") as fh:
            json.dump({"ba:itemname_gymcovercharge": "From B"}, fh)
        a_streaming = os.path.join(self._tmp.name, "A", "Big Ambitions_Data", "StreamingAssets")
        via = os.path.join(self.link_dir(os.path.join(a_streaming, "locale"), b_locale), "en.json")
        self.assertTrue(os.path.isfile(via))
        b_data = os.path.realpath(os.path.dirname(os.path.dirname(b_locale)))
        self.assertEqual(wiki_paths.game_data_dir(via), b_data)

    def test_a_ba_locale_inside_an_install_resolves(self):
        # macOS may expose the temp root through the /var -> /private/var alias.
        self.game = os.path.realpath(self.game)
        with mock.patch.dict(os.environ, {"BA_LOCALE": self.locale_path()}, clear=True):
            paths = wiki_paths.default_paths(None)
        self.assertEqual(paths, wiki_paths.default_paths(self.game))


# --- malformed sources ---------------------------------------------------


class MalformedSourceTests(FixtureCase):
    def test_a_missing_locale_file_is_a_clear_failure(self):
        with self.assertRaisesRegex(wiki_data.SourceError, "cannot read"):
            wiki_data.load_locale(os.path.join(self.game, "locale", "missing.json"))

    def test_a_locale_that_is_not_json_is_a_clear_failure(self):
        path = self.write(os.path.join("StreamingAssets", "bad.json"), "not json at all")
        with self.assertRaisesRegex(wiki_data.SourceError, "not valid JSON"):
            wiki_data.load_locale(path)

    def test_a_locale_that_is_not_an_object_is_a_clear_failure(self):
        path = self.write(os.path.join("StreamingAssets", "list.json"), "[]")
        with self.assertRaisesRegex(wiki_data.SourceError, "expected an object"):
            wiki_data.load_locale(path)

# --- source paths -------------------------------------------------------


class PathTests(FixtureCase):
    def test_documented_data_directory_and_streaming_assets_resolve_equally(self):
        self.assertEqual(wiki_paths.default_paths(self._tmp.name),
                         wiki_paths.default_paths(self.game))


if __name__ == "__main__":
    unittest.main()
