"""Tests for the per-business guides (tools/build_wiki_data.py::build_guides).

The fixture is the synthetic install of tests.test_wiki_build, extended here
with a second, service-shaped business and a business type the guides exclude.
Nothing reads the installed game or a private save. What this suite is for: a
guide is built from its own business's pages and the pages those name, its
secondary offerings are full cards with recipes, a service carries the fee
page's own requirement wording, a source that is gone is represented rather
than dropped, no guide carries another business's layouts or fixtures, and a
rebuild writes the same bytes.

    python -m unittest tests.test_wiki_guides
"""

from __future__ import annotations

import json
import os
import re
import sys
import unittest

sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools")
)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import build_wiki_data as build
import wiki_data
from tests.test_wiki_build import (  # noqa: E402  (the shared synthetic install)
    BUILDINGS,
    CLAY_HELP,
    HELP_STRUCTURE,
    LAYOUT,
    LOCALE,
    FixtureCase,
)


def structure_entries():
    """The shared menu, parsed: the fixture string carries a trailing comma."""
    return json.loads(re.sub(r",\s*([\]}])", r"\1", HELP_STRUCTURE))

SALON_HELP = """**Hair Salon** businesses operate out of office buildings.

Customers are served.

The business requires the following furniture to function:

* [Salon Point of Sale](furniture-salonpointofsale)
* [Salon Workstation](furniture-salonworkstation)
* [Salon Toilets](furniture-salontoilets)

Businesses of this type primarily sell:

* [Haircut](fees-haircuttingfee)

And can additionally sell:

* [Hair Care Product](products-haircareproduct)
* [Salon Membership](fees-salonmembershipfee)
* [Luxury Shampoo](products-luxuryshampoo)

Employees with the following skills can be assigned:

* [Hair Styling](skill-hairstyling)
* [Cleaning](skill-cleaning)
"""

HAIRCUT_HELP = """**Haircut** is collected from customers.

The following is needed to collect this fee:

* [Salon Chair](furniture-salonchair)
* [Hair Styling](skill-hairstyling)
"""

MEMBERSHIP_HELP = """**Salon Membership** is collected from customers.

This happens automatically when customers enter the salon.
"""

HAIRCARE_HELP = """**Hair Care Product** is a type of product primarily sold from [Hair Salons](businesstypes-salon).

The product can be placed in the following furniture:
* [Salon Shelf](furniture-salonshelf)

The product can be manufactured using the following recipes:
* [Hair Care Product Recipe](recipes-haircareproductrecipe)
"""

HAIRCARE_RECIPE_HELP = """**Hair Care Product Recipe** can be manufactured in a [Factory](businesstypes-factory).

**Required Workstation**:
* [Chemical Workstation](furniture-chemicalworkstation)

**Required Raw Ingredients Per Hour:**

* 10 X [Clay](products-clay)

**Max Production Rate Per Hour:**

* 20 [Hair Care Product](products-haircareproduct)
"""

CHEMICAL_HELP = """A **Chemical Workstation** is created by adding Production Machines:
* [Mixing Machine](furniture-mixingmachine)

To an Assembly Machine
* [Chemical Assembly Machine](furniture-chemicalassemblymachine)

The workstation can be used to create:
* [Hair Care Product](recipes-haircareproductrecipe)
"""

MIXING_HELP = """**Mixing Machine** can be purchased from the following locations:
* [Square Appliances](address:16 4a)
"""

CHEMICAL_ASSEMBLY_HELP = """**Chemical Assembly Machine** can be purchased from the following locations:
* [Square Appliances](address:16 4a)
"""

SALON_POS_HELP = """**Salon Point of Sale** can be used to set up a salon counter.

**Point of Sales**
* [Cash Register](furniture-cashregister)
* [Card Terminal](furniture-cardterminal)
"""

SALON_WORKSTATION_HELP = """**Salon Workstation** is where a salon keeps its paperwork.

It requires a [Stool](furniture-salonstoolgroup) and a [Mirror](furniture-salonmirror).

It can be purchased from the following locations:
* [Square Appliances](address:16 4a)
"""

STOOL_GROUP_HELP = """**Salon Stools** are the seating a salon workstation needs.

**Salon Stools**
* [Stool](furniture-salonstool)
* [High Stool](furniture-salonhighstool)
"""

STOOL_HELP = """**Stool** can be purchased from the following locations:
* [Square Appliances](address:16 4a)
"""

HIGH_STOOL_HELP = """**High Stool** can be purchased from the following locations:
* [Square Appliances](address:16 4a)
"""

SALON_MIRROR_HELP = """**Salon Mirror** can be purchased from the following locations:
* [Square Appliances](address:16 4a)
"""

SALON_TOILETS_HELP = """**Salon Toilets** are what a salon's customers and staff need.

**Toilets and Sinks**
* [Toilet](furniture-salontoilet)
* [Sink](furniture-salonsink)
"""

SALON_TOILET_HELP = """**Toilet** can be purchased from the following locations:
* [AJ Pederson & Son](address:13 5a)
"""

SALON_SINK_HELP = """**Sink** can be purchased from the following locations:
* [AJ Pederson & Son](address:13 5a)
"""

HAIRSTYLING_HELP = """**Hair Styling** is a skill.

They can be hired from:
* [Anderson Recruitment Corp.](address: 16 5a)
"""

CLEANING_HELP = """**Cleaning** is a skill.

They can be hired from:
* [Pier Recruitment Corp.](address: 4 pier)
"""

FACTORY_HELP = """**Factory** businesses manufacture products.

This business type is not customer-facing.
"""

SHAMPOO_HELP = """**Luxury Shampoo** is a type of product primarily sold from [Hair Salons](businesstypes-salon).

The product can be manufactured using the following recipes:
* [Luxury Shampoo Recipe](recipes-luxuryshampoorecipe)
"""

