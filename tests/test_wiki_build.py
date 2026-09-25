"""Regression tests for the public wiki payload (tools/build_wiki_data.py).

The fixtures are synthetic, as in test_wiki_extract: a small locale, help
structure, building table and shipped layout written into a temporary
directory, carrying the shapes the real files use. Nothing here reads a private
save or the installed game. What the suite is for: the contract holds, a change
in the game text moves the facts and not just a hash, a source that is missing
or broken is reported rather than papered over, and no build writes a path
from the machine it ran on.

    python -m unittest tests.test_wiki_build
"""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import unittest
from datetime import datetime, timezone

sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools")
)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import build_wiki_data as build
import extract_wiki
import wiki_data


# --- fixtures ------------------------------------------------------------

GIFT_HELP = """**Gift Shop** businesses operate out of retail buildings.

Customers are self-serving.

Some of this store's items can be ordered from [Wholesalers](wholesalers-locations).

The business requires the following furniture to function:

* [Stack of Shopping Baskets](furniture-stackofshoppingbaskets)
* At least one product to sell (see below)

Businesses of this type primarily sell:

* [Gift (Cheap)](products-cheapgift)

And can additionally sell:

* [Soda Can](products-sodacan)

Employees with the following skills can be assigned:

* [Customer Service](skill-customerservice)
"""

CHEAPGIFT_HELP = """**Gift (Cheap)** is a type of product primarily sold from [Gift Shops](businesstypes-giftshop).

Additionally, it can be sold from:

* [Florists](businesstypes-florist)

The product can be placed in the following furniture:
* [Rounded Shelf](furniture-roundedshelf)

The product can be purchased from any [wholesale location](wholesalers-locations).

The product can be imported from the following locations:
* [BlueStone Imports](address: 4 pier)

The product can be manufactured using the following recipes:
* [Gift (Cheap) Recipe](recipes-cheapgiftrecipe)
"""

ROUNDED_SHELF_HELP = """**Rounded Shelf** can be used to sell:

* [Gift (Cheap)](products-cheapgift)

**Product Capacity:**
* Gifts: 300
**Customer Capacity:** 15

The furniture can be purchased from the following locations:
* [AJ Pederson & Son](address:13 5a)
"""

BASKETS_HELP = """**Stack of Shopping Baskets** are required in all retail businesses.

**Customer Capacity:** 30

The furniture can be purchased from the following locations:
* [Square Appliances](address:16 4a)
* [AJ Pederson & Son](address:13 5a)
"""

RECIPE_HELP = """**Gift (Cheap) Recipe** can be manufactured in a [Factory](businesstypes-factory).

**Required Workstation**:
* [Consumer Goods Workstation](furniture-consumergoodsworkstation)

**Required Raw Ingredients Per Hour:**

* 50 X [Clay](products-clay)

**Max Production Rate Per Hour:**

* 100 [Gift (Cheap)](products-cheapgift)
"""

CLAY_HELP = """**Clay** is a raw ingredient used by [Factories](businesstypes-factory).

The product can be used in the following recipes:

* [Gift (Cheap) Recipe](recipes-cheapgiftrecipe)

The product can be imported from the following locations:
* [Global Harvest Traders](address: 9 pier)
"""

WORKSTATION_HELP = """A **Consumer Goods Workstation** is created by adding Production Machines:
* [Laser Cutting Machine](furniture-lasercuttingmachine)

To an Assembly Machine
* [Consumer Goods Assembly Machine](furniture-consumergoodsassemblymachine)

The workstation can be used to create:
* [Gift (Cheap)](recipes-cheapgiftrecipe)
"""

LASER_HELP = """**Laser Cutting Machine** can be purchased from the following locations:
* [Square Appliances](address:16 4a)
"""

ASSEMBLY_HELP = """**Consumer Goods Assembly Machine** can be purchased from the following locations:
* [Square Appliances](address:16 4a)
"""

IMPORTER_HELP = """**BlueStone Imports** is an importer.

They are located here:
* [BlueStone Imports](address: 4 pier)
"""

SKILL_HELP = """**Customer Service** is a skill.

They can be hired from:
* [Anderson Recruitment Corp.](address: 16 5a)
"""

SIZES_HELP = """Each building has a code.

**Retail**
* **A1**: 75m (807ft) / 15 customer capacity
* **M1**: 1000m (10,764ft) / 75 customer capacity

**Office**
* **A1**: 75m (807ft) / 4 customer capacity

**Wholesaler Locations**
* [Hudson Wholesale](address:13 12s)

**Wholesaler Products**
* [Gift (Cheap)](products-cheapgift)
"""

WEEKLY_HELP = """**Weekly Delivery Limits**

Each importer and wholesaler has a weekly limit for deliveries on each item.
* Weekly limits reset Monday at 08:00 (8 AM)
"""

