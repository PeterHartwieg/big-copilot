"""Which chain a depot or factory joins, and that the answer never moves.

The grouping reads the logistics plans one stock line at a time, so the cases
that matter are the ones where sites and goods disagree: a depot that carries
somebody else's products alongside its own, depots that feed each other, and a
product that goes no further because a factory turns it into something else.

The statuses here are the ones `_business()` really emits — a warehouse is
`overhead` and a factory is `support` — and the type slugs are the game's own,
because the tie-break between two kinds of shop is by slug.
"""
import os
import subprocess
import sys
import unittest

from ba_dashboard import COST_KEYS, _chains
from ba_save import Save

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FAST_FOOD = "ba:businesstype_fastfoodrestaurant"
ELECTRONICS = "ba:businesstype_electronicsstore"
GIFTS = "ba:businesstype_giftshop"
CLOTHING = "ba:businesstype_clothingstore"
LAW = "ba:businesstype_lawfirm"
BOOKS = "ba:businesstype_bookstore"
SUPERMARKET = "ba:businesstype_supermarket"

LABELS = {
    FAST_FOOD: "Fast Food Restaurant",
    ELECTRONICS: "Electronics Store",
    GIFTS: "Gift Shop",
    CLOTHING: "Clothing Store",
    LAW: "Law Firm",
    BOOKS: "Bookstore",
    SUPERMARKET: "Supermarket",
}

FOOD_RANGE = ["burger", "fries", "hotdog", "pizza", "salad", "soda",
              "kabob", "icecream", "apple", "banana", "cup", "napkin"]


def site(street, status, type_slug, kind):
    record = {"key": f"{street}#1", "name": street, "status": status, "typeSlug": type_slug,
              "type": kind, "revenue": 100.0, "profit": 10.0, "staff": 1}
    record.update({k: 1.0 for k in COST_KEYS})
    return record


def shop(street, type_slug):
    return site(street, "office" if type_slug == LAW else "retail",
                type_slug, LABELS[type_slug])


def depot(street):
    return site(street, "overhead", None, "Warehouse")


def factory(street):
    # A real factory carries its type slug; the grouping uses it to tell a site
    # that makes goods from one that only stores them.
    return site(street, "support", "ba:businesstype_factory", "Factory")


def destination(street, items):
    """One delivery target and the products the plan sends to it."""
    return {"deliveryTargetAddress": {"streetName": street, "streetNumber": 1},
            "stockTargets": {"$items": [{"itemName": name} for name in items]}}


def plan(street, destinations):
    return {"targetAddress": {"streetName": street, "streetNumber": 1},
            "destinations": {"$items": destinations}}


def chains_of(businesses, plans):
    """Each site's chain, by site key."""
    save = Save({"logisticsManagerPlans": {"$items": plans}}, {}, "")
    return {key: c["name"] for c in _chains(save, businesses, []) for key in c["sites"]}


def depot_chain():
    """The depot feeds three products to a gift shop and three to an electronics store."""
    businesses = [depot("store"), shop("gifts", GIFTS), shop("gadgets", ELECTRONICS)]
    plans = [plan("store", [destination("gifts", ["gift", "flower", "umbrella"]),
                            destination("gadgets", ["phone", "watch", "earbuds"])])]
    return chains_of(businesses, plans)["store#1"]


def back_haul():
    """A loop whose readings hold more than one kind of shop apiece.

    The seed sweep needs a fixture where a set with several kinds in it is what
    decides; where every reading is a single shop, set order cannot reach the
    answer and the sweep proves nothing.
    """
    businesses = [depot("store"), factory("weaver"), factory("spinner"),
                  shop("gadgets", ELECTRONICS), shop("threads", CLOTHING)]
    plans = [
        plan("store", [destination("weaver", ["cotton"]),
                       destination("spinner", ["cotton"]),
                       destination("gadgets", ["cotton"])]),
        plan("weaver", [destination("threads", ["cotton"])]),
        plan("spinner", [destination("store", ["cotton"])]),
    ]
    chains = chains_of(businesses, plans)
    return "|".join(chains[k] for k in ("store#1", "weaver#1", "spinner#1"))


def cross_fed():
    """Two depots that stock each other, each with its own shops behind it.

    The loop is what the grouping has to settle without a walk. Both crossing
    products dead-end, so every reading here is a single shop and set order
    cannot reach the answer — `back_haul` is the sweep that shows that. This one
    guards the loop settling the same way at all.
    """
    businesses = [depot("wardrobe"), depot("larder"),
                  shop("burgers", FAST_FOOD), shop("threads", CLOTHING)]
    plans = [
        plan("wardrobe", [destination("larder", ["shirt"]),
                          destination("threads", ["shirt", "jeans", "coat"])]),
        plan("larder", [destination("wardrobe", ["soda"]),
                        destination("burgers", ["burger", "fries", "soda"])]),
    ]
    chains = chains_of(businesses, plans)
    return f"{chains['wardrobe#1']}|{chains['larder#1']}"


def under_seeds(call):
    """What `call` prints under six different hash seeds."""
    script = f"from tests.test_chains import {call}; print({call}())"
    printed = set()
    for seed in ("1", "2", "3", "4", "5", "6"):
        env = dict(os.environ, PYTHONHASHSEED=seed)
        result = subprocess.run([sys.executable, "-c", script], cwd=ROOT, env=env,
                                capture_output=True, text=True, check=True)
        printed.add(result.stdout.strip())
    return printed


class ChainTieTests(unittest.TestCase):
    def test_a_tie_goes_to_the_kind_of_shop_named_first(self):
        # ba:businesstype_electronicsstore sorts before ba:businesstype_giftshop.
        self.assertEqual(depot_chain(), "Electronics Stores")

    def test_the_choice_does_not_depend_on_the_hash_seed(self):
        self.assertEqual(under_seeds("depot_chain"), {"Electronics Stores"})

    def test_a_loop_between_depots_settles_the_same_way_every_run(self):
        # A weaker guard than the sweep below: this fixture's readings are all
        # single shops, so it shows the loop settles, not that set order is out.
        self.assertEqual(under_seeds("cross_fed"),
                         {"Clothing Stores|Fast Food Restaurants"})

    def test_a_reading_of_several_kinds_settles_the_same_way_every_run(self):
        # Here the readings really do hold two kinds of shop apiece, so this is
        # the sweep that would catch a set's order reaching the answer.
        self.assertEqual(under_seeds("back_haul"),
                         {"Clothing Stores|Clothing Stores|Clothing Stores"})