SHAMPOO_RECIPE_HELP = """**Luxury Shampoo Recipe** can be manufactured in a [Factory](businesstypes-factory).

**Required Workstation**:
* [Consumer Goods Workstation](furniture-consumergoodsworkstation)

**Required Raw Ingredients Per Hour:**

* 5 X [Clay](products-clay)

**Max Production Rate Per Hour:**

* 30 [Luxury Shampoo](products-luxuryshampoo)
"""

# The salon's pages, as the help menu lists them.
SALON_PAGES = {
    "ba:businesstype_salon": "Hair Salon",
    "help_ba:businesstype_salon_content": SALON_HELP,
    "ba:skill_hairstyling": "Hair Styling",
    "help_ba:skill_hairstyling_content": HAIRSTYLING_HELP,
    "ba:skill_cleaning": "Cleaning",
    "help_ba:skill_cleaning_content": CLEANING_HELP,
    "ba:itemname_haircuttingfee": "Haircut",
    "help_ba:itemname_haircuttingfee_content": HAIRCUT_HELP,
    "ba:itemname_salonmembershipfee": "Salon Membership",
    "help_ba:itemname_salonmembershipfee_content": MEMBERSHIP_HELP,
    "ba:itemname_haircareproduct": "Hair Care Product",
    "help_ba:itemname_haircareproduct_content": HAIRCARE_HELP,
    "recipes_haircareproductrecipe": "Hair Care Product Recipe",
    "help_recipes_haircareproductrecipe_content": HAIRCARE_RECIPE_HELP,
    "ba:itemname_chemicalworkstation": "Chemical Workstation",
    "factory_workstation_chemical": "Chemical Workstation",
    "help_factory_workstation_chemical_content": CHEMICAL_HELP,
    "ba:itemname_mixingmachine": "Mixing Machine",
    "help_ba:itemname_mixingmachine_content": MIXING_HELP,
    "ba:itemname_chemicalassemblymachine": "Chemical Assembly Machine",
    "help_ba:itemname_chemicalassemblymachine_content": CHEMICAL_ASSEMBLY_HELP,
    "ba:itemname_salonpointofsale": "Salon Point of Sale",
    "help_ba:itemname_salonpointofsale_content": SALON_POS_HELP,
    "ba:itemname_salonworkstation": "Salon Workstation",
    "help_ba:itemname_salonworkstation_content": SALON_WORKSTATION_HELP,
    "ba:itemname_salonstoolgroup": "Salon Stools",
    "help_ba:itemname_salonstoolgroup_content": STOOL_GROUP_HELP,
    "ba:itemname_salonstool": "Stool",
    "help_ba:itemname_salonstool_content": STOOL_HELP,
    "ba:itemname_salonhighstool": "High Stool",
    "help_ba:itemname_salonhighstool_content": HIGH_STOOL_HELP,
    "ba:itemname_salonmirror": "Salon Mirror",
    "help_ba:itemname_salonmirror_content": SALON_MIRROR_HELP,
    "ba:itemname_salontoilets": "Salon Toilets",
    "help_ba:itemname_salontoilets_content": SALON_TOILETS_HELP,
    "ba:itemname_salontoilet": "Toilet",
    "help_ba:itemname_salontoilet_content": SALON_TOILET_HELP,
    "ba:itemname_salonsink": "Sink",
    "help_ba:itemname_salonsink_content": SALON_SINK_HELP,
    "ba:itemname_salonchair": "Salon Chair",
    "ba:itemname_salonshelf": "Salon Shelf",
    "ba:itemname_cashregister": "Cash Register",
    "ba:itemname_cardterminal": "Card Terminal",
    "ba:itemname_luxuryshampoo": "Luxury Shampoo",
    "help_ba:itemname_luxuryshampoo_content": SHAMPOO_HELP,
    "recipes_luxuryshampoorecipe": "Luxury Shampoo Recipe",
    "help_recipes_luxuryshampoorecipe_content": SHAMPOO_RECIPE_HELP,
}

EXTRA_STRUCTURE = [
    {"slug": "businesstypes-salon", "pageLocalizorKeyPrefix": "ba:businesstype_salon"},
    {"slug": "businesstypes-factory", "pageLocalizorKeyPrefix": "ba:businesstype_factory"},
    {"slug": "skill-hairstyling", "pageLocalizorKeyPrefix": "ba:skill_hairstyling"},
    {"slug": "fees-haircuttingfee", "pageLocalizorKeyPrefix": "ba:itemname_haircuttingfee"},
    {"slug": "fees-salonmembershipfee", "pageLocalizorKeyPrefix": "ba:itemname_salonmembershipfee"},
    {"slug": "products-haircareproduct", "pageLocalizorKeyPrefix": "ba:itemname_haircareproduct"},
    {"slug": "products-luxuryshampoo", "pageLocalizorKeyPrefix": "ba:itemname_luxuryshampoo"},
    {"slug": "recipes-haircareproductrecipe",
     "pageLocalizorKeyPrefix": "recipes_haircareproductrecipe"},
    {"slug": "recipes-luxuryshampoorecipe",
     "pageLocalizorKeyPrefix": "recipes_luxuryshampoorecipe"},
    {"slug": "furniture-salonpointofsale", "pageLocalizorKeyPrefix": "ba:itemname_salonpointofsale"},
    {"slug": "furniture-salonworkstation", "pageLocalizorKeyPrefix": "ba:itemname_salonworkstation"},
    {"slug": "furniture-salonstoolgroup", "pageLocalizorKeyPrefix": "ba:itemname_salonstoolgroup"},
    {"slug": "furniture-salonstool", "pageLocalizorKeyPrefix": "ba:itemname_salonstool"},
    {"slug": "furniture-salonhighstool", "pageLocalizorKeyPrefix": "ba:itemname_salonhighstool"},
    {"slug": "furniture-salonmirror", "pageLocalizorKeyPrefix": "ba:itemname_salonmirror"},
    {"slug": "furniture-salontoilets", "pageLocalizorKeyPrefix": "ba:itemname_salontoilets"},
    {"slug": "furniture-salontoilet", "pageLocalizorKeyPrefix": "ba:itemname_salontoilet"},
    {"slug": "furniture-salonsink", "pageLocalizorKeyPrefix": "ba:itemname_salonsink"},
    {"slug": "skill-cleaning", "pageLocalizorKeyPrefix": "ba:skill_cleaning"},
    {"slug": "workstations-chemical", "pageLocalizorKeyPrefix": "factory_workstation_chemical"},
]