LOCALE = {
    # The neighbourhood names the pier note is written in.
    "ba:neighborhood_murrayhill": "Murray Hill",
    "ba:neighborhood_lowermanhattan": "Lower Manhattan",
    "ba:businesstype_giftshop": "Gift Shop",
    "help_ba:businesstype_giftshop_content": GIFT_HELP,
    "ba:itemname_cheapgift": "Gift (Cheap)",
    "help_ba:itemname_cheapgift_content": CHEAPGIFT_HELP,
    "ba:itemname_sodacan": "Soda Can",
    "ba:itemname_roundedshelf": "Rounded Shelf",
    "help_ba:itemname_roundedshelf_content": ROUNDED_SHELF_HELP,
    "ba:itemname_stackofshoppingbaskets": "Stack of Shopping Baskets",
    "help_ba:itemname_stackofshoppingbaskets_content": BASKETS_HELP,
    "ba:itemname_storageshelf": "Storage Shelf",
    "ba:itemname_clay": "Clay",
    "help_ba:itemname_clay_content": CLAY_HELP,
    "ba:itemname_consumergoodsworkstation": "Consumer Goods Workstation",
    "ba:itemname_lasercuttingmachine": "Laser Cutting Machine",
    "help_ba:itemname_lasercuttingmachine_content": LASER_HELP,
    "ba:itemname_consumergoodsassemblymachine": "Consumer Goods Assembly Machine",
    "help_ba:itemname_consumergoodsassemblymachine_content": ASSEMBLY_HELP,
    "recipes_cheapgiftrecipe": "Gift (Cheap) Recipe",
    "help_recipes_cheapgiftrecipe_content": RECIPE_HELP,
    "help_factory_workstation_consumergoods_content": WORKSTATION_HELP,
    "factory_workstation_consumergoods": "Consumer Goods Workstation",
    "importertypename_bluestone": "Bluestone Imports",
    "help_importertypename_bluestone_content": IMPORTER_HELP,
    "ba:skill_customerservice": "Customer Service",
    "help_ba:skill_customerservice_content": SKILL_HELP,
    "building_types": "Sizes / Types",
    "help_building_types_content": SIZES_HELP,
    "wholesalers_locations": "Wholesaler Locations",
    "help_wholesalers_locations_content": SIZES_HELP,
    "wholesalers_weeklylimits": "Weekly Delivery Limits",
    "help_wholesalers_weeklylimits_content": WEEKLY_HELP,
    "help_general": "General",
    "common_furniture": "Furniture",
    "common_importexport": "Import & Export",
}

HELP_STRUCTURE = """[
  {
    "CategoryLocalizorKey": "common_business_types",
    "pages": [
      {"slug": "businesstypes-giftshop", "pageLocalizorKeyPrefix": "ba:businesstype_giftshop"}
    ]
  },
  {
    "CategoryLocalizorKey": "common_furniture",
    "pages": [
      {"slug": "furniture-roundedshelf", "pageLocalizorKeyPrefix": "ba:itemname_roundedshelf"},
      {"slug": "furniture-roundedshelf", "pageLocalizorKeyPrefix": "ba:itemname_clay"},
      {"slug": "furniture-stackofshoppingbaskets", "pageLocalizorKeyPrefix": "ba:itemname_stackofshoppingbaskets"}
    ]
  },
  {
    "CategoryLocalizorKey": "common_factoryrecipes",
    "pages": [
      {"slug": "recipes-cheapgiftrecipe", "pageLocalizorKeyPrefix": "recipes_cheapgiftrecipe"}
    ]
  },
  {
    "CategoryLocalizorKey": "common_importexport",
    "pages": [
      {"slug": "importers-bluestone", "pageLocalizorKeyPrefix": "importertypename_bluestone"}
    ]
  },
]
"""

# The buildings the help's addresses resolve to: 4 pier, 13 Fifth Avenue,
# 16 Fourth Avenue and 9 Pier, with a pier whose neighbourhood differs.
BUILDINGS = [
    {"s": "ba:street_pier", "n": 4, "h": "murrayhill", "t": "special", "z": "H", "m": 690, "x": 18},
    {"s": "ba:street_pier", "n": 9, "h": "lowermanhattan", "t": "special", "z": "H", "m": 690, "x": 18},
    {"s": "ba:street_fifthavenue", "n": 13, "h": "garmentdistrict", "t": "retail", "z": "M", "m": 1000, "x": 45},
    {"s": "ba:street_fifthavenue", "n": 16, "h": "chelsea", "t": "retail", "z": "C", "m": 225, "x": 40},
    {"s": "ba:street_fourthavenue", "n": 16, "h": "hellskitchen", "t": "retail", "z": "C", "m": 225, "x": 50},
]

# A shipped layout, as the game writes one: items with a name each.
LAYOUT = json.dumps(
    {
        "buildNumber": 3521,
        "BusinessType": "ba:businesstype_giftshop",
        "Items": [
            {"itemName": "ba:itemname_roundedshelf"} for _ in range(10)
        ]
        + [{"itemName": "ba:itemname_stackofshoppingbaskets"} for _ in range(3)],
    }
)


class FixtureCase(unittest.TestCase):
    """A case with its own synthetic game install and building table.

    `self.root` stands in for Big Ambitions_Data: the builder is handed it and
    expects to find StreamingAssets inside it.
    """

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = self._tmp.name
        self.streaming = os.path.join(self.root, "StreamingAssets")
        os.makedirs(os.path.join(self.streaming, "locale"))
        os.makedirs(os.path.join(self.streaming, "BusinessLayouts", "GiftShop", "M1"))
        self.write_locale(LOCALE)
        self.write("StreamingAssets/helpstructure.json", HELP_STRUCTURE)
        self.write("ba_buildings.json", json.dumps(BUILDINGS))
        self.write("StreamingAssets/BusinessLayouts/GiftShop/M1/GiftShopRivals.json", LAYOUT)

    # -- helpers
    def write(self, relative, text):
        path = os.path.join(self.root, relative)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
        return path

    def write_locale(self, locale):
        self.write(
            "StreamingAssets/locale/en.json",
            json.dumps(locale, ensure_ascii=False),
        )

    def build(self):
        return build.build_public_wiki(self.root,
                                       buildings_path=os.path.join(self.root, "ba_buildings.json"))

    def payload(self):
        """The payload as it is written to disk, parsed back."""
        return json.loads(build.serialise(self.build()))

    def write_payload(self, path):
        return build.write_public_wiki(
            path, self.root, buildings_path=os.path.join(self.root, "ba_buildings.json")
        )

    def cli(self, out):
        return ["--data-dir", self.root, "--out", out,
                "--buildings", os.path.join(self.root, "ba_buildings.json")]

    def sample(self):
        return self.build()["sample"]

    def page(self, payload, page_id):
        return next(page for page in payload["pages"] if page["id"] == page_id)

    def read(self, path):
        with open(path, encoding="utf-8") as fh:
            return fh.read()

    def quiet(self):
        import contextlib
        import io

        @contextlib.contextmanager
        def both():
            with contextlib.redirect_stdout(io.StringIO()) as out, contextlib.redirect_stderr(
                io.StringIO()
            ) as err:
                yield err

        return both()