class SharedDepotTests(unittest.TestCase):
    """A factory follows its own goods, not everything its depot happens to carry.

    Everything the factory ships goes through the depot, so these cases cannot
    be answered without following the product across it. The depot is twelve
    fast food lines against one of the factory's, which is what a site-counting
    walk hands to whoever puts a single product in.
    """

    def depot_shops(self, made, sent_on, other_shop, other_range):
        businesses = [factory("works"), depot("store"),
                      shop("burgers", FAST_FOOD), shop("gadgets", ELECTRONICS)]
        plans = [
            plan("works", [destination("store", [made])]),
            plan("store", [destination(sent_on, [made]),
                           destination(other_shop, other_range)]),
        ]
        return chains_of(businesses, plans)

    def test_a_factory_shipping_only_through_the_depot_follows_its_product(self):
        chains = self.depot_shops("phone", "gadgets", "burgers", FOOD_RANGE)
        self.assertEqual(chains["works#1"], "Electronics Stores")
        self.assertEqual(chains["store#1"], "Fast Food Restaurants")

    def test_the_same_depot_sends_a_food_maker_the_other_way(self):
        # The depot is unchanged; only the factory's product moved. Reading the
        # depot rather than the product would answer both of these the same way.
        chains = self.depot_shops("burger", "burgers", "gadgets", ["phone"])
        self.assertEqual(chains["works#1"], "Fast Food Restaurants")

    def test_a_line_that_splits_between_two_kinds_is_worth_one_vote(self):
        # The crate reaches a clothing store and an electronics store, so it is
        # half a vote each and the single line to the gift shop outvotes it.
        # Counting a whole vote per kind reached would make it a three-way tie,
        # which ba:businesstype_clothingstore would take on name order.
        businesses = [factory("works"), depot("store"), shop("gifts", GIFTS),
                      shop("threads", CLOTHING), shop("gadgets", ELECTRONICS)]
        plans = [
            plan("works", [destination("store", ["crate"]), destination("gifts", ["gift"])]),
            plan("store", [destination("threads", ["crate"]),
                           destination("gadgets", ["crate"])]),
        ]
        self.assertEqual(chains_of(businesses, plans)["works#1"], "Gift Shops")

    def test_goods_that_reach_no_shop_at_all_cast_no_vote(self):
        # A half-set-up warehouse: the crate is forwarded on to a depot with no
        # outbound plan yet, so it reaches no shop floor. Letting the line fall
        # back to the trade of the depot it passed through would file the
        # factory under fast food on the strength of goods that never got
        # there, which is the complaint this whole reading exists to answer.
        businesses = [factory("works"), depot("store"), depot("annexe"),
                      shop("burgers", FAST_FOOD), shop("gadgets", ELECTRONICS)]
        plans = [
            plan("works", [destination("store", ["crate"])]),
            plan("store", [destination("annexe", ["crate"]),
                           destination("burgers", FOOD_RANGE)]),
        ]
        self.assertEqual(chains_of(businesses, plans)["works#1"],
                         "Head office and support")

    def test_a_depot_holding_a_product_it_never_ships_on_speaks_for_nobody(self):
        # The crates sit in a depot that has never had a plan for them. That
        # depot's own fast food trade is not evidence about the crates, so the
        # factory behind them is filed on the lines that do reach a shop.
        businesses = [factory("works"), depot("store"),
                      shop("burgers", FAST_FOOD), shop("gadgets", ELECTRONICS)]
        crates = ["crate1", "crate2", "crate3", "crate4", "crate5", "crate6"]
        plans = [
            plan("works", [destination("store", crates),
                           destination("gadgets", ["watch", "tv", "hifi", "camera", "earbuds"])]),
            plan("store", [destination("burgers", FOOD_RANGE)]),
        ]
        # Six crates against five electronics lines: counting the crates as
        # fast food would outvote the shop the factory actually supplies.
        self.assertEqual(chains_of(businesses, plans)["works#1"], "Electronics Stores")

    def test_a_factory_whose_goods_only_ever_sit_in_a_depot_is_support(self):
        businesses = [factory("works"), depot("store"), shop("burgers", FAST_FOOD)]
        plans = [
            plan("works", [destination("store", ["crate"])]),
            plan("store", [destination("burgers", FOOD_RANGE)]),
        ]
        self.assertEqual(chains_of(businesses, plans)["works#1"],
                         "Head office and support")

    def test_a_product_is_traced_through_more_than_one_depot(self):
        # Three hops of one product, with the plans stored upstream first so
        # that reading them in order settles the far end last, and a side line
        # at the first depot for a wrong answer to land on.
        businesses = [factory("works"), depot("store"), depot("annexe"),
                      shop("threads", CLOTHING), shop("gadgets", ELECTRONICS),
                      shop("gifts", GIFTS)]
        plans = [
            plan("works", [destination("store", ["phone"])]),
            plan("store", [destination("annexe", ["phone"]), destination("gifts", ["gift"])]),
            plan("annexe", [destination("threads", ["phone"]),
                            destination("gadgets", ["phone"])]),
        ]
        # The phone reaches a clothing store and an electronics store equally,
        # and ba:businesstype_clothingstore sorts first.
        self.assertEqual(chains_of(businesses, plans)["works#1"], "Clothing Stores")

    def test_one_product_divides_as_its_own_deliveries_divide(self):
        # The cola goes to nine fast food counters and one electronics store.
        # Dividing the vote between the kinds it reaches rather than between
        # the deliveries would read that as an even half, and the tie would go
        # to ba:businesstype_electronicsstore on name order.
        businesses = ([factory("works"), depot("store"), shop("gadgets", ELECTRONICS)]
                      + [shop(f"burgers{i}", FAST_FOOD) for i in range(9)])
        plans = [
            plan("works", [destination("store", ["cola"])]),
            plan("store", [destination(f"burgers{i}", ["cola"]) for i in range(9)]
                          + [destination("gadgets", ["cola"])]),
        ]
        self.assertEqual(chains_of(businesses, plans)["works#1"], "Fast Food Restaurants")