class GuideCase(FixtureCase):
    """The shared fixture plus a service business and an excluded one."""

    def setUp(self):
        super().setUp()
        self.write_locale(dict(LOCALE, **dict(SALON_PAGES, **{
            "ba:businesstype_factory": "Factory",
            "help_ba:businesstype_factory_content": FACTORY_HELP,
        })))
        structure = structure_entries()
        structure[0]["pages"].extend(EXTRA_STRUCTURE)
        self.write("StreamingAssets/helpstructure.json", json.dumps(structure))

    def guides(self):
        return self.build()["guides"]

    def guide(self, short):
        return self.guides()["businesstypes-" + short]

    def gap_label(self, kind):
        """A gap's authored heading, from the wording the builder reads."""
        return build.wording()["guideGaps"][kind]["what"]


class ReviewRegressionTests(GuideCase):
    def change_locale(self, **changes):
        self.write_locale(dict(LOCALE, **dict(SALON_PAGES, **changes)))

    def test_all_neutral_group_sections_survive_business_scoping(self):
        self.change_locale(**{
            "help_ba:itemname_salontoilets_content":
                "**Bathrooms** need toilets and sinks.\n\n"
                "**Toilet Options**\n* [Toilet](furniture-salontoilet)\n\n"
                "**Sink Options**\n* [Sink](furniture-salonsink)\n\n"
                "**[Gift Shops](businesstypes-giftshop)**\n"
                "* [Rounded Shelf](furniture-roundedshelf)\n",
        })
        fixtures = self.guide("salon")["FIXTURES"]
        self.assertIn("salontoilet", fixtures)
        self.assertIn("salonsink", fixtures)
        self.assertNotIn("roundedshelf", fixtures)

    def test_product_furniture_is_scoped_to_the_business(self):
        self.change_locale(**{
            "help_ba:itemname_haircareproduct_content":
                "**Hair Care Product** is a type of product primarily sold from "
                "[Hair Salons](businesstypes-salon) and [Gift Shops](businesstypes-giftshop).\n\n"
                "The product can be placed in the following furniture, based on the type of store.\n\n"
                "**[Hair Salons](businesstypes-salon)**:\n"
                "* [Salon Shelf](furniture-salonshelf)\n\n"
                "**[Gift Shops](businesstypes-giftshop)**:\n"
                "* [Rounded Shelf](furniture-roundedshelf)\n\n"
                "The product can be manufactured using the following recipes:\n"
                "* [Hair Care Product Recipe](recipes-haircareproductrecipe)\n",
        })
        salon = self.guide("salon")
        self.assertEqual(salon["PRODUCTS"]["haircareproduct"]["fixtures"], ["salonshelf"])
        self.assertNotIn("roundedshelf", salon["FIXTURES"])
        self.assertNotIn("names no furniture", salon["PRODUCTS"]["haircareproduct"]["crosscheck"])

    def test_other_primary_sellers_are_included_once(self):
        self.change_locale(**{
            "help_ba:itemname_haircareproduct_content": HAIRCARE_HELP.replace(
                "[Hair Salons](businesstypes-salon).",
                "[Hair Salons](businesstypes-salon) and [Gift Shops](businesstypes-giftshop).")
                + "\nAdditionally, it can be sold from [Hair Salons](businesstypes-salon).\n",
        })
        self.assertEqual(self.guide("salon")["PRODUCTS"]["haircareproduct"]["alsoSoldBy"], ["Gift Shops"])

    def test_linked_prose_requirements_keep_their_condition(self):
        sentence = "**Note:** A [Sink](furniture-salonsink) is required to sell hair products."
        self.change_locale(**{"help_ba:businesstype_salon_content": SALON_HELP + "\n" + sentence})
        guide = self.guide("salon")
        self.assertIn(sentence, guide["BUSINESS"]["requirements"]["raw"])
        self.assertIn(sentence, guide["FIXTURES"]["salonsink"]["requirementsRaw"])

    def test_additional_seller_without_terminal_punctuation_is_kept(self):
        self.change_locale(**{
            "help_ba:itemname_haircareproduct_content": HAIRCARE_HELP
                + "\nAdditionally, it can be sold from [Gift Shops](businesstypes-giftshop)\n",
        })
        self.assertEqual(self.guide("salon")["PRODUCTS"]["haircareproduct"]["alsoSoldBy"], ["Gift Shops"])

    def test_common_source_limits_are_visible_on_guides(self):
        guide = self.guide("salon")
        headings = {row["what"] for row in guide["GAPS"]}
        for kind in ("prices", "ratedRate", "sampleCoverage"):
            self.assertIn(build.wording()["gaps"][kind]["what"], headings)

    def test_prices_gap_uses_the_current_guide_sources(self):
        self.change_locale(**{"help_ba:itemname_salonmirror_content": SALON_MIRROR_HELP + "\nPrice: $100.\n"})
        guides = self.guides()
        price = build.wording()["gaps"]["prices"]["what"]
        self.assertNotIn(price, {row["what"] for row in guides["businesstypes-salon"]["GAPS"]})
        self.assertIn(price, {row["what"] for row in guides["businesstypes-giftshop"]["GAPS"]})

    def test_fee_only_guides_do_not_inherit_recipe_or_retail_limits(self):
        text = SALON_HELP[:SALON_HELP.index("And can additionally sell:")]
        self.change_locale(**{"help_ba:businesstype_salon_content": text})
        headings = {row["what"] for row in self.guide("salon")["GAPS"]}
        for kind in ("ratedRate", "sizeCodes", "weeklyLimits"):
            self.assertNotIn(build.wording()["gaps"][kind]["what"], headings)

    def test_fee_group_dependencies_resolve_to_carried_fixtures(self):
        self.change_locale(**{
            "help_ba:itemname_haircuttingfee_content": HAIRCUT_HELP.replace(
                "[Salon Chair](furniture-salonchair)", "[Salon Stools](furniture-salonstoolgroup)"),
        })
        guide = self.guide("salon")
        self.assertEqual(guide["PRODUCTS"]["haircuttingfee"]["fixtures"], ["salonhighstool", "salonstool"])
        self.assertNotIn("salonstoolgroup", guide["FIXTURES"])

    def test_business_wholesaler_statement_is_case_insensitive(self):
        self.change_locale(**{"help_ba:businesstype_salon_content": SALON_HELP
                            + "\nGoods can be ordered from [Wholesalers](wholesalers-locations).\n"})
        self.assertTrue(self.guide("salon")["WHOLESALERS"])