# --- the contract --------------------------------------------------------


class ContractTests(FixtureCase):
    def test_the_payload_carries_pages_categories_sample_and_provenance(self):
        payload = self.build()
        self.assertEqual(payload["schemaVersion"], 1)
        for field in ("categories", "pages", "sample", "provenance"):
            self.assertIn(field, payload)

    def test_categories_carry_their_pages_and_honest_counts(self):
        payload = self.build()
        counts = {category["id"]: category["count"] for category in payload["categories"]}
        self.assertEqual(counts["common_furniture"], 2)  # one of three entries is a duplicate
        for category in payload["categories"]:
            self.assertEqual(category["count"], len(category["pageIds"]))
            for page_id in category["pageIds"]:
                self.assertEqual(self.page(payload, page_id)["categoryId"], category["id"])

    def test_page_ids_are_the_help_menu_slugs_and_titles_are_game_names(self):
        payload = self.build()
        gift = self.page(payload, "businesstypes-giftshop")
        self.assertEqual(gift["title"], "Gift Shop")
        self.assertIn("businesses operate out of retail buildings", gift["body"])

    def test_a_duplicate_slug_keeps_its_first_entry_and_reports_the_second(self):
        payload = self.build()
        # The second entry pointed ba:itemname_clay at an existing slug; that
        # page survives through its own first listing, and the clash is recorded.
        self.assertEqual(len(payload["pages"]), len({page["id"] for page in payload["pages"]}))
        duplicates = payload["provenance"]["helpStructure"]["duplicates"]
        self.assertEqual(
            duplicates,
            [{"slug": "furniture-roundedshelf", "category": "common_furniture",
              "prefix": "ba:itemname_clay"}],
        )

    def test_every_page_the_menu_lists_appears_once(self):
        payload = self.build()
        self.assertEqual(
            {page["id"] for page in payload["pages"]},
            {"businesstypes-giftshop", "furniture-roundedshelf",
             "furniture-stackofshoppingbaskets", "recipes-cheapgiftrecipe",
             "importers-bluestone"},
        )

    def test_the_sample_keeps_the_window_wiki_shapes(self):
        sample = self.sample()
        for field in ("SOURCES", "CATEGORIES", "SUPPLIERS", "WHOLESALERS", "FIXTURES",
                      "PRODUCTS", "RECIPES", "WORKSTATION", "BUSINESS", "RETAIL_SIZES", "GAPS"):
            self.assertIn(field, sample)
        self.assertEqual(
            set(sample["FIXTURES"]["roundedshelf"]),
            {"name", "src", "sells", "capacity", "customers", "vendors", "observed",
             "station", "needs", "mount"},
        )
        self.assertEqual(
            set(sample["PRODUCTS"]["cheapgift"]),
            {"name", "slug", "src", "rank", "alsoSoldBy", "fixtures", "wholesale",
             "importers", "recipe", "crosscheck"},
        )
        self.assertEqual(
            set(sample["RECIPES"]["cheapgiftrecipe"]),
            {"name", "src", "workstation", "inputs", "out"},
        )
        self.assertEqual(
            set(sample["BUSINESS"]),
            {"slug", "name", "nameSrc", "src", "building", "serving", "skills",
             "hiring", "primary", "extras", "requirements"},
        )
        self.assertEqual(
            set(sample["BUSINESS"]["requirements"]),
            {"src", "furniture", "furnitureSlugs", "atLeastOneProduct", "raw", "note"},
        )
        for row in sample["SOURCES"]["files"]:
            self.assertEqual(set(row), {"path", "bytes", "sha256", "mtime", "note"})

    def test_the_workstation_vendor_is_named_where_its_machines_are_sold(self):
        self.assertEqual(self.sample()["WORKSTATION"]["vendor"], "ba:street_fourthavenue#16")

    def test_a_new_primary_product_gains_a_sample_entry(self):
        # A build that adds a fourth core product must not narrow the sample:
        # the UI maps BUSINESS.primary through sample.PRODUCTS.
        fourth = CHEAPGIFT_HELP.replace("Gift (Cheap)", "Bouquet").replace(
            "* [Gift (Cheap) Recipe](recipes-cheapgiftrecipe)", "")
        self.write_locale(dict(LOCALE, **{
            "ba:itemname_bouquet": "Bouquet",
            "help_ba:itemname_bouquet_content": fourth,
            "help_ba:businesstype_giftshop_content": GIFT_HELP.replace(
                "* [Gift (Cheap)](products-cheapgift)",
                "* [Gift (Cheap)](products-cheapgift)\n* [Bouquet](products-bouquet)"),
        }))
        sample = self.sample()
        self.assertEqual(sample["BUSINESS"]["primary"],
                         ["cheapgift", "bouquet"])
        self.assertEqual(sample["PRODUCTS"]["bouquet"]["rank"], "primary")
        self.assertEqual(sample["PRODUCTS"]["bouquet"]["fixtures"], ["roundedshelf"])

    def test_a_primary_product_without_a_help_page_is_a_stated_gap(self):
        self.write_locale(dict(LOCALE, **{
            "help_ba:businesstype_giftshop_content": GIFT_HELP.replace(
                "* [Gift (Cheap)](products-cheapgift)",
                "* [Gift (Cheap)](products-cheapgift)\n* [Bouquet](products-bouquet)"),
        }))
        sample = self.sample()
        self.assertIsNone(sample["PRODUCTS"]["bouquet"]["name"])
        label = build.wording()["gaps"]["missingProducts"]["what"]
        gaps = {gap["what"]: gap["detail"] for gap in sample["GAPS"]}
        self.assertIn(label, gaps)
        self.assertIn("bouquet", gaps[label])

    def test_the_business_requirements_come_from_its_own_page(self):
        requirements = self.sample()["BUSINESS"]["requirements"]
        self.assertEqual(requirements["furnitureSlugs"],
                         ["stackofshoppingbaskets"])
        self.assertIs(requirements["atLeastOneProduct"], True)
        self.assertEqual(
            requirements["raw"],
            ["* [Stack of Shopping Baskets](furniture-stackofshoppingbaskets)",
             "* At least one product to sell (see below)"])
        self.assertIn("not that the list is the complete set of rules", requirements["note"])

    def test_fixture_compatibility_is_reported_from_both_help_directions(self):
        # The product page now names Storage Shelf as well, and the Storage
        # Shelf page lists nothing for sale: the payload shows both lists and
        # says they disagree instead of picking one.
        self.write_locale(dict(LOCALE, **{
            "help_ba:itemname_cheapgift_content": CHEAPGIFT_HELP.replace(
                "* [Rounded Shelf](furniture-roundedshelf)",
                "* [Rounded Shelf](furniture-roundedshelf)"
                "\n* [Storage Shelf](furniture-storageshelf)"),
        }))
        product = self.sample()["PRODUCTS"]["cheapgift"]
        self.assertEqual(product["fixtures"], ["roundedshelf", "storageshelf"])
        self.assertIn("furniture page lists it for sale: Rounded Shelf", product["crosscheck"])
        self.assertIn("The two lists disagree", product["crosscheck"])
        self.assertIn("Storage Shelf does not list it back", product["crosscheck"])

    def test_agreeing_directions_are_stated_without_a_disclaimer(self):
        crosscheck = self.sample()["PRODUCTS"]["cheapgift"]["crosscheck"]
        self.assertIn("Its own page names it in Rounded Shelf", crosscheck)
        self.assertNotIn("The two lists disagree", crosscheck)

    def test_sample_cross_references_resolve_inside_the_payload(self):
        sample = self.sample()
        self.assertIn(sample["BUSINESS"]["hiring"], sample["SUPPLIERS"])
        self.assertIn(sample["WORKSTATION"]["vendor"], sample["SUPPLIERS"])
        for fixture in sample["FIXTURES"].values():
            for key in fixture["vendors"]:
                self.assertIn(key, sample["SUPPLIERS"])
        for recipe in sample["RECIPES"].values():
            for ingredient in recipe["inputs"]:
                for key in ingredient["from"]:
                    self.assertIn(key, sample["SUPPLIERS"])

    def test_provenance_hashes_its_sources_and_states_the_save_build_is_unknown(self):
        payload = self.build()
        provenance = payload["provenance"]
        self.assertEqual(provenance["saveBuildNumber"], None)
        for name in ("locale", "helpStructure"):
            self.assertEqual(len(provenance["sources"][name]["sha256"]), 64)
        self.assertEqual(provenance["sources"]["buildings"]["count"], len(BUILDINGS))
        self.assertEqual(provenance["sources"]["layouts"][0]["build"], 3521)