class CrossFedDepotTests(unittest.TestCase):
    """Two depots that supply each other still answer to their own trade."""

    def setUp(self):
        self.clothing = depot("wardrobe")
        self.food = depot("larder")
        self.shops = [shop("burgers", FAST_FOOD), shop("threads", CLOTHING)]
        self.plans = [
            plan("wardrobe", [destination("larder", ["shirt"]),
                              destination("threads", ["shirt", "jeans", "coat", "hat", "socks"])]),
            plan("larder", [destination("wardrobe", ["soda"]),
                            destination("burgers", ["burger", "fries", "soda", "pizza", "salad"])]),
        ]

    def chains(self, businesses):
        return chains_of(businesses, self.plans)

    def test_each_depot_joins_the_shops_it_actually_supplies(self):
        chains = self.chains([self.clothing, self.food] + self.shops)
        self.assertEqual(chains["wardrobe#1"], "Clothing Stores")
        self.assertEqual(chains["larder#1"], "Fast Food Restaurants")

    def test_the_order_the_save_lists_them_in_does_not_decide(self):
        # A cached reach that outlived its cycle guard used to hand the depot
        # listed first whichever chain it was walked from.
        # Which chain each site joins, which is the part that must not move.
        # The rows and the site lists inside them follow the order the save
        # gives, and are meant to: only the grouping is asserted here.
        first = self.chains([self.clothing, self.food] + self.shops)
        second = self.chains([self.food, self.clothing] + self.shops)
        self.assertEqual(first, second)
        self.assertEqual(first["wardrobe#1"], "Clothing Stores")
        self.assertEqual(first["larder#1"], "Fast Food Restaurants")

    def test_the_order_the_plans_are_stored_in_does_not_decide_either(self):
        # The plans are read in the order the save holds them, which sets the
        # order the reading settles the loop in.
        businesses = [self.clothing, self.food] + self.shops
        self.assertEqual(chains_of(businesses, self.plans),
                         chains_of(businesses, list(reversed(self.plans))))

    def test_two_depots_stocking_each_other_with_one_product(self):
        # The real loop: both depots carry the cola, so each one's reading
        # depends on the other's and neither ever lands on an exact answer.
        # Stopping as soon as the plans have been walked once leaves the pair
        # on a dead heat, which the name order would hand to both alike.
        businesses = [depot("alpha"), depot("beta"),
                      shop("gadgets", ELECTRONICS), shop("burgers", FAST_FOOD)]
        plans = [
            plan("alpha", [destination("beta", ["cola"]), destination("gadgets", ["cola"])]),
            plan("beta", [destination("alpha", ["cola"]), destination("burgers", ["cola"])]),
        ]
        chains = chains_of(businesses, plans)
        self.assertEqual(chains["alpha#1"], "Electronics Stores")
        self.assertEqual(chains["beta#1"], "Fast Food Restaurants")

    def test_a_product_cycle_is_not_decided_by_the_rest_of_the_save(self):
        businesses = [depot("alpha"), depot("beta"),
                      shop("gadgets", ELECTRONICS), shop("burgers", FAST_FOOD)]
        plans = [
            plan("alpha", [destination("beta", ["cola"]), destination("gadgets", ["cola"])]),
            plan("beta", [destination("alpha", ["cola"]), destination("burgers", ["cola"])]),
        ]
        answers = set()
        for extra in range(4):
            more, out = list(businesses), list(plans)
            for i in range(extra):
                more += [depot(f"spare{i}"), shop(f"kiosk{i}", GIFTS)]
                out.append(plan(f"spare{i}", [destination(f"kiosk{i}", ["gift"])]))
            answers.add(chains_of(more, out)["beta#1"])
        self.assertEqual(answers, {"Fast Food Restaurants"})

    def test_sites_elsewhere_in_the_save_do_not_decide_it(self):
        # How long the reading runs must not be what settles a loop, or opening
        # an unrelated shop across town would move a chain.
        businesses = [self.clothing, self.food] + self.shops
        answers = set()
        for extra in range(4):
            more = list(businesses)
            plans = list(self.plans)
            for i in range(extra):
                more += [depot(f"spare{i}"), shop(f"kiosk{i}", GIFTS)]
                plans.append(plan(f"spare{i}", [destination(f"kiosk{i}", ["gift"])]))
            answers.add(chains_of(more, plans)["wardrobe#1"])
        self.assertEqual(answers, {"Clothing Stores"})


