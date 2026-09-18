"""Regression tests for the wiki extractor (tools/wiki_data.py).

The fixtures are synthetic: a small locale and help structure written into a
temporary directory, carrying the shapes the real game files use. Nothing here
reads a private save or the installed game, so the tests hold wherever they
run, and every claim the extractor makes about a source is checked against
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
import extract_wiki
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
        """A full catalogue from the fixture directory, raw help included."""
        return wiki_data.build_catalogue(
            wiki_data.load_locale(self.locale_path() if locale is None else locale),
            help_pages=wiki_data.load_help_structure(self.structure_path())[0],
            source_files={"locale/en.json": wiki_data.file_meta(self.locale_path())},
            build_metadata=wiki_data._unknown_build(),
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

    def loose_locale(self):
        """A real en.json, with text, sitting outside any install."""
        path = os.path.join(self._tmp.name, "Desktop", "en.json")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"ba:itemname_gymcovercharge": "Gym Cover Charge"}, fh)
        return path

    def quiet(self):
        """Both CLI streams, so the suite's own output stays readable."""
        import contextlib
        import io

        @contextlib.contextmanager
        def both():
            with contextlib.redirect_stdout(io.StringIO()) as out, contextlib.redirect_stderr(
                io.StringIO()
            ) as err:
                yield err

        return both()


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
        catalogue = wiki_data.build_catalogue(locale, with_raw=False)
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

    def test_selection_pulls_the_records_a_business_talks_about(self):
        catalogue = wiki_data.build_catalogue(
            wiki_data.load_locale(self.locale_path()), businesses=["giftshop"]
        )
        ids = [r["id"] for r in catalogue["records"]]
        self.assertIn("businesstype/giftshop", ids)
        self.assertIn("item/cheapgift", ids)
        self.assertIn("recipe/cheapgiftrecipe", ids)
        self.assertIn("workstation/consumergoods", ids)
        self.assertNotIn("item/haircuttingfee", ids, "an unselected business's fee stays out")

    def test_an_unknown_business_slug_fails_loudly(self):
        with self.assertRaisesRegex(wiki_data.SourceError, "no help page"):
            wiki_data.build_catalogue(
                wiki_data.load_locale(self.locale_path()), businesses=["giftshopx"]
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

    def test_catalogue_metadata_carries_hashes_schema_and_kind(self):
        catalogue = self.extract()
        self.assertEqual(catalogue["schema"], "ba-wiki-catalogue")
        self.assertEqual(catalogue["schemaVersion"], 1)
        self.assertEqual(catalogue["source"]["kind"], "game-help")
        self.assertTrue(catalogue["generated"].endswith("Z"))
        meta = catalogue["source"]["files"]["locale/en.json"]
        self.assertEqual(len(meta["sha256"]), 64)
        self.assertGreater(meta["bytes"], 0)

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

    def test_build_metadata_is_null_until_it_is_observed(self):
        unknown = wiki_data._unknown_build()
        self.assertIsNone(unknown["steamBuildId"])
        self.assertIsNone(unknown["saveBuildNumber"])
        self.assertTrue(unknown["note"])

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
        self.assertIsNone(extract_wiki.find_steam_manifest(data_dir))
        expected = self.write("steamapps/appmanifest_1331550.acf", '"appid" "1331550"')
        self.assertEqual(extract_wiki.find_steam_manifest(data_dir), os.path.abspath(expected))

    def test_manifest_discovery_survives_the_macos_app_bundle(self):
        # Inside a .app the data directory sits four levels below steamapps, not
        # two, so counting levels finds nothing and the build id goes unknown.
        data_dir = os.path.join(
            self._tmp.name, "steamapps", "common", "Big Ambitions",
            "Big Ambitions.app", "Contents", "Resources", "Data",
        )
        expected = self.write("steamapps/appmanifest_1331550.acf", '"appid" "1331550"')
        self.assertEqual(extract_wiki.find_steam_manifest(data_dir), os.path.abspath(expected))

    def test_a_copy_outside_common_does_not_borrow_the_build_id(self):
        # Built under its own root so the answer cannot depend on where the
        # machine puts its temp directory.
        self.write("steamapps/appmanifest_1331550.acf", '"appid" "1331550"')
        stray = os.path.join(self._tmp.name, "steamapps", "backups", "Big Ambitions_Data")
        os.makedirs(stray, exist_ok=True)
        self.assertIsNone(extract_wiki.find_steam_manifest(stray))

    def test_a_library_at_a_drive_or_share_root_is_still_found(self):
        # At S:\ or \nas\steamapps the basename is empty, so a library there
        # can never be recognised by name; the manifest beside common/ is.
        root = os.path.join(self._tmp.name, "library")
        data_dir = os.path.join(root, "common", "Big Ambitions", "Big Ambitions_Data")
        os.makedirs(data_dir, exist_ok=True)
        expected = os.path.join(root, "appmanifest_1331550.acf")
        with open(expected, "w", encoding="utf-8") as fh:
            fh.write('"appid" "1331550"')
        self.assertEqual(extract_wiki.find_steam_manifest(data_dir), expected)

    def test_a_path_reaching_the_install_through_dotdot_is_accepted(self):
        through = os.path.join(self.game, "locale", os.pardir, "locale", "en.json")
        self.assertEqual(extract_wiki.game_data_dir(through),
                         extract_wiki.game_data_dir(self.locale_path()))

    def test_a_ba_locale_outside_the_install_is_refused(self):
        # BA_LOCALE can name an en.json anywhere, but helpstructure.json is only
        # beside the real locale folder; deriving a data directory from an
        # unrelated parent used to send the build looking in the wrong place.
        loose = self.loose_locale()
        with mock.patch.object(ba_save, "_LOCALE_CANDIDATES", ()),                 mock.patch.dict(os.environ, {"BA_LOCALE": loose}, clear=True):
            with self.assertRaisesRegex(wiki_data.SourceError, "StreamingAssets"):
                extract_wiki.default_paths(None)

    def test_a_loose_ba_locale_reports_cleanly_instead_of_crashing(self):
        loose = self.loose_locale()
        import contextlib
        import io
        err = io.StringIO()
        with mock.patch.object(ba_save, "_LOCALE_CANDIDATES", ()),                 mock.patch.dict(os.environ, {"BA_LOCALE": loose}, clear=True):
            with contextlib.redirect_stderr(err):
                code = extract_wiki.main(["--list"])
        self.assertEqual(code, 2)
        self.assertTrue(err.getvalue().startswith("error: "), err.getvalue())

    def test_explicit_sources_do_not_need_the_detected_install(self):
        # Naming both sources makes the install irrelevant, so the gate on it
        # must not refuse the run.
        loose = self.loose_locale()
        with mock.patch.object(ba_save, "_LOCALE_CANDIDATES", ()),                 mock.patch.dict(os.environ, {"BA_LOCALE": loose}, clear=True):
            with self.quiet():
                code = extract_wiki.main([
                    "--list", "--locale", self.locale_path(),
                    "--help-structure", self.structure_path(),
                ])
        self.assertEqual(code, 0)

    def test_no_game_anywhere_says_so(self):
        # default_paths' own refusal, which nothing reached: build_web has its
        # own message, and on a machine with the game this branch never runs.
        with mock.patch.object(ba_save, "_LOCALE_CANDIDATES", ()),                 mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(wiki_data.SourceError, "no game text found"):
                extract_wiki.default_paths(None)

    def test_a_locale_folder_by_another_name_is_refused(self):
        # StreamingAssets alone is not enough: helpstructure.json is found by
        # stepping out of locale/, so a sibling folder would mislocate it.
        beside = os.path.join(os.path.dirname(self.game), "StreamingAssets", "other", "en.json")
        self.assertIsNone(extract_wiki.game_data_dir(beside))

    def test_only_the_locale_is_needed_when_it_is_given(self):
        # The help structure is a bonus and the data dir only feeds the build
        # id, so naming the locale is enough even with no install to detect.
        with mock.patch.object(ba_save, "_LOCALE_CANDIDATES", ()),                 mock.patch.dict(os.environ, {}, clear=True):
            with self.quiet():
                code = extract_wiki.main(["--list", "--locale", self.locale_path()])
        self.assertEqual(code, 0)

    def test_a_ba_locale_inside_an_install_resolves(self):
        with mock.patch.dict(os.environ, {"BA_LOCALE": self.locale_path()}, clear=True):
            paths = extract_wiki.default_paths(None)
        self.assertEqual(paths, extract_wiki.default_paths(self.game))


    def test_raw_help_travels_separately_from_the_facts(self):
        catalogue = self.extract()
        raw = catalogue["raw"]["help"]["help_ba:businesstype_giftshop_content"]
        self.assertEqual(raw, GIFT_HELP)
        self.assertNotIn("raw", wiki_data.build_catalogue(
            wiki_data.load_locale(self.locale_path()), with_raw=False
        ))


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

    def test_the_cli_reports_a_bad_source_and_writes_nothing(self):
        self.write(os.path.join("StreamingAssets", "empty", "keep"), "")
        out = os.path.join(self._tmp.name, "out.json")
        with self.quiet() as stderr:
            code = extract_wiki.main(
                ["--data-dir", os.path.join(self.game, "empty"), "--out", out]
            )
        self.assertEqual(code, 2)
        self.assertIn("error", stderr.getvalue())
        self.assertFalse(os.path.exists(out))

    def test_the_cli_warns_and_continues_when_the_help_structure_is_unreadable(self):
        self.write(os.path.join("StreamingAssets", "helpstructure.json"), '{"unbalanced": [}')
        out = os.path.join(self._tmp.name, "out.json")
        with self.quiet() as stderr:
            code = extract_wiki.main(
                ["--data-dir", self.game, "--out", out, "--no-steam-lookup"]
            )
        self.assertEqual(code, 0)
        self.assertIn("helpstructure", stderr.getvalue())
        with open(out, encoding="utf-8") as fh:
            catalogue = json.load(fh)
        self.assertFalse(catalogue["helpStructure"]["used"])
        self.assertTrue(catalogue["helpStructure"]["error"])

    def test_the_cli_writes_nothing_when_the_locale_is_missing(self):
        out = os.path.join(self._tmp.name, "out.json")
        with self.quiet():
            code = extract_wiki.main(
                [
                    "--data-dir",
                    os.path.join(self._tmp.name, "nowhere"),
                    "--out",
                    out,
                    "--no-steam-lookup",
                ]
            )
        self.assertEqual(code, 2)
        self.assertFalse(os.path.exists(out))


# --- output: validation, atomicity, comparison ---------------------------


class OutputTests(FixtureCase):
    def setUp(self):
        super().setUp()
        self.catalogue = self.extract()
        self.out = os.path.join(self._tmp.name, "catalogue.json")

    def test_documented_data_directory_and_streaming_assets_resolve_equally(self):
        self.assertEqual(extract_wiki.default_paths(self._tmp.name), extract_wiki.default_paths(self.game))
        with self.quiet():
            code = extract_wiki.main(["--data-dir", self._tmp.name, "--out", self.out, "--no-steam-lookup"])
        self.assertEqual(code, 0)
        self.assertGreater(len(wiki_data.load_catalogue(self.out)["records"]), 0)

    def test_failed_comparison_does_not_overwrite_existing_output(self):
        wiki_data.write_catalogue(self.out, self.catalogue)
        before = self.read(self.out)
        with self.quiet():
            code = extract_wiki.main(["--data-dir", self.game, "--out", self.out, "--compare", self.out + ".missing"])
        self.assertEqual(code, 2)
        self.assertEqual(self.read(self.out), before)

    def test_output_is_stable_apart_from_the_extraction_time(self):
        first = self.extract()
        second = self.extract()
        first.pop("generated"), second.pop("generated")
        self.assertEqual(first, second)

    def test_writing_replaces_the_previous_catalogue_in_one_move(self):
        wiki_data.write_catalogue(self.out, self.catalogue)
        before = self.read(self.out)
        wiki_data.write_catalogue(
            self.out, dict(self.catalogue, generated="2099-01-01T00:00:00Z")
        )
        after = self.read(self.out)
        self.assertIn("2099-01-01", after)
        self.assertNotEqual(after, before)

    def test_a_failed_validation_leaves_the_previous_output_standing(self):
        wiki_data.write_catalogue(self.out, self.catalogue)
        before = self.read(self.out)
        with self.assertRaisesRegex(wiki_data.SourceError, "counts.records"):
            wiki_data.write_catalogue(
                self.out, dict(self.catalogue, records=self.catalogue["records"][:-1])
            )
        self.assertEqual(self.read(self.out), before)
        self.assertEqual([p for p in os.listdir(self._tmp.name) if p.startswith(".wiki-")], [])

    def test_validation_rejects_a_record_without_sources(self):
        record = dict(self.catalogue["records"][0], sources=[])
        with self.assertRaisesRegex(wiki_data.SourceError, "no sources"):
            wiki_data.write_catalogue(self.out, dict(self.catalogue, records=[record]))

    def test_validation_rejects_duplicate_ids_and_a_wrong_schema_version(self):
        doubled = [self.catalogue["records"][0]] * 2
        with self.assertRaisesRegex(wiki_data.SourceError, "duplicate record id"):
            wiki_data.validate_catalogue(dict(self.catalogue, records=doubled))
        with self.assertRaisesRegex(wiki_data.SourceError, "schemaVersion"):
            wiki_data.validate_catalogue(dict(self.catalogue, schemaVersion=99))
        with self.assertRaisesRegex(wiki_data.SourceError, "kind"):
            wiki_data.validate_catalogue(
                dict(self.catalogue, source=dict(self.catalogue["source"], kind="guessed"))
            )

    def test_comparison_reports_added_removed_and_changed(self):
        old = [
            {"id": "item/kept", "type": "item", "name": "Kept"},
            {"id": "item/gone", "type": "item", "name": "Gone"},
            {"id": "item/moved", "type": "item", "name": "Old name", "capacities": 1},
        ]
        new = [
            {"id": "item/kept", "type": "item", "name": "Kept"},
            {"id": "item/moved", "type": "item", "name": "New name", "capacities": 1},
            {"id": "item/fresh", "type": "item", "name": "Fresh"},
        ]
        diff = wiki_data.diff_records(old, new)
        self.assertEqual(diff["added"], ["item/fresh"])
        self.assertEqual(diff["removed"], ["item/gone"])
        self.assertEqual(diff["changed"], [{"id": "item/moved", "fields": ["name"]}])

    def test_comparison_ignores_the_extraction_time(self):
        old = [{"id": "item/a", "type": "item"}]
        new = [{"id": "item/a", "type": "item", "generated": "2099-01-01T00:00:00Z"}]
        self.assertEqual(wiki_data.diff_records(old, new)["changed"], [])

    def test_the_cli_compares_against_a_previous_catalogue(self):
        self.check_cli_comparison(os.path.join(self._tmp.name, "previous.json"))

    def test_the_cli_compares_before_replacing_the_same_catalogue(self):
        self.check_cli_comparison(self.out)

    def check_cli_comparison(self, previous):
        import contextlib
        import io

        with self.quiet():
            self.assertEqual(
                extract_wiki.main(["--data-dir", self.game, "--out", previous, "--all"]), 0
            )
        # A new item only becomes a record once its help page arrives too.
        locale = dict(
            LOCALE,
            **{
                "ba:itemname_newgift": "Gift (New)",
                "help_ba:itemname_newgift_content": (
                    "**Gift (New)** is a type of product primarily sold from "
                    "[Gift Shops](businesstypes-giftshop).\n\n"
                    "The product can be purchased from any "
                    "[wholesale location](wholesalers-locations)."
                ),
            },
        )
        with open(self.locale_path(), "w", encoding="utf-8") as fh:
            fh.write(json.dumps(locale, ensure_ascii=False))
        err, out = io.StringIO(), io.StringIO()
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
            code = extract_wiki.main(
                ["--data-dir", self.game, "--out", self.out, "--all", "--compare", previous]
            )
        self.assertEqual(code, 0)
        self.assertIn("1 added", out.getvalue())
        self.assertIn("+ item/newgift", out.getvalue())


if __name__ == "__main__":
    unittest.main()