class GuideSetTests(GuideCase):
    def test_every_customer_facing_business_has_a_guide(self):
        expected = {
            "businesstypes-" + short.removeprefix("ba:businesstype_")
            for short in SALON_PAGES.keys() | LOCALE.keys() | {"ba:businesstype_factory"}
            if short.startswith("ba:businesstype_")
            and short.removeprefix("ba:businesstype_") not in build.GUIDE_EXCLUDED
        }
        self.assertEqual(set(self.guides()), expected)

    def test_excluded_business_types_get_no_guide(self):
        self.assertNotIn("businesstypes-factory", self.guides())

    def test_a_guide_is_keyed_by_its_menu_page_and_names_its_sources(self):
        salon = self.guide("salon")
        self.assertEqual(salon["BUSINESS"]["slug"], "businesstypes-salon")
        self.assertEqual(salon["BUSINESS"]["nameSrc"], "ba:businesstype_salon")
        self.assertEqual(salon["BUSINESS"]["src"], "help_ba:businesstype_salon_content")

    def test_the_range_is_the_business_page_s_own_list(self):
        salon = self.guide("salon")
        self.assertEqual(salon["BUSINESS"]["primary"], ["haircuttingfee"])
        self.assertEqual(salon["BUSINESS"]["secondary"],
                         ["haircareproduct", "salonmembershipfee", "luxuryshampoo"])
        self.assertEqual(sorted(salon["PRODUCTS"]),
                         ["haircareproduct", "haircuttingfee", "luxuryshampoo",
                          "salonmembershipfee"])
        self.assertEqual(
            [product["name"] for product in salon["PRODUCTS"].values()
             if product["rank"] == "additional"],
            ["Hair Care Product", "Salon Membership", "Luxury Shampoo"])

    def test_every_guide_carries_the_contract_fields(self):
        for key, guide in self.guides().items():
            for field in build.GUIDE_FIELDS:
                self.assertIn(field, guide, "%s has no %s" % (key, field))


class SecondaryRangeTests(GuideCase):
    def test_a_secondary_product_is_a_full_card_with_its_recipe(self):
        product = self.guide("salon")["PRODUCTS"]["haircareproduct"]
        self.assertEqual(product["rank"], "additional")
        self.assertEqual(product["kind"], "product")
        self.assertEqual(product["recipes"], ["haircareproductrecipe"])
        self.assertEqual(product["recipe"], "haircareproductrecipe")
        self.assertEqual(product["pageId"], "products-haircareproduct")
        self.assertEqual(product["fixtures"], ["salonshelf"])
        self.assertIsNotNone(product["crosscheck"])

    def test_secondary_recipes_are_carried_alongside_primary_ones(self):
        recipes = self.guide("salon")["RECIPES"]
        self.assertEqual(sorted(recipes), ["haircareproductrecipe", "luxuryshampoorecipe"])
        recipe = recipes["haircareproductrecipe"]
        self.assertEqual(recipe["workstationKey"], "chemical")
        self.assertEqual(recipe["pageId"], "recipes-haircareproductrecipe")
        self.assertEqual(recipe["out"], {"item": "Hair Care Product", "slug": "ba:itemname_haircareproduct", "per": 20})
        self.assertEqual(
            recipe["inputs"],
            [{"item": "Clay", "slug": "ba:itemname_clay", "per": 10, "from": ["ba:street_pier#9"]}])

    def test_a_shared_ingredient_importer_is_listed_in_the_guide_s_own_suppliers(self):
        salon = self.guide("salon")
        self.assertIn("ba:street_pier#9", salon["SUPPLIERS"])
        self.assertIn("ba:street_fourthavenue#16", salon["SUPPLIERS"])  # the machine vendor
        self.assertIn("ba:street_fifthavenue#16", salon["SUPPLIERS"])  # recruitment

    def test_a_product_without_a_help_page_is_represented_not_dropped(self):
        giftshop = self.guide("giftshop")
        soda = giftshop["PRODUCTS"]["sodacan"]
        self.assertEqual(soda["rank"], "additional")
        self.assertEqual(soda["recipes"], [])
        gaps = [gap for gap in giftshop["GAPS"] if "Soda Can" in (gap.get("items") or [])]
        self.assertTrue(gaps, "the guide says nothing about the page it cannot read")