class TransformingFactoryTests(unittest.TestCase):
    """A product that stops at a factory still reaches the shops it becomes."""

    def test_a_raw_supplier_joins_the_chain_its_buyer_serves(self):
        businesses = [factory("mill"), factory("kitchen"), shop("burgers", FAST_FOOD)]
        plans = [
            # Flour goes no further than the kitchen, which ships burgers.
            plan("mill", [destination("kitchen", ["flour"])]),
            plan("kitchen", [destination("burgers", ["burger", "pizza"])]),
        ]
        chains = chains_of(businesses, plans)
        self.assertEqual(chains["mill#1"], "Fast Food Restaurants")
        self.assertEqual(chains["kitchen#1"], "Fast Food Restaurants")

    def test_a_buyer_with_a_side_line_still_takes_its_supplier_the_main_way(self):
        # The kitchen is five parts fast food to one part electronics. Weighing
        # the kinds it touches rather than how much it sends them would read it
        # as an even half, and the tie-break would file the mill under the side
        # line: ba:businesstype_electronicsstore sorts first.
        businesses = [factory("mill"), factory("kitchen"),
                      shop("burgers", FAST_FOOD), shop("gadgets", ELECTRONICS)]
        plans = [
            plan("mill", [destination("kitchen", ["flour"])]),
            plan("kitchen", [destination("burgers", ["burger", "pizza", "fries", "soda", "salad"]),
                             destination("gadgets", ["cola"])]),
        ]
        chains = chains_of(businesses, plans)
        self.assertEqual(chains["mill#1"], "Fast Food Restaurants")
        self.assertEqual(chains["kitchen#1"], "Fast Food Restaurants")

    def test_a_supplier_of_a_supplier_reaches_the_shops_too(self):
        # Two transforming steps between the goods and the shop floor, so the
        # reading has to carry the proportions one site further back.
        businesses = [factory("quarry"), factory("mill"), factory("kitchen"),
                      shop("burgers", FAST_FOOD), shop("gadgets", ELECTRONICS)]
        plans = [
            plan("quarry", [destination("mill", ["grain"])]),
            plan("mill", [destination("kitchen", ["flour"])]),
            plan("kitchen", [destination("burgers", ["burger", "pizza", "fries", "soda", "salad"]),
                             destination("gadgets", ["cola"])]),
        ]
        self.assertEqual(chains_of(businesses, plans)["quarry#1"], "Fast Food Restaurants")

    def test_a_product_forwarded_unchanged_lands_where_its_buyer_does(self):
        # The mill passes the grain on rather than milling it, so the quarry
        # behind it and the mill itself are on one physical supply line and
        # belong in one chain. Reading the forwarded hop by which kinds it can
        # reach, rather than by how much reaches each, would split them: the
        # kitchen touches both trades, so it would read as an even half and the
        # quarry would go to ba:businesstype_electronicsstore on name order.
        businesses = [factory("quarry"), factory("mill"), factory("kitchen"),
                      shop("burgers", FAST_FOOD), shop("gadgets", ELECTRONICS),
                      shop("gifts", GIFTS)]
        plans = [
            plan("quarry", [destination("mill", ["grain"])]),
            # The mill has a trade of its own besides the grain it passes on, so
            # following the grain and reading the mill's own making answer
            # differently: six gift lines would take the quarry to Gift Shops.
            plan("mill", [destination("kitchen", ["grain"]),
                          destination("gifts", ["gift", "card", "wrap",
                                                "ribbon", "candle", "vase"])]),
            plan("kitchen", [destination("burgers", ["burger", "pizza", "fries", "soda", "salad"]),
                             destination("gadgets", ["cola"])]),
        ]
        chains = chains_of(businesses, plans)
        self.assertEqual(chains["quarry#1"], "Fast Food Restaurants")
        self.assertEqual(chains["mill#1"], "Gift Shops")

    def test_what_a_factory_buys_is_one_vote_however_much_it_makes(self):
        # The mill has two lines: flour into a kitchen that is five parts fast
        # food to one part electronics, and a gift to a gift shop. The flour
        # line is one vote divided the kitchen's way, not five votes, so the
        # single gift line outweighs it. Handing the kitchen's counts straight
        # back instead would read the mill as a fast food supplier.
        businesses = [factory("mill"), factory("kitchen"), shop("burgers", FAST_FOOD),
                      shop("gadgets", ELECTRONICS), shop("gifts", GIFTS)]
        plans = [
            plan("mill", [destination("kitchen", ["flour"]), destination("gifts", ["gift"])]),
            plan("kitchen", [destination("burgers", ["burger", "pizza", "fries", "soda", "salad"]),
                             destination("gadgets", ["cola"])]),
        ]
        self.assertEqual(chains_of(businesses, plans)["mill#1"], "Gift Shops")

    def test_a_long_line_of_depots_still_reaches_the_shop(self):
        # No factory anywhere, so a bound counted in makers rather than in
        # readings would stop long before the goods arrive.
        depth = 9
        businesses = [depot(f"store{i}") for i in range(depth)]
        businesses.append(shop("burgers", FAST_FOOD))
        plans = [plan(f"store{i}", [destination(f"store{i + 1}", ["bun"])])
                 for i in range(depth - 1)]
        plans.append(plan(f"store{depth - 1}", [destination("burgers", ["bun"])]))
        self.assertEqual(chains_of(businesses, plans)["store0#1"],
                         "Fast Food Restaurants")

    def test_a_line_of_factories_relayed_through_depots_still_arrives(self):
        # Each making step is two hops, so the reading needs more passes than
        # the save has factories, and more than it has plans.
        depth = 5
        businesses = []
        for i in range(depth):
            businesses += [factory(f"stage{i}"), depot(f"hop{i}")]
        businesses += [shop("burgers", FAST_FOOD), shop("gadgets", ELECTRONICS)]
        plans = []
        for i in range(depth - 1):
            plans.append(plan(f"stage{i}", [destination(f"hop{i}", [f"part{i}"])]))
            plans.append(plan(f"hop{i}", [destination(f"stage{i + 1}", [f"part{i}"])]))
        plans.append(plan(f"stage{depth - 1}",
                          [destination("burgers", ["burger", "pizza", "fries",
                                                   "soda", "salad"]),
                           destination("gadgets", ["cola"])]))
        self.assertEqual(chains_of(businesses, plans)["stage0#1"],
                         "Fast Food Restaurants")

    def test_a_long_line_of_factories_still_reaches_the_shop(self):
        # Each pass of the reading carries the answer one site further back, so
        # a deep line is what says the reading is allowed enough of them.
        depth = 8
        businesses = [factory(f"stage{i}") for i in range(depth)]
        businesses += [shop("burgers", FAST_FOOD), shop("gadgets", ELECTRONICS)]
        plans = [plan(f"stage{i}", [destination(f"stage{i + 1}", [f"part{i}"])])
                 for i in range(depth - 1)]
        plans.append(plan(f"stage{depth - 1}",
                          [destination("burgers", ["burger", "pizza", "fries", "soda", "salad"]),
                           destination("gadgets", ["cola"])]))
        self.assertEqual(chains_of(businesses, plans)["stage0#1"], "Fast Food Restaurants")

    def test_a_site_that_feeds_nothing_is_support(self):
        businesses = [depot("spare"), shop("burgers", FAST_FOOD)]
        self.assertEqual(chains_of(businesses, [])["spare#1"], "Head office and support")


class BackHaulTests(unittest.TestCase):
    """A product sent back up the line settles without anything else deciding it."""

    def setUp(self):
        # The depot feeds two factories with cotton and a shop besides; one of
        # the factories sends cotton back to the depot. Reading that by
        # repeated averaging never lands on an answer, and the pass it stopped
        # on used to be what picked the winner.
        self.businesses = [depot("store"), factory("weaver"), factory("spinner"),
                           shop("gadgets", ELECTRONICS), shop("threads", CLOTHING)]
        self.plans = [
            plan("store", [destination("weaver", ["cotton"]),
                           destination("spinner", ["cotton"]),
                           destination("gadgets", ["cotton"])]),
            plan("weaver", [destination("threads", ["cotton"])]),
            plan("spinner", [destination("store", ["cotton"])]),
        ]

    def test_a_back_haul_reads_the_one_trade_the_cotton_ends_in(self):
        # The depot's cotton reaches the clothing store through the weaver and
        # the electronics store directly, which is an even split that
        # ba:businesstype_clothingstore takes on name order.
        chains = chains_of(self.businesses, self.plans)
        self.assertEqual(chains["store#1"], "Clothing Stores")
        self.assertEqual(chains["weaver#1"], "Clothing Stores")
        self.assertEqual(chains["spinner#1"], "Clothing Stores")

    def test_the_direct_line_out_of_the_loop_is_counted_too(self):
        # The same fixture with a second electronics line. If the direct line
        # were being dropped the answer would not move; it does, so the split
        # above really is a split and not the loop deciding on its own.
        businesses = self.businesses + [shop("gadgets2", ELECTRONICS)]
        plans = list(self.plans)
        plans[0] = plan("store", [destination("weaver", ["cotton"]),
                                  destination("spinner", ["cotton"]),
                                  destination("gadgets", ["cotton"]),
                                  destination("gadgets2", ["cotton"])])
        self.assertEqual(chains_of(businesses, plans)["store#1"], "Electronics Stores")

    def test_the_rest_of_the_save_does_not_decide_a_back_haul(self):
        answers = set()
        for extra in range(6):
            more, out = list(self.businesses), list(self.plans)
            for i in range(extra):
                more += [depot(f"spare{i}"), shop(f"kiosk{i}", FAST_FOOD)]
                out.append(plan(f"spare{i}", [destination(f"kiosk{i}", ["bun"])]))
            chains = chains_of(more, out)
            answers.add((chains["store#1"], chains["spinner#1"]))
        self.assertEqual(answers, {("Clothing Stores", "Clothing Stores")})