# --- facts follow the source --------------------------------------------


class FactsFollowSourceTests(FixtureCase):
    def refreshed(self, text, needle, replacement):
        """A rebuild with one help page edited, and its payload."""
        locale = dict(LOCALE)
        locale[needle] = replacement
        self.write_locale(locale)
        return self.build()

    def test_a_capacity_change_moves_the_sample_and_the_page(self):
        payload = self.refreshed(
            ROUNDED_SHELF_HELP.replace("Gifts: 300", "Gifts: 555"),
            "help_ba:itemname_roundedshelf_content",
            ROUNDED_SHELF_HELP.replace("Gifts: 300", "Gifts: 555"),
        )
        capacity = payload["sample"]["FIXTURES"]["roundedshelf"]["capacity"]
        self.assertEqual(capacity[0]["value"], 555)
        self.assertIn("Gifts: 555", self.page(payload, "furniture-roundedshelf")["body"])

    def test_a_new_rate_changes_the_recipe_sample(self):
        payload = self.refreshed(
            RECIPE_HELP.replace("* 100 [Gift (Cheap)]", "* 250 [Gift (Cheap)]"),
            "help_recipes_cheapgiftrecipe_content",
            RECIPE_HELP.replace("* 100 [Gift (Cheap)]", "* 250 [Gift (Cheap)]"),
        )
        self.assertEqual(payload["sample"]["RECIPES"]["cheapgiftrecipe"]["out"]["per"], 250)

    def test_silent_help_against_a_named_product_is_unknown(self):
        # The help stops claiming the product is wholesaled, but the wholesaler
        # list still names it: neither file settles it, so the flag lets go.
        payload = self.refreshed(
            CHEAPGIFT_HELP.replace(
                "The product can be purchased from any [wholesale location](wholesalers-locations).\n\n",
                "",
            ),
            "help_ba:itemname_cheapgift_content",
            CHEAPGIFT_HELP.replace(
                "The product can be purchased from any [wholesale location](wholesalers-locations).\n\n",
                "",
            ),
        )
        product = payload["sample"]["PRODUCTS"]["cheapgift"]
        self.assertIsNone(product["wholesale"])
        self.assertIn("Named on the wholesaler product list", product["crosscheck"])

    def test_silent_help_and_an_absent_product_is_a_stated_no(self):
        # The help stops claiming it, and the wholesaler list drops it too: two
        # files agreeing it is not wholesaled, which the gap then reports.
        self.write_locale(dict(LOCALE, **{
            "help_ba:itemname_cheapgift_content": CHEAPGIFT_HELP.replace(
                "The product can be purchased from any [wholesale location](wholesalers-locations).\n\n",
                "",
            ),
            "help_building_types_content":
                SIZES_HELP.replace("* [Gift (Cheap)](products-cheapgift)\n", ""),
            "help_wholesalers_locations_content":
                SIZES_HELP.replace("* [Gift (Cheap)](products-cheapgift)\n", ""),
        }))
        product = self.sample()["PRODUCTS"]["cheapgift"]
        self.assertIs(product["wholesale"], False)
        self.assertIn("Absent from the wholesaler product list", product["crosscheck"])

    def test_a_rename_moves_the_supplier_name_and_the_page_title(self):
        # The importer's own `importertypename_*` key is the game's spelling;
        # the link text in other pages is only evidence.
        locale = dict(LOCALE, importertypename_bluestone="BlueStone Imports")
        self.write_locale(locale)
        payload = self.build()
        self.assertEqual(payload["sample"]["SUPPLIERS"]["ba:street_pier#4"]["name"],
                         "BlueStone Imports")
        self.assertEqual(self.page(payload, "importers-bluestone")["title"],
                         "BlueStone Imports")

    def test_a_layout_change_moves_the_observed_counts(self):
        self.write(
            "StreamingAssets/BusinessLayouts/GiftShop/M1/GiftShopRivals.json",
            json.dumps({"buildNumber": 4000, "Items": [
                {"itemName": "ba:itemname_roundedshelf"} for _ in range(7)]}),
        )
        fixture = self.sample()["FIXTURES"]["roundedshelf"]
        self.assertEqual(fixture["observed"], "7 in GiftShopRivals (M1).")

    def test_addresses_are_placed_by_the_building_table(self):
        supplier = self.sample()["SUPPLIERS"]["ba:street_fifthavenue#13"]
        self.assertEqual(supplier["street"], "13 Fifth Avenue")
        self.assertEqual(supplier["hood"], "ba:neighborhood_garmentdistrict")
        self.assertEqual(supplier["size"], "M")
        self.assertEqual(supplier["area"], 1000)
        self.assertEqual(supplier["traffic"], 45)

    def test_supplier_keys_are_the_canonical_building_keys(self):
        self.assertEqual(
            sorted(self.sample()["SUPPLIERS"]),
            ["ba:street_fifthavenue#13", "ba:street_fifthavenue#16",
             "ba:street_fourthavenue#16", "ba:street_pier#4",
             "ba:street_pier#9", "ba:street_twelfthstreet#13"],
        )

    def test_importers_are_named_as_their_own_page_names_them(self):
        # The product page links `4 pier` with its own spelling; the importer's
        # page and its `importertypename_*` key carry the game's spelling.
        supplier = self.sample()["SUPPLIERS"]["ba:street_pier#4"]
        self.assertEqual(supplier["name"], "Bluestone Imports")
        self.assertEqual(supplier["kind"], "Importer (retail goods)")

    def test_mention_counts_are_distinct_pages(self):
        self.assertEqual(self.sample()["SUPPLIERS"]["ba:street_fifthavenue#13"]["mentions"], 2)

    def test_a_pier_split_across_neighbourhoods_says_so(self):
        suppliers = self.sample()["SUPPLIERS"]
        self.assertIn("Murray Hill", suppliers["ba:street_pier#4"]["flag"])
        self.assertIn("Lower Manhattan", suppliers["ba:street_pier#4"]["flag"])
        self.assertNotIn("flag", suppliers["ba:street_fifthavenue#13"])

    def test_retail_sizes_come_from_the_building_type_page(self):
        self.assertEqual(
            self.sample()["RETAIL_SIZES"],
            [{"code": "A1", "area": 75, "customers": 15},
             {"code": "M1", "area": 1000, "customers": 75}],
        )

    def test_the_worked_example_reads_the_game_and_not_itself(self):
        sample = self.sample()
        self.assertEqual(sample["BUSINESS"]["serving"], "Self-serving")
        self.assertEqual(sample["BUSINESS"]["building"], "Retail")
        self.assertEqual(sample["BUSINESS"]["primary"], ["cheapgift"])
        self.assertEqual(sample["RECIPES"]["cheapgiftrecipe"]["inputs"],
                         [{"item": "Clay", "per": 50, "from": ["ba:street_pier#9"]}])