class ServiceFeeTests(GuideCase):
    def test_a_service_is_a_fee_card_without_recipe_claims(self):
        haircut = self.guide("salon")["PRODUCTS"]["haircuttingfee"]
        self.assertEqual(haircut["kind"], "fee")
        self.assertEqual(haircut["recipes"], [])
        self.assertIsNone(haircut["recipe"])
        self.assertFalse(haircut["automatic"])

    def test_a_fee_keeps_its_own_requirement_wording(self):
        haircut = self.guide("salon")["PRODUCTS"]["haircuttingfee"]
        self.assertEqual(
            haircut["requirementsRaw"],
            ["* [Salon Chair](furniture-salonchair)",
             "* [Hair Styling](skill-hairstyling)"])
        self.assertEqual(haircut["pageId"], "fees-haircuttingfee")

    def test_a_fee_s_dependency_is_a_fixture_of_the_guide(self):
        salon = self.guide("salon")
        self.assertIn("salonchair", salon["PRODUCTS"]["haircuttingfee"]["fixtures"])
        self.assertIn("salonchair", salon["FIXTURES"])
        self.assertIsNone(salon["FIXTURES"]["salonchair"]["observed"])

    def test_an_automatic_fee_is_marked_only_when_the_help_says_so(self):
        products = self.guide("salon")["PRODUCTS"]
        self.assertTrue(products["salonmembershipfee"]["automatic"])
        self.assertEqual(products["salonmembershipfee"]["requirementsRaw"], [])
        self.assertFalse(products["haircuttingfee"]["automatic"])
        giftshop = self.guide("giftshop")
        self.assertFalse(giftshop["PRODUCTS"]["cheapgift"]["automatic"])

    def test_a_fee_is_classified_from_its_wording_not_its_link_prefix(self):
        # the haircut fee names no "fee collected" opening line, only the
        # section that says what collecting it needs
        self.assertEqual(self.guide("salon")["PRODUCTS"]["haircuttingfee"]["kind"], "fee")
        self.assertEqual(self.guide("giftshop")["PRODUCTS"]["cheapgift"]["kind"], "product")


class RecruiterTests(GuideCase):
    def test_one_agency_stays_a_single_supplier_reference(self):
        giftshop = self.guide("giftshop")
        self.assertEqual(giftshop["BUSINESS"]["hiring"], "ba:street_fifthavenue#16")
        self.assertNotIn("hiringBySkill", giftshop["BUSINESS"])

    def test_several_agencies_become_a_list_split_by_skill(self):
        business = self.guide("salon")["BUSINESS"]
        # each skill's own page names its agency; both appear, and the reader
        # can still tell which skill sent them where
        self.assertEqual(business["hiring"],
                         ["ba:street_fifthavenue#16", "ba:street_pier#4"])
        self.assertEqual(business["hiringBySkill"],
                         {"Cleaning": ["ba:street_pier#4"],
                          "Hair Styling": ["ba:street_fifthavenue#16"]})
        salon = self.guide("salon")
        self.assertIn("ba:street_pier#4", salon["SUPPLIERS"])
        self.assertEqual(salon["SUPPLIERS"]["ba:street_pier#4"]["hood"], "ba:neighborhood_murrayhill")

    def test_an_agency_two_skills_share_is_not_listed_twice(self):
        self.write_locale(dict(LOCALE, **dict(SALON_PAGES, **{
            "help_ba:skill_cleaning_content":
                CLEANING_HELP.replace("address: 4 pier", "address: 16 5a"),
        })))
        business = self.guide("salon")["BUSINESS"]
        self.assertEqual(business["hiring"], "ba:street_fifthavenue#16")
        self.assertNotIn("hiringBySkill", business)


class WorkstationTests(GuideCase):
    def test_two_workstations_leave_the_legacy_shortcut_empty(self):
        salon = self.guide("salon")
        self.assertEqual(sorted(salon["WORKSTATIONS"]), ["chemical", "consumergoods"])
        self.assertEqual(salon["WORKSTATION"], {})

    def test_the_legacy_shortcut_survives_for_one_station(self):
        giftshop = self.guide("giftshop")
        self.assertEqual(sorted(giftshop["WORKSTATIONS"]), ["consumergoods"])
        self.assertEqual(giftshop["WORKSTATION"]["name"], "Consumer Goods Workstation")
        self.assertEqual(giftshop["WORKSTATION"]["vendor"], "ba:street_fourthavenue#16")

    def test_a_station_page_missing_from_the_build_still_names_the_station(self):
        locale = dict(LOCALE, **SALON_PAGES)
        del locale["factory_workstation_chemical"]
        del locale["help_factory_workstation_chemical_content"]
        self.write_locale(locale)
        salon = self.guide("salon")
        station = salon["WORKSTATIONS"]["chemical"]
        self.assertIsNone(station["vendor"])
        self.assertEqual(station["production"], [])
        self.assertIn(self.gap_label("workstations"), {gap["what"] for gap in salon["GAPS"]})
        self.assertIsNotNone(salon["RECIPES"]["haircareproductrecipe"]["workstationKey"])

    def test_a_recipe_s_machines_list_its_vendors(self):
        station = self.guide("salon")["WORKSTATIONS"]["chemical"]
        self.assertEqual(station["production"], ["Mixing Machine"])
        self.assertEqual(station["assembly"], "Chemical Assembly Machine")
        self.assertEqual(station["vendors"], ["ba:street_fourthavenue#16"])
        self.assertEqual(station["pageId"], "workstations-chemical")