class ReadingTheLinesTests(unittest.TestCase):
    """How the plans themselves are read, before any chain is decided."""

    def test_the_same_product_to_the_same_place_twice_is_one_line(self):
        # A player can name the same delivery in two plans. Counting it twice
        # would let a duplicated line outvote a real one: here the gift would
        # take two votes to the phone's one.
        businesses = [depot("store"), shop("gifts", GIFTS), shop("gadgets", ELECTRONICS)]
        plans = [
            plan("store", [destination("gifts", ["gift"])]),
            plan("store", [destination("gifts", ["gift"]), destination("gadgets", ["phone"])]),
        ]
        # One gift line against one phone line, and electronics sorts first.
        self.assertEqual(chains_of(businesses, plans)["store#1"], "Electronics Stores")

    def test_a_delivery_a_site_makes_to_itself_is_not_a_supply_line(self):
        # One real gift line against one phone line is a tie that electronics
        # takes on name order. Counting the depot's delivery to itself would
        # give the gift a second vote and hand the depot to the gift shop.
        businesses = [depot("store"), shop("gifts", GIFTS), shop("gadgets", ELECTRONICS)]
        plans = [
            plan("store", [destination("store", ["gift"]),
                           destination("gifts", ["gift"]),
                           destination("gadgets", ["phone"])]),
        ]
        self.assertEqual(chains_of(businesses, plans)["store#1"], "Electronics Stores")

    def test_a_vote_is_an_exact_fraction_not_a_rounded_one(self):
        """A tie is settled by the name order, not by the last bit of a float.

        The mill's three lines stop at three factories, so each is worth the
        share of that factory's ends. Seven ends in twenty-one plus two in four
        is exactly twenty in twenty-four, so the bookstores and the clothing
        stores tie and ba:businesstype_bookstore takes it on name order. Summed
        as floating point the two sides differ in the last bit and the clothing
        stores win outright, so the tie-break never runs.
        """
        def products(prefix, count):
            return [f"{prefix}{i}" for i in range(count)]

        businesses = [factory("mill"), factory("k1"), factory("k2"), factory("k3"),
                      shop("reads", BOOKS), shop("reads2", BOOKS),
                      shop("threads", CLOTHING), shop("threads2", CLOTHING),
                      shop("mart", SUPERMARKET), shop("diner", FAST_FOOD),
                      shop("gifts", GIFTS), shop("gadgets", ELECTRONICS)]
        plans = [
            plan("mill", [destination("k1", ["flour"]), destination("k2", ["meal"]),
                          destination("k3", ["grain"])]),
            # 7 of 21 ends are bookshop deliveries.
            plan("k1", [destination("reads", products("b", 7)),
                        destination("mart", products("b", 7)),
                        destination("diner", products("b", 7))]),
            # 2 of 4.
            plan("k2", [destination("reads2", products("c", 2)),
                        destination("gifts", products("c", 2))]),
            # 20 of 24 are clothing deliveries.
            plan("k3", [destination("threads", products("d", 10)),
                        destination("threads2", products("d", 10)),
                        destination("gadgets", products("d", 4))]),
        ]
        self.assertEqual(chains_of(businesses, plans)["mill#1"], "Bookstores")


class FactoryLoopTests(unittest.TestCase):
    """One product passed round a ring of factories, which none of them sells."""

    def ring(self, order):
        businesses = [factory("alpha"), factory("beta"), factory("gamma"),
                      shop("diner", FAST_FOOD), shop("gadgets", ELECTRONICS),
                      shop("gifts", GIFTS)]
        plans = {
            "alpha": plan("alpha", [destination("beta", ["flour"]),
                                    destination("diner", ["burger"])]),
            "beta": plan("beta", [destination("gamma", ["flour"]),
                                  destination("gadgets", ["phone"])]),
            "gamma": plan("gamma", [destination("alpha", ["flour"]),
                                    destination("gifts", ["gift"])]),
        }
        return chains_of(businesses, [plans[name] for name in order])

    def test_a_ring_of_factories_settles_instead_of_running_for_ever(self):
        # The flour never reaches a shop as flour, so each factory reads it as
        # having become what that factory ships. Deciding that from the reading
        # as it grew, rather than beforehand, let the answer shrink again and
        # the two readings swapped places on every pass without ever settling.
        # Each factory is asserted, not just the first: alpha's own burgers
        # would carry it whether or not the flour was read at all.
        chains = self.ring(("alpha", "beta", "gamma"))
        self.assertEqual(chains["alpha#1"], "Fast Food Restaurants")
        self.assertEqual(chains["beta#1"], "Electronics Stores")
        self.assertEqual(chains["gamma#1"], "Gift Shops")

    def test_the_order_the_plans_are_stored_in_does_not_decide_a_ring(self):
        orders = [("alpha", "beta", "gamma"), ("gamma", "beta", "alpha"),
                  ("beta", "gamma", "alpha")]
        answers = {tuple(self.ring(order)[k] for k in
                         ("alpha#1", "beta#1", "gamma#1")) for order in orders}
        self.assertEqual(
            answers,
            {("Fast Food Restaurants", "Electronics Stores", "Gift Shops")})

    def test_two_factories_passing_one_product_back_and_forth(self):
        # The silo only ever ships flour, and the flour never reaches a shop as
        # flour. Both factories stand behind it equally, and whichever of them
        # the save happens to list first must not be what decides.
        answers = set()
        for order in (("mill", "kitchen"), ("kitchen", "mill")):
            businesses = [depot("silo"), factory("mill"), factory("kitchen"),
                          shop("reads", BOOKS), shop("diner", FAST_FOOD)]
            written = {
                "mill": plan("mill", [destination("kitchen", ["flour"]),
                                      destination("reads", ["bread"])]),
                "kitchen": plan("kitchen", [destination("mill", ["flour"]),
                                            destination("diner", ["burger"])]),
            }
            plans = [plan("silo", [destination("mill", ["flour"])])]
            plans += [written[name] for name in order]
            answers.add(chains_of(businesses, plans)["silo#1"])
        # Bookstores and fast food are an even split; the name order decides.
        self.assertEqual(answers, {"Bookstores"})