# --- gaps are honest -----------------------------------------------------


class GapTests(FixtureCase):
    def gaps(self):
        return {gap["what"] for gap in self.sample()["GAPS"]}

    def gap_label(self, key):
        # the labels are authored wording; the tests follow the file, not a copy
        return build.wording()["gaps"][key]["what"]

    def test_a_stated_limit_without_a_number_is_a_gap(self):
        self.assertIn("Weekly delivery limits", self.gaps())

    def test_a_size_code_listed_twice_is_a_gap(self):
        self.assertIn("Customer capacity by size code is ambiguous", self.gaps())

    def test_help_links_that_name_no_page_are_counted(self):
        def tally():
            detail = {gap["what"]: gap["detail"] for gap in self.sample()["GAPS"]}
            match = re.search(r"(\d+) links across (\d+) distinct targets",
                              detail.get("Help links that point at no page", ""))
            return match and (int(match.group(1)), int(match.group(2)))

        before = tally()
        self.write_locale(dict(LOCALE, **{
            "help_general_energy_content":
                "Energy is [somewhere](general-nowhere) and [elsewhere](general-elsewhere)."}))
        links, targets = tally()
        self.assertEqual((links - before[0], targets - before[1]), (2, 2))

    def test_a_numbered_limit_is_not_reported_as_missing(self):
        self.write_locale(dict(LOCALE, **{
            "help_wholesalers_weeklylimits_content":
                WEEKLY_HELP + "* [Gift (Cheap)](products-cheapgift) is capped at 200\n"}))
        self.assertNotIn("Weekly delivery limits", self.gaps())

    def test_the_price_gap_is_about_the_sample_not_the_whole_locale(self):
        details = {gap["what"]: gap["detail"] for gap in self.sample()["GAPS"]}
        detail = details[self.gap_label("prices")]
        self.assertIn("contain no prices", detail)
        self.assertIn("No other help page contains a money figure either.", detail)

    def test_a_price_on_a_sample_page_removes_the_price_gap(self):
        self.write_locale(dict(LOCALE, **{
            "help_ba:itemname_roundedshelf_content":
                ROUNDED_SHELF_HELP + "\nStore price: $2,400.\n"}))
        self.assertNotIn(self.gap_label("prices"), self.gaps())

    def test_the_word_price_alone_does_not_remove_the_price_gap(self):
        # A page saying there is no price is not a page carrying one.
        self.write_locale(dict(LOCALE, **{
            "help_ba:itemname_roundedshelf_content":
                ROUNDED_SHELF_HELP + "\nNo price is listed for this furniture.\n"}))
        self.assertIn(self.gap_label("prices"), self.gaps())

    def test_a_price_outside_the_sample_is_reported_not_claimed(self):
        # A vehicle spec sheet carries a figure; the sample neither reads that
        # page nor claims the locale is free of prices.
        self.write_locale(dict(LOCALE, **{
            "ba:itemname_van": "Van",
            "help_ba:itemname_van_content": "**Van** Total Price: $72,500\n"}))
        details = {gap["what"]: gap["detail"] for gap in self.sample()["GAPS"]}
        detail = details[self.gap_label("prices")]
        self.assertIn("A money figure appears on 1 other help page.", detail)
        self.assertNotIn("No other help page contains a money figure either.", detail)

    def test_the_sample_says_what_it_covers(self):
        self.assertIn(self.gap_label("sampleCoverage"), self.gaps())

    def test_the_rate_gap_is_about_help_and_names_the_assumption(self):
        details = {gap["what"]: gap["detail"] for gap in self.sample()["GAPS"]}
        detail = details["Rated rate is a ceiling, not a measurement"]
        self.assertIn("The help states that ceiling and nothing more", detail)
        self.assertIn("times 24", detail)
        self.assertIn("uninterrupted line at full utilisation", detail)
        self.assertNotIn("game files", detail)
        self.assertNotIn("measured factory draw", detail)

    def test_the_build_gap_names_three_different_builds(self):
        details = {gap["what"]: gap["detail"] for gap in self.sample()["GAPS"]}
        detail = details["Three different build numbers"]
        self.assertIn("depot build id", detail)
        self.assertIn("authored at builds 3521", detail)
        self.assertIn("the one a save carries, is not in this payload", detail)
        self.assertNotIn("no game build number", detail)

    def test_the_save_build_row_does_not_cite_dashboard_checks(self):
        row = next(row for row in self.sample()["SOURCES"]["build"]
                   if "Save build" in row["label"])
        self.assertIsNone(row["value"])
        self.assertFalse(row["certain"])
        for banned in ("MIN_BUILD", "VERIFIED_BUILD", "not present in any plain-text file"):
            self.assertNotIn(banned, row["where"] + (row.get("caveat") or ""))

    def test_no_wording_ships_with_an_unresolved_slot(self):
        payload = self.build()
        self.assertNotIn("{count}", payload["provenance"]["notes"]["unparsed"])
        self.assertGreater(len(payload["provenance"]["notes"]["unparsed"]), 20)

    def test_a_broken_wording_file_fails_validation(self):
        wording = json.loads(self.read(build.WORDING_PATH))
        wording["gaps"]["sampleCoverage"]["detail"] = (
            "The sample is one business, the pages are all of them. {unfilled}")
        broken = os.path.join(self.root, "wiki_sample_broken.json")
        with open(broken, "w", encoding="utf-8") as fh:
            json.dump(wording, fh)
        original = build.WORDING_PATH
        build.WORDING_PATH = broken
        try:
            with self.assertRaisesRegex(wiki_data.SourceError, "unresolved wording slot"):
                self.build()
        finally:
            build.WORDING_PATH = original