class SourceDeletionTests(GuideCase):
    def test_a_recipe_page_gone_from_the_help_is_a_record_of_unknowns(self):
        locale = dict(LOCALE, **SALON_PAGES)
        del locale["recipes_haircareproductrecipe"]
        del locale["help_recipes_haircareproductrecipe_content"]
        self.write_locale(locale)
        salon = self.guide("salon")
        self.assertEqual(salon["PRODUCTS"]["haircareproduct"]["recipes"],
                         ["haircareproductrecipe"])
        recipe = salon["RECIPES"]["haircareproductrecipe"]
        self.assertIsNone(recipe["workstationKey"])
        self.assertEqual(recipe["inputs"], [])
        self.assertEqual(recipe["out"], {"item": "Hair Care Product", "per": None})
        # the menu still lists the page; only its content is gone
        self.assertEqual(recipe["pageId"], "recipes-haircareproductrecipe")
        gaps = {gap["what"]: gap.get("items", []) for gap in salon["GAPS"]}
        self.assertIn(self.gap_label("recipePages"), gaps)
        self.assertIn("haircareproductrecipe", gaps[self.gap_label("recipePages")])

    def test_a_recipe_without_a_rate_is_a_gap_with_the_rate_left_null(self):
        self.write_locale(dict(LOCALE, **dict(SALON_PAGES, **{
            "help_recipes_haircareproductrecipe_content":
                HAIRCARE_RECIPE_HELP.replace(
                    "\n**Max Production Rate Per Hour:**\n\n* 20 [Hair Care Product]"
                    "(products-haircareproduct)\n", ""),
        })))
        salon = self.guide("salon")
        recipe = salon["RECIPES"]["haircareproductrecipe"]
        self.assertIsNone(recipe["out"]["per"])
        self.assertEqual(recipe["name"], "Hair Care Product Recipe")
        self.assertIn(self.gap_label("recipeRates"), {gap["what"] for gap in salon["GAPS"]})

    def test_a_recipe_without_a_rate_leaves_its_station_unknown(self):
        # the catalogue skips a recipe that states no rate, so this guide can
        # no longer say where it runs; the gap says so instead of guessing
        self.write_locale(dict(LOCALE, **dict(SALON_PAGES, **{
            "help_recipes_haircareproductrecipe_content":
                HAIRCARE_RECIPE_HELP.replace(
                    "\n**Max Production Rate Per Hour:**\n\n* 20 [Hair Care Product]"
                    "(products-haircareproduct)\n", ""),
        })))
        self.assertNotIn("chemical", self.guide("salon")["WORKSTATIONS"])


class FixtureTests(GuideCase):
    def test_a_group_requirement_expands_to_its_members(self):
        salon = self.guide("salon")
        # the requirement keeps the group's own wording and link...
        self.assertEqual(salon["BUSINESS"]["requirements"]["furnitureSlugs"],
                         ["salonpointofsale", "salonworkstation", "salontoilets"])
        self.assertIn("Salon Point of Sale", salon["BUSINESS"]["requirements"]["furniture"])
        # ...and the fixtures are the pieces the group's page lists
        self.assertIn("cashregister", salon["FIXTURES"])
        self.assertIn("cardterminal", salon["FIXTURES"])
        self.assertEqual(
            salon["FIXTURES"]["cashregister"]["requirementsRaw"],
            ["* [Salon Point of Sale](furniture-salonpointofsale)"])

    def test_a_fee_s_alternative_dependencies_both_become_fixtures(self):
        self.write_locale(dict(LOCALE, **dict(SALON_PAGES, **{
            "help_ba:itemname_haircuttingfee_content":
                "**Haircut** is collected from customers.\n\n"
                "The following is needed to collect this fee:\n\n"
                "* [Salon Chair](furniture-salonchair) or "
                "[Salon Chair (Modern)](furniture-salonchairmodern)\n",
            "ba:itemname_salonchairmodern": "Salon Chair (Modern)",
        })))
        salon = self.guide("salon")
        # the alternatives stay "or" in the raw wording...
        self.assertEqual(salon["PRODUCTS"]["haircuttingfee"]["requirementsRaw"],
                         ["* [Salon Chair](furniture-salonchair) or "
                          "[Salon Chair (Modern)](furniture-salonchairmodern)"])
        # ...and both pieces are fixtures a reader can price up
        self.assertEqual(salon["PRODUCTS"]["haircuttingfee"]["fixtures"],
                         ["salonchair", "salonchairmodern"])
        self.assertIn("salonchairmodern", salon["FIXTURES"])

    def test_the_group_page_itself_is_not_a_fixture(self):
        # a group names no purchase location, no capacity and no station: the
        # pieces it lists are the equipment, and the group stays a requirement
        salon = self.guide("salon")
        for group in ("salonpointofsale", "salonstoolgroup", "salontoilets"):
            self.assertNotIn(group, salon["FIXTURES"])

    def test_a_group_member_remembers_which_group_let_it_in(self):
        members = self.guide("salon")["FIXTURES"]
        self.assertEqual(members["cashregister"]["groups"], ["salonpointofsale"])
        self.assertEqual(members["salonstool"]["groups"], ["salonstoolgroup"])
        self.assertEqual(members["salontoilet"]["groups"], ["salontoilets"])
        # a piece named directly is nobody's member
        self.assertEqual(members["salonchair"].get("groups"), [])
        self.assertEqual(members["salonworkstation"].get("groups"), [])

    def test_a_fixture_s_own_requirement_sentence_pulls_its_pieces_in(self):
        # "It requires a Stool and a Mirror": the stool is a group page, so
        # both stools arrive with their vendors, and the mirror arrives alone
        salon = self.guide("salon")
        workstation = salon["FIXTURES"]["salonworkstation"]
        self.assertIn("It requires a [Stool](furniture-salonstoolgroup) and a "
                      "[Mirror](furniture-salonmirror).",
                      workstation["requirementsRaw"])
        self.assertEqual(sorted(workstation["vendors"]), ["ba:street_fourthavenue#16"])
        stool = salon["FIXTURES"]["salonstool"]
        self.assertEqual(stool["groups"], ["salonstoolgroup"])
        self.assertEqual(stool["requirementsRaw"],
                         ["It requires a [Stool](furniture-salonstoolgroup) and a "
                          "[Mirror](furniture-salonmirror)."])
        self.assertEqual(salon["FIXTURES"]["salonmirror"]["groups"], [])
        self.assertIn("ba:street_fourthavenue#16", salon["SUPPLIERS"])
        self.assertIn("ba:street_fourthavenue#16", salon["FIXTURES"]["salonmirror"]["vendors"])

    def test_a_piece_that_sells_nothing_does_not_expand(self):
        # Rounded Shelf is a piece with its own purchase locations and
        # capacity: the gift shop guide keeps it a fixture, not a group
        giftshop = self.guide("giftshop")
        self.assertIn("roundedshelf", giftshop["FIXTURES"])
        self.assertNotIn("stackofshoppingbaskets", giftshop["FIXTURES"]["roundedshelf"]["sells"])

    def test_fixtures_come_from_both_help_directions(self):
        giftshop = self.guide("giftshop")
        self.assertEqual(giftshop["PRODUCTS"]["cheapgift"]["fixtures"],
                         ["roundedshelf"])
        self.assertIsNotNone(giftshop["PRODUCTS"]["cheapgift"]["crosscheck"])

    def test_gift_shop_fixtures_do_not_appear_on_other_guides(self):
        salon = self.guide("salon")
        self.assertNotIn("roundedshelf", salon["FIXTURES"])
        self.assertNotIn("stackofshoppingbaskets", salon["FIXTURES"])
        self.assertEqual(sorted(salon["FIXTURES"]),
                         ["cardterminal", "cashregister", "salonchair", "salonhighstool",
                          "salonmirror", "salonshelf", "salonsink", "salonstool",
                          "salontoilet", "salonworkstation"])

    def test_unambiguous_capacities_travel_with_the_product(self):
        capacities = self.guide("giftshop")["PRODUCTS"]["cheapgift"]["fixtureCapacities"]
        self.assertEqual(capacities,
                         {"roundedshelf": [{"label": "Gifts", "value": 300, "unit": "units"}]})

    def test_capacities_travel_only_for_the_products_own_fixtures(self):
        for business in ("giftshop", "salon"):
            for key, product in self.guide(business)["PRODUCTS"].items():
                with self.subTest(business=business, product=key):
                    self.assertLessEqual(set(product["fixtureCapacities"]),
                                         set(product["fixtures"]))

    def test_ambiguous_capacity_rows_are_left_to_the_fixture(self):
        self.write_locale(dict(LOCALE, **dict(SALON_PAGES, **{
            "ba:itemname_salonchair": "Salon Chair",
            "help_ba:itemname_salonchair_content":
                "**Salon Chair** can be used to sell:\n\n"
                "* [Haircut](fees-haircuttingfee)\n\n"
                "**Product Capacity:**\n* Cuts: 4\n* Treatments: 2\n",
        })))
        capacities = self.guide("salon")["PRODUCTS"]["haircuttingfee"]["fixtureCapacities"]
        self.assertNotIn("salonchair", capacities)
        self.assertEqual(
            self.guide("salon")["FIXTURES"]["salonchair"]["capacity"],
            [{"label": "Cuts", "value": 4, "unit": "units"},
             {"label": "Treatments", "value": 2, "unit": "units"}])