class MakerTests(unittest.TestCase):
    """What a factory makes counts even when it also moves goods along."""

    def test_a_factory_that_relays_a_product_is_read_by_where_it_relays_it(self):
        # The kitchen passes the phones straight through and makes burgers
        # besides. The plans say where the phones went, so the electronics
        # factory behind them is not a fast food supplier however much food
        # the kitchen ships.
        businesses = ([factory("works"), factory("kitchen"), shop("gadgets", ELECTRONICS)]
                      + [shop(f"burgers{i}", FAST_FOOD) for i in range(10)])
        plans = [
            plan("works", [destination("kitchen", ["phone"])]),
            plan("kitchen", [destination("gadgets", ["phone"])]
                            + [destination(f"burgers{i}", ["burger"]) for i in range(10)]),
        ]
        self.assertEqual(chains_of(businesses, plans)["works#1"], "Electronics Stores")

    def test_a_depot_between_a_supplier_and_a_factory_passes_the_trade_back(self):
        # The ordinary shape: a farm fills a central warehouse, the warehouse
        # fills the kitchens, the kitchens serve the diners. The tomatoes reach
        # no shop as tomatoes, so nothing about them is settled until the
        # kitchen's own trade is, and reading the warehouse before that would
        # leave the farm looking like it fed nobody.
        businesses = [factory("farm"), depot("central"), factory("kitchen"),
                      shop("diner", FAST_FOOD)]
        plans = [
            plan("farm", [destination("central", ["tomato"])]),
            plan("central", [destination("kitchen", ["tomato"])]),
            plan("kitchen", [destination("diner", ["burger", "pizza"])]),
        ]
        chains = chains_of(businesses, plans)
        self.assertEqual(chains["farm#1"], "Fast Food Restaurants")
        self.assertEqual(chains["central#1"], "Fast Food Restaurants")

    def test_what_a_factory_only_passes_on_is_not_what_it_makes(self):
        # The kitchen relays somebody else's phones to five electronics stores
        # and makes burgers out of the mill's flour. The phones are not what the
        # flour became, so they must not stand behind it: counting everything
        # the kitchen ships would file the mill under Electronics Stores.
        businesses = ([factory("works"), factory("mill"), factory("kitchen"),
                       shop("burgers", FAST_FOOD)]
                      + [shop(f"gadgets{i}", ELECTRONICS) for i in range(5)])
        plans = [
            plan("works", [destination("kitchen", ["phone"])]),
            plan("mill", [destination("kitchen", ["flour"])]),
            plan("kitchen", [destination("burgers", ["burger"])]
                            + [destination(f"gadgets{i}", ["phone"]) for i in range(5)]),
        ]
        chains = chains_of(businesses, plans)
        self.assertEqual(chains["mill#1"], "Fast Food Restaurants")
        self.assertEqual(chains["works#1"], "Electronics Stores")

    def test_a_relay_is_followed_through_a_depot_in_the_middle(self):
        # The kitchen hands the phones to a depot, which carries them to the
        # electronics store. Reading only the first hop out of the kitchen would
        # stop at the depot and fall back to the burgers the kitchen makes.
        businesses = ([factory("works"), factory("kitchen"), depot("store"),
                       shop("gadgets", ELECTRONICS)]
                      + [shop(f"burgers{i}", FAST_FOOD) for i in range(3)])
        plans = [
            plan("works", [destination("kitchen", ["phone"])]),
            plan("kitchen", [destination("store", ["phone"])]
                            + [destination(f"burgers{i}", ["burger"]) for i in range(3)]),
            plan("store", [destination("gadgets", ["phone"])]),
        ]
        self.assertEqual(chains_of(businesses, plans)["works#1"], "Electronics Stores")

    def test_a_depot_carries_back_what_the_factory_beyond_it_makes(self):
        # Two hops: the farm fills a depot, the depot fills the kitchen, and the
        # kitchen also dumps its spare tomatoes in a depot that ships nothing.
        # So the tomatoes reach no shop as themselves and are not kept at the
        # kitchen either — but the kitchen still turns them into the burgers it
        # sells, and the depot in the middle has to carry that back to the farm.
        businesses = [factory("farm"), depot("larder"), factory("kitchen"),
                      depot("annexe"), shop("diner", FAST_FOOD)]
        plans = [
            plan("farm", [destination("larder", ["tomato"])]),
            plan("larder", [destination("kitchen", ["tomato"])]),
            plan("kitchen", [destination("annexe", ["tomato"]),
                             destination("diner", ["burger", "pizza"])]),
        ]
        self.assertEqual(chains_of(businesses, plans)["farm#1"], "Fast Food Restaurants")

    def test_a_factory_whose_own_goods_reach_no_shop_lends_nothing(self):
        # The kitchen makes burgers, which go to a depot that ships nothing, and
        # relays somebody else's phones to a shop. Its own making reaches no
        # shop floor, and the phones are not its making, so the mill behind its
        # flour has nothing to join. Reading "my own lines reach nothing yet" as
        # licence to count the phones would file the mill under electronics.
        businesses = [factory("mill"), factory("works"), factory("kitchen"),
                      depot("annexe"), shop("gadgets", ELECTRONICS)]
        plans = [
            plan("mill", [destination("kitchen", ["flour"])]),
            plan("works", [destination("kitchen", ["phone"])]),
            plan("kitchen", [destination("annexe", ["burger"]),
                             destination("gadgets", ["phone"])]),
        ]
        chains = chains_of(businesses, plans)
        self.assertEqual(chains["mill#1"], "Head office and support")
        self.assertEqual(chains["works#1"], "Electronics Stores")

    def test_two_factories_restocking_each_other_do_not_answer_to_plan_order(self):
        # Neither factory has a shop line of its own making: the bread each
        # ships is also bread the other sends back, and the dough never reaches
        # a shop at all. Whichever plan the save stored first used to seed the
        # pair, and the other locked onto it.
        def chains(order):
            businesses = [depot("store"), factory("alpha"), factory("beta"),
                          shop("reads", BOOKS), shop("mart", SUPERMARKET)]
            written = {
                "store": plan("store", [destination("reads", ["bread"])]),
                "alpha": plan("alpha", [destination("store", ["bread"]),
                                        destination("beta", ["dough", "bread"])]),
                "beta": plan("beta", [destination("alpha", ["bread", "dough"]),
                                      destination("mart", ["bread"])]),
            }
            return chains_of(businesses, [written[name] for name in order])

        orders = [("store", "alpha", "beta"), ("store", "beta", "alpha"),
                  ("alpha", "beta", "store"), ("beta", "alpha", "store")]
        self.assertEqual({chains(order)["beta#1"] for order in orders},
                         {"Supermarkets"})

    def test_a_ring_of_makers_is_not_decided_by_the_size_of_the_save(self):
        # How many readings a save holds is what bounds the widening, so a ring
        # that settled only because the reading ran out would answer to shops
        # elsewhere in the city.
        answers = set()
        for extra in range(5):
            businesses = ([depot("store")] + [factory(f"works{i}") for i in range(4)]
                          + [shop("court", LAW), shop("diner", FAST_FOOD)])
            plans = [
                plan("store", [destination("court", ["paper"])]),
                plan("works0", [destination("works2", ["paper"]),
                                destination("diner", ["burger"])]),
                plan("works1", [destination("works0", ["cog", "burger"])]),
                plan("works2", [destination("store", ["paper"]),
                                destination("works3", ["paper"])]),
                plan("works3", [destination("works1", ["cog"])]),
            ]
            for i in range(extra):
                businesses += [depot(f"spare{i}"), shop(f"kiosk{i}", GIFTS)]
                plans.append(plan(f"spare{i}", [destination(f"kiosk{i}", ["gift"])]))
            answers.add(chains_of(businesses, plans)["works3#1"])
        self.assertEqual(answers, {"Law Firms"})

    def test_a_factory_that_only_hands_goods_along_keeps_nothing_of_its_own(self):
        # The kitchen ships one product and it is the one it was sent, so there
        # is nothing here it can be said to make. The mill's flour has no more
        # to do with those phones than with anything else in the city, and the
        # round trip that lets a restocked factory be read whole is absent.
        businesses = [factory("mill"), factory("works"), factory("kitchen"),
                      shop("gadgets", ELECTRONICS)]
        plans = [
            plan("mill", [destination("kitchen", ["flour"])]),
            plan("works", [destination("kitchen", ["phone"])]),
            plan("kitchen", [destination("gadgets", ["phone"])]),
        ]
        chains = chains_of(businesses, plans)
        self.assertEqual(chains["mill#1"], "Head office and support")
        self.assertEqual(chains["works#1"], "Electronics Stores")

    def test_a_factory_sent_its_own_output_back_is_read_as_making_nothing(self):
        # A plan that sends the kitchen's own bread and cake back to it. Those
        # products both arrive and leave, and the plans record only where goods
        # went, never whether a delivery was an ingredient or a crate being
        # moved on — so there is no line here that can be called the kitchen's
        # own making, and the larder behind it waits rather than being filed
        # under a trade nothing in the save actually places it in.
        businesses = [depot("larder"), factory("kitchen"), depot("central"),
                      shop("diner", FAST_FOOD)]
        plans = [
            plan("larder", [destination("kitchen", ["flour"])]),
            plan("kitchen", [destination("central", ["bread", "cake"]),
                             destination("diner", ["bread", "cake"])]),
            plan("central", [destination("kitchen", ["bread", "cake"])]),
        ]
        chains = chains_of(businesses, plans)
        self.assertEqual(chains["larder#1"], "Head office and support")
        # The kitchen itself is still placed by the shop it serves.
        self.assertEqual(chains["kitchen#1"], "Fast Food Restaurants")

    def test_a_relayed_product_that_comes_back_is_still_not_what_it_makes(self):
        # The other half of the same rule, and the one that matters: the kitchen
        # only ever handles somebody else's phones, so the mill's flour must not
        # be filed under the shop those phones reach.
        businesses = [factory("mill"), factory("works"), factory("kitchen"),
                      depot("store"), shop("gadgets", ELECTRONICS)]
        plans = [
            plan("mill", [destination("kitchen", ["flour"])]),
            plan("works", [destination("kitchen", ["phone"])]),
            plan("kitchen", [destination("gadgets", ["phone"]),
                             destination("store", ["phone"])]),
            plan("store", [destination("kitchen", ["phone"])]),
        ]
        self.assertEqual(chains_of(businesses, plans)["mill#1"],
                         "Head office and support")

    def test_what_a_factory_hands_to_another_factory_is_not_what_it_makes(self):
        # The kitchen hands somebody else's phones to an assembly plant, which
        # turns them into gadgets for five electronics stores. Those gadgets are
        # not what the mill's flour became, so they must not stand behind it. A
        # product is on its way somewhere when it reaches a factory that keeps
        # it, not only when it reaches a shop under its own name.
        businesses = ([factory("mill"), factory("works"), factory("kitchen"),
                       factory("assembly"), shop("diner", FAST_FOOD)]
                      + [shop(f"gadgets{i}", ELECTRONICS) for i in range(5)])
        plans = [
            plan("mill", [destination("kitchen", ["flour"])]),
            plan("works", [destination("kitchen", ["phone"])]),
            plan("kitchen", [destination("diner", ["burger"]),
                             destination("assembly", ["phone"])]),
            plan("assembly", [destination(f"gadgets{i}", ["gadget"]) for i in range(5)]),
        ]
        chains = chains_of(businesses, plans)
        self.assertEqual(chains["mill#1"], "Fast Food Restaurants")
        self.assertEqual(chains["works#1"], "Electronics Stores")

    def test_surplus_handed_to_another_factory_reads_like_surplus_sold(self):
        # The kitchen makes burgers out of the mill's flour and hands its
        # surplus flour to a bakery, which sells bread. The flour has two
        # readings and the plans cannot say which, so it is read the same way as
        # surplus sold straight to a shop: by where it went, not by what the
        # kitchen made of the rest.
        businesses = [factory("mill"), factory("kitchen"), factory("bakery"),
                      shop("diner", FAST_FOOD), shop("mart", SUPERMARKET)]
        plans = [
            plan("mill", [destination("kitchen", ["flour"])]),
            # Five lines of the kitchen's own food against one of surplus flour,
            # so counting what the kitchen makes would answer Fast Food.
            plan("kitchen", [destination("diner", ["burger", "pizza", "fries",
                                                   "soda", "salad"]),
                             destination("bakery", ["flour"])]),
            plan("bakery", [destination("mart", ["bread"])]),
        ]
        self.assertEqual(chains_of(businesses, plans)["mill#1"], "Supermarkets")

    def test_surplus_sold_on_is_read_as_where_it_was_sold(self):
        # The other side of the same coin. The kitchen makes food out of
        # tomatoes and sells its surplus tomatoes to a supermarket, so the
        # tomatoes have two readings and the plans cannot say which. Where they
        # reach a shop as themselves, that is the reading taken: it is the one
        # thing the plans do record. The kitchen stays with the food it makes.
        businesses = [depot("larder"), factory("kitchen"),
                      shop("burgers", FAST_FOOD), shop("mart", SUPERMARKET)]
        plans = [
            plan("larder", [destination("kitchen", ["tomato"])]),
            plan("kitchen", [destination("burgers", ["burger", "pizza", "fries", "soda", "salad"]),
                             destination("mart", ["tomato"])]),
        ]
        chains = chains_of(businesses, plans)
        self.assertEqual(chains["larder#1"], "Supermarkets")
        self.assertEqual(chains["kitchen#1"], "Fast Food Restaurants")

    def test_moving_surplus_does_not_hide_what_a_factory_makes(self):
        # The kitchen turns tomatoes into the food it sells and sends its
        # surplus tomatoes to a depot that is not plumbed in yet. Reading the
        # forwarded line alone would stop the larder's tomatoes reaching any
        # shop and strand the larder in Head office and support, though its
        # goods plainly arrive at the burger counters.
        businesses = [depot("larder"), factory("kitchen"), depot("annexe"),
                      shop("burgers", FAST_FOOD)]
        plans = [
            plan("larder", [destination("kitchen", ["tomato"])]),
            plan("kitchen", [destination("burgers", ["burger", "pizza", "fries", "soda", "salad"]),
                             destination("annexe", ["tomato"])]),
        ]
        self.assertEqual(chains_of(businesses, plans)["larder#1"], "Fast Food Restaurants")

    def test_a_factory_is_known_by_its_plans_as_well_as_by_its_type(self):
        # A site the type table does not name as a factory, but whose plans say
        # it makes goods, still turns what it is sent into what it ships.
        businesses = [depot("larder"), site("works", "support", None, "Factory"),
                      shop("burgers", FAST_FOOD)]
        plans = [
            plan("larder", [destination("works", ["tomato"])]),
            plan("works", [destination("burgers", ["burger", "pizza"])]),
        ]
        plans[1]["isFactory"] = True
        self.assertEqual(chains_of(businesses, plans)["larder#1"], "Fast Food Restaurants")

    def test_a_site_that_only_stores_is_not_read_as_making_anything(self):
        businesses = [depot("larder"), depot("store"), shop("burgers", FAST_FOOD)]
        plans = [
            plan("larder", [destination("store", ["tomato"])]),
            plan("store", [destination("burgers", ["burger", "pizza"])]),
        ]
        self.assertEqual(chains_of(businesses, plans)["larder#1"],
                         "Head office and support")