# --- optional and broken sources -----------------------------------------


class SourceTests(FixtureCase):
    def test_a_missing_building_table_leaves_suppliers_unplaced_and_reported(self):
        os.unlink(os.path.join(self.root, "ba_buildings.json"))
        payload = self.build()
        supplier = payload["sample"]["SUPPLIERS"]["ba:street_fifthavenue#13"]
        self.assertIsNone(supplier["hood"])
        self.assertIsNone(supplier["traffic"])
        self.assertIn("no building", payload["provenance"]["issues"]["suppliers"][0]["reason"])

    def test_a_missing_layout_is_a_gap_and_the_rest_still_counts(self):
        os.unlink(os.path.join(
            self.root,
            "StreamingAssets/BusinessLayouts/GiftShop/M1/GiftShopRivals.json"))
        payload = self.build()
        self.assertIsNone(payload["sample"]["FIXTURES"]["roundedshelf"]["observed"])
        self.assertIn("not readable", payload["provenance"]["issues"]["layouts"][0]["reason"])

    def test_a_missing_steam_manifest_leaves_the_build_row_unknown(self):
        payload = self.build()
        row = next(row for row in payload["sample"]["SOURCES"]["build"]
                   if row["label"].startswith("Steam"))
        self.assertIsNone(row["value"])
        self.assertIsNone(payload["provenance"]["steam"]["buildId"])

    def test_a_broken_locale_is_a_clear_failure_and_writes_nothing(self):
        self.write("StreamingAssets/locale/en.json", "{not json")
        out = os.path.join(self.root, "out.json")
        with self.assertRaisesRegex(wiki_data.SourceError, "not valid JSON"):
            build.write_public_wiki(out, self.root)
        self.assertFalse(os.path.exists(out))

    def test_a_broken_help_structure_is_a_clear_failure(self):
        self.write("StreamingAssets/helpstructure.json", '{"unbalanced": [}')
        with self.assertRaisesRegex(wiki_data.SourceError, "will not parse"):
            self.build()

    def test_an_empty_help_structure_cannot_build_a_menu(self):
        self.write("StreamingAssets/helpstructure.json", "[]")
        with self.assertRaisesRegex(wiki_data.SourceError, "lists no pages"):
            self.build()

    def test_a_broken_building_table_is_reported_not_fatal(self):
        self.write("ba_buildings.json", "{not json")
        payload = self.build()
        self.assertIsNone(payload["provenance"]["sources"]["buildings"])
        self.assertIsNone(payload["sample"]["SUPPLIERS"]["ba:street_pier#4"]["hood"])

    def test_optional_source_failures_name_no_path_on_this_machine(self):
        # A corrupt table and an unreadable layout are both recorded, and the
        # reasons name the game files, not where they live on this machine.
        self.write("ba_buildings.json", "{not json")
        os.unlink(os.path.join(
            self.root, "StreamingAssets/BusinessLayouts/GiftShop/M1/GiftShopRivals.json"))
        payload = self.build()
        issues = payload["provenance"]["issues"]
        reasons = [issue["reason"] for group in issues.values() for issue in group]
        self.assertTrue(any("ba_buildings.json" in reason for reason in reasons))
        self.assertTrue(any("GiftShopRivals" in reason for reason in reasons))
        for string in build._strings(issues):
            self.assertIsNone(build._PRIVATE_PATH_RE.search(string), string)
            self.assertNotIn(self.root, string)

    def test_a_malformed_source_leaves_the_last_payload_standing(self):
        out = os.path.join(self.root, "web", "wiki-data.json")
        self.write_payload(out)
        before = self.read(out)
        self.write("StreamingAssets/locale/en.json", "{not json")
        with self.assertRaises(wiki_data.SourceError):
            self.write_payload(out)
        self.assertEqual(self.read(out), before)

    def test_a_streaming_assets_path_resolves_to_the_same_sources(self):
        direct = os.path.join(self.root, "StreamingAssets")
        self.assertEqual(
            extract_wiki.default_paths(self.root)["locale"],
            extract_wiki.default_paths(direct)["locale"],
        )