class IsolationTests(GuideCase):
    def test_layouts_travel_only_with_their_own_business(self):
        giftshop, salon = self.guide("giftshop"), self.guide("salon")
        self.assertEqual(
            [row["path"] for row in giftshop["SOURCES"]["files"] if "BusinessLayouts/" in row["path"]],
            ["Big Ambitions_Data/StreamingAssets/BusinessLayouts/GiftShop/M1/GiftShopRivals.json"])
        self.assertNotIn(
            "BusinessLayouts/", json.dumps(salon["SOURCES"]))

    def test_observed_placements_are_scoped_to_the_layout_s_owner(self):
        observed = self.guide("giftshop")["FIXTURES"]["roundedshelf"]["observed"]
        self.assertIn("10", observed)
        self.assertIn("GiftShopRivals", observed)
        for fixture in self.guide("salon")["FIXTURES"].values():
            self.assertIsNone(fixture["observed"])

    def test_a_guide_carries_only_the_suppliers_it_names(self):
        # Give a salon-only component its own supplier. Shared suppliers may
        # legitimately be identical across guides; this source must not leak.
        self.write_locale(dict(LOCALE, **dict(SALON_PAGES, **{
            "help_ba:itemname_salonmirror_content": SALON_MIRROR_HELP.replace(
                "[Square Appliances](address:16 4a)",
                "[Mirror Supplies](address:17 4a)"),
        })))
        self.write("ba_buildings.json", json.dumps(
            BUILDINGS + [dict(BUILDINGS[-1], n=17)]))
        payload = self.build()
        everything = set(payload["sample"]["SUPPLIERS"])
        giftshop = set(payload["guides"]["businesstypes-giftshop"]["SUPPLIERS"])
        salon = set(payload["guides"]["businesstypes-salon"]["SUPPLIERS"])
        self.assertTrue(giftshop < everything)
        self.assertTrue(salon < everything)
        self.assertIn("ba:street_fourthavenue#17", salon)
        self.assertNotIn("ba:street_fourthavenue#17", giftshop)

    def test_categories_count_what_each_guide_reads(self):
        salon = self.guide("salon")["CATEGORIES"]
        business = next(row for row in salon if row["key"] == "common_business_types")
        self.assertGreaterEqual(business["sample"], 1)
        self.assertLessEqual(business["sample"], business["pages"])

    def test_the_wholesaler_list_follows_the_guide_s_own_range(self):
        giftshop, salon = self.guide("giftshop"), self.guide("salon")
        self.assertTrue(giftshop["WHOLESALERS"])
        self.assertEqual(salon["WHOLESALERS"], [])

    def test_the_wholesale_gap_is_about_products_not_services(self):
        salon = self.guide("salon")
        wholesale = next(gap for gap in salon["GAPS"]
                         if gap["what"] == build.wording()["gaps"]["wholesaleNegative"]["what"])
        self.assertIn("Hair Care Product", wholesale["items"])
        self.assertNotIn("Haircut", wholesale["items"])
        self.assertNotIn("Salon Membership", wholesale["items"])

    def test_retail_sizes_are_for_retail_buildings_only(self):
        self.assertEqual(len(self.guide("giftshop")["RETAIL_SIZES"]), 2)
        self.assertEqual(self.guide("salon")["RETAIL_SIZES"], [])

    def test_building_and_serving_come_from_the_business_page(self):
        self.assertEqual(self.guide("salon")["BUSINESS"]["building"], "Office")
        self.assertEqual(self.guide("salon")["BUSINESS"]["serving"], "Served")
        self.assertEqual(self.guide("giftshop")["BUSINESS"]["building"], "Retail")