class SuppliedByTests(unittest.TestCase):
    """The chain line names who fills it from outside the chain."""

    def chains(self, plans):
        businesses = [depot("alpha"), depot("beta"),
                      shop("gadgets", ELECTRONICS), shop("burgers", FAST_FOOD)]
        save = Save({"logisticsManagerPlans": {"$items": plans}}, {}, "")
        return {c["name"]: c for c in _chains(save, businesses, [])}

    def plans(self):
        # Both depots sit in the fast food chain and both put phones into the
        # electronics shop, so that chain is supplied from outside it.
        return [
            plan("alpha", [destination("gadgets", ["phone"]),
                           destination("burgers", FOOD_RANGE)]),
            plan("beta", [destination("gadgets", ["phone"]),
                          destination("burgers", FOOD_RANGE)]),
        ]

    def test_the_supplier_named_first_is_the_one_reported(self):
        chains = self.chains(self.plans())
        self.assertEqual(chains["Electronics Stores"]["suppliedBy"], ["alpha"])

    def test_it_is_the_first_named_and_not_the_last(self):
        chains = self.chains(list(reversed(self.plans())))
        self.assertEqual(chains["Electronics Stores"]["suppliedBy"], ["beta"])

    def test_a_delivery_target_with_no_products_names_nobody(self):
        # A target a player added before choosing what to send it. It is not a
        # supply line, so it must not take the slot from the site that is
        # actually filling the shop.
        plans = [
            plan("alpha", [{"deliveryTargetAddress": {"streetName": "gadgets",
                                                      "streetNumber": 1},
                            "stockTargets": {"$items": []}},
                           destination("burgers", FOOD_RANGE)]),
            plan("beta", [destination("gadgets", ["phone", "watch"]),
                          destination("burgers", FOOD_RANGE)]),
        ]
        chains = self.chains(plans)
        self.assertEqual(chains["Electronics Stores"]["suppliedBy"], ["beta"])


class FactoryTypeTests(unittest.TestCase):
    def test_the_factory_types_are_the_ones_the_books_treat_as_cost_centres(self):
        # Two lists in one file name the same sites. If the game adds a factory
        # type to one and not the other, the grouping and the books disagree
        # about it in silence.
        from ba_dashboard import COST_CENTRE_TYPES, MAKES_GOODS, OVERHEAD_TYPES
        self.assertEqual(MAKES_GOODS, COST_CENTRE_TYPES - OVERHEAD_TYPES)


class OfficeTests(unittest.TestCase):
    """An office ends a chain the way a shop does."""

    def test_a_depot_that_only_supplies_an_office_joins_the_office_chain(self):
        businesses = [depot("store"), shop("advocates", LAW)]
        plans = [plan("store", [destination("advocates", ["paper", "ink"])])]
        self.assertEqual(chains_of(businesses, plans)["store#1"], "Law Firms")


if __name__ == "__main__":
    unittest.main()