# --- privacy and determinism --------------------------------------------


class PrivacyTests(FixtureCase):
    def test_no_machine_path_reaches_the_payload(self):
        payload = self.build()
        for string in build._strings(payload):
            self.assertIsNone(build._PRIVATE_PATH_RE.search(string), string)

    def test_the_built_in_install_yields_game_relative_paths_only(self):
        payload = self.build()
        for string in build._strings(payload):
            self.assertNotIn(self.root, string)
            self.assertNotIn("C:", string)

    def test_a_user_name_in_a_source_path_does_not_leak(self):
        # The default install lives under a user directory; a payload built
        # from it names the game files relatively or not at all.
        payload = self.build()
        for string in build._strings(payload):
            self.assertNotIn(os.path.basename(self.root), string)


class DeterminismTests(FixtureCase):
    def test_two_builds_are_byte_identical(self):
        self.assertEqual(build.serialise(self.build()), build.serialise(self.build()))

    def test_touching_a_source_without_changing_it_changes_nothing(self):
        path = os.path.join(self.root, "StreamingAssets/helpstructure.json")
        before = build.serialise(self.build())
        os.utime(path, None)  # a newer mtime, the same bytes
        self.assertEqual(build.serialise(self.build()), before)

    def test_no_run_timestamp_is_written(self):
        payload = self.build()
        self.assertNotIn("generated", build._strings(payload) and payload["provenance"])
        self.assertNotIn("generated", payload)

    def test_the_source_date_is_named_for_what_it_is(self):
        payload = self.build()
        provenance = payload["provenance"]
        newest = max(os.path.getmtime(os.path.join(self.root, "StreamingAssets", name))
                     for name in ("locale/en.json", "helpstructure.json"))
        expected = datetime.fromtimestamp(newest, timezone.utc).strftime("%Y-%m-%d")
        self.assertEqual(provenance["sourceDate"], expected)  # the sources' own mtime
        self.assertNotIn("extracted", provenance)
        # the sample keeps the mockup's key and adds the clearly named one
        sources = payload["sample"]["SOURCES"]
        self.assertEqual(sources["sourceDate"], sources["extracted"])
        self.assertIn("not the moment", provenance["notes"]["sourceDate"])