class CopyTests(GuideCase):
    def test_copy_is_shared_between_guides(self):
        payload = self.build()
        copy = payload["guides"]["businesstypes-salon"]["COPY"]
        self.assertEqual(copy["primaryTitle"], "Primary range")
        self.assertEqual(copy, payload["guides"]["businesstypes-giftshop"]["COPY"])

    def test_a_wording_key_that_is_missing_falls_back_and_is_reported(self):
        wording = json.loads(self.read(build.WORDING_PATH))
        del wording["guideUi"]["chooseProduct"]
        wording["guideUi"]["secondaryTitle"] = "Also sells"
        self.write("wiki_sample_copy.json", json.dumps(wording, ensure_ascii=False))
        original = build.WORDING_PATH
        build.WORDING_PATH = os.path.join(self.root, "wiki_sample_copy.json")
        try:
            payload = self.build()
        finally:
            build.WORDING_PATH = original
        copy = payload["guides"]["businesstypes-salon"]["COPY"]
        self.assertEqual(copy["chooseProduct"], "")
        self.assertEqual(copy["secondaryTitle"], "Also sells")
        # guides.* rows are dropped authored copy, reported beside the UI keys
        reported = {row["key"] for row in payload["provenance"]["issues"]["copy"]
                    if not row["key"].startswith("guides.")}
        self.assertEqual(reported, {"chooseProduct"})

    def test_an_authored_lede_travels_only_while_its_evidence_holds(self):
        wording = json.loads(self.read(build.WORDING_PATH))
        wording["guides"]["salon"] = {
            "lede": {"text": "Salons are served.", "when": [
                {"src": "help_ba:businesstype_salon_content", "includes": "Customers are served."}]},
            "notes": [{"text": "The chair is required by the fee.", "src": "help_ba:businesstype_salon_content",
                       "when": [{"src": "help_ba:businesstype_salon_content",
                                 "includes": "(fees-haircuttingfee)"}]}],
        }
        self.write("wiki_sample_copy.json", json.dumps(wording, ensure_ascii=False))
        original = build.WORDING_PATH
        build.WORDING_PATH = os.path.join(self.root, "wiki_sample_copy.json")
        try:
            salon = self.guide("salon")
        finally:
            build.WORDING_PATH = original
        self.assertEqual(salon["BUSINESS"]["lede"], "Salons are served.")
        self.assertEqual(salon["BUSINESS"]["notes"],
                         [{"text": "The chair is required by the fee.",
                           "src": "help_ba:businesstype_salon_content"}])

    def test_an_lede_whose_evidence_is_gone_is_null(self):
        wording = json.loads(self.read(build.WORDING_PATH))
        wording["guides"]["salon"] = {
            "lede": {"text": "Salons self-serve.", "when": [
                {"src": "help_ba:businesstype_salon_content",
                 "includes": "Customers are self-serving."}]},
            "notes": [],
        }
        self.write("wiki_sample_copy.json", json.dumps(wording, ensure_ascii=False))
        original = build.WORDING_PATH
        build.WORDING_PATH = os.path.join(self.root, "wiki_sample_copy.json")
        try:
            payload = self.build()
        finally:
            build.WORDING_PATH = original
        salon = payload["guides"]["businesstypes-salon"]
        self.assertIsNone(salon["BUSINESS"]["lede"])
        self.assertEqual(salon["BUSINESS"]["notes"], [])
        # the drop is reported, not silent
        dropped = [row for row in payload["provenance"]["issues"].get("copy", [])
                   if row["key"].startswith("guides.salon.")]
        self.assertEqual([row["key"] for row in dropped], ["guides.salon.lede"])
        self.assertIn("Customers are self-serving.", dropped[0]["reason"])

    def test_a_business_without_authored_copy_has_null_and_an_empty_list(self):
        business = self.guide("giftshop")["BUSINESS"]
        self.assertIsNone(business["lede"])
        self.assertEqual(business["notes"], [])


class DeterminismTests(GuideCase):
    def test_two_builds_write_the_same_bytes(self):
        first = build.serialise(self.build())
        second = build.serialise(self.build())
        self.assertEqual(first, second)

    def test_the_guides_do_not_disturb_the_sample(self):
        sample = self.build()["sample"]
        self.assertEqual(sample["BUSINESS"]["primary"], ["cheapgift"])
        self.assertEqual(sorted(sample["PRODUCTS"]),
                         ["cheapgift", "expensivegift", "umbrella"])
        self.assertEqual(sample["RECIPES"]["cheapgiftrecipe"]["inputs"],
                         [{"item": "Clay", "slug": "ba:itemname_clay", "per": 50, "from": ["ba:street_pier#9"]}])

    def test_the_payload_survives_its_own_validator(self):
        payload = json.loads(build.serialise(self.build()))
        build.validate_public(payload)


if __name__ == "__main__":
    unittest.main()