# --- writing -------------------------------------------------------------


class WriteTests(FixtureCase):
    def test_writing_validates_before_it_replaces(self):
        out = os.path.join(self.root, "web", "wiki-data.json")
        text = self.write_payload(out)
        self.assertEqual(self.read(out), text)
        payload = json.loads(text)
        build.validate_public(payload)

    def test_an_unchanged_rebuild_leaves_the_file_alone(self):
        out = os.path.join(self.root, "web", "wiki-data.json")
        self.write_payload(out)
        first = os.stat(out).st_mtime_ns
        self.write_payload(out)
        self.assertEqual(first, os.stat(out).st_mtime_ns)

    def test_a_changed_source_replaces_the_file(self):
        out = os.path.join(self.root, "web", "wiki-data.json")
        self.write_payload(out)
        before = self.read(out)
        self.write_locale(dict(LOCALE, **{"ba:itemname_roundedshelf": "Rounded Shelving"}))
        self.write_payload(out)
        self.assertNotEqual(self.read(out), before)

    def test_the_cli_writes_the_payload_and_reports_it(self):
        out = os.path.join(self.root, "web", "wiki-data.json")
        with self.quiet() as stderr:
            code = build.main(self.cli(out))
        self.assertEqual(code, 0)
        self.assertTrue(os.path.exists(out))
        self.assertEqual(json.loads(self.read(out))["schemaVersion"], 1)

    def test_the_cli_reports_a_broken_source_and_writes_nothing(self):
        self.write("StreamingAssets/locale/en.json", "{not json")
        out = os.path.join(self.root, "web", "wiki-data.json")
        with self.quiet() as stderr:
            code = build.main(self.cli(out))
        self.assertEqual(code, 2)
        self.assertIn("error", stderr.getvalue())
        self.assertFalse(os.path.exists(out))


class TopicTests(FixtureCase):
    """The hand-authored articles: written beside the payload, not extracted.

    The facts in an article are checked by a human, not by this suite. What is
    checked here is that the article reaches the payload whole, in the shape the
    renderer reads, and that it says where its numbers came from.
    """

    def topic(self, slug="how-rent-works"):
        return next(row for row in self.payload()["topics"] if row["slug"] == slug)

    def test_the_payload_carries_the_topics_and_counts_them(self):
        payload = self.payload()
        self.assertIsInstance(payload["topics"], list)
        self.assertIn("how-rent-works", [row["slug"] for row in payload["topics"]])
        self.assertEqual(payload["provenance"]["counts"]["topics"], len(payload["topics"]))

    def test_a_topic_carries_what_the_renderer_reads(self):
        topic = self.topic()
        for field in ("slug", "title", "lede", "sections", "provenance"):
            self.assertTrue(topic.get(field), field)
        self.assertEqual(topic["title"], "How rent works")
        for section in topic["sections"]:
            self.assertTrue(section["heading"])
            self.assertTrue(section["paragraphs"])
            self.assertTrue(all(isinstance(line, str) for line in section["paragraphs"]))

    def test_the_rent_topic_states_the_formula_and_the_seven_district_rates(self):
        topic = self.topic()
        prose = " ".join(line for section in topic["sections"] for line in section["paragraphs"])
        self.assertIn("floor area × (30 + traffic index) × district rate", prose)
        self.assertIn("1.033", prose)
        tables = [section["table"] for section in topic["sections"] if section.get("table")]
        self.assertEqual(len(tables), 1)
        table = tables[0]
        self.assertEqual(table["columns"], ["District", "Rate"])
        self.assertEqual(len(table["rows"]), 7)
        self.assertEqual({row[0] for row in table["rows"]},
                         {"Midtown", "Hell's Kitchen", "Murray Hill", "Garment District",
                          "Lower Manhattan", "The Hamptons", "Industry City"})
        self.assertEqual(dict(table["rows"])["Midtown"], "0.02482")

    def test_the_rent_topic_dates_its_fit_and_says_residential_is_not_covered(self):
        topic = self.topic()
        prose = " ".join([topic["lede"], topic["provenance"]]
                         + [line for section in topic["sections"] for line in section["paragraphs"]])
        self.assertIn("15 September 2026", topic["provenance"])
        self.assertIn("3675", topic["provenance"])
        self.assertIn("48", topic["provenance"])
        self.assertIn("0.6%", topic["provenance"])
        self.assertIn("Residential leases do not follow it", prose)
        self.assertIn("patch", prose)

    def test_a_topic_without_provenance_is_refused(self):
        rows = [dict(self.topic(), provenance="")]
        with self.assertRaises(wiki_data.SourceError):
            build.validate_topics(rows)

    def test_a_table_row_that_does_not_fit_its_columns_is_refused(self):
        topic = self.topic()
        broken = json.loads(json.dumps(topic))
        table = next(s["table"] for s in broken["sections"] if s.get("table"))
        table["rows"].append(["Queens"])
        with self.assertRaises(wiki_data.SourceError):
            build.validate_topics([broken])

    def test_two_topics_with_the_same_slug_are_refused(self):
        topic = self.topic()
        with self.assertRaises(wiki_data.SourceError):
            build.validate_topics([topic, dict(topic)])

    def test_a_topics_file_that_lists_nothing_is_a_clear_failure(self):
        path = self.write("wiki_topics.json", json.dumps({"schemaVersion": 1}))
        with self.assertRaises(wiki_data.SourceError):
            build.topics(path)

    def test_no_machine_path_reaches_a_topic(self):
        for string in build._strings(self.payload()["topics"]):
            self.assertIsNone(build._PRIVATE_PATH_RE.search(string), string)


if __name__ == "__main__":
    unittest.main()
