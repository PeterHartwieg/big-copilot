/* Big Copilot wiki - content sample, extracted 2026-09-13 from the installed game.
 *
 * Every `src` field names the exact locale key the value came from. `tier` says
 * what kind of claim it is:
 *   help   - the game's own F1 help text. A claim about the game, not a
 *            measurement of it.
 *   asset  - confirmed against a shipped runtime asset (business layouts,
 *            helpstructure.json) or cross-checked against a second file.
 *   model  - Big Copilot's own model, with the evidence named.
 *   save   - only knowable from a loaded save. Never hard-coded here.
 *
 * No prices, profits or capacity formulas are invented. Where the game files
 * are silent, the field says so instead of guessing.
 */
window.WIKI = (function () {
  "use strict";

  const SOURCES = {
    extracted: "2026-09-13",
    files: [
      {
        path: "StreamingAssets/locale/en.json",
        bytes: 819793,
        sha256:
          "6a000d35aa4fafc4da0449ddc6596e1da2faeb1eac3fd62f2ef09aa740c28f77",
        mtime: "2026-09-03T05:47:40Z",
        note: "6,036 keys. Every fact on this page with a key beside it.",
      },
      {
        path: "StreamingAssets/helpstructure.json",
        bytes: 104483,
        sha256:
          "3cc581d1f52800a8b3dcf7bec8e9bcbc92c661095d56924488e61c91b71a0cf4",
        mtime: "2026-09-01T20:28:31Z",
        note:
          "14 categories, 852 page entries, 851 distinct slugs. Not strict " +
          "JSON: two trailing commas before a closing bracket.",
      },
      {
        path: "StreamingAssets/BusinessLayouts/GiftShop/M1/GiftShopRivals.json",
        bytes: 515994,
        sha256:
          "678f0146d6ce8dea8fbc92d457ba162278e9f99bb689f5d9a81f5c6423ce294c",
        mtime: "2026-08-28T17:10:28Z",
        note: "200 placed items. Used to check help claims against shipped shops.",
      },
      {
        path: "StreamingAssets/BusinessLayouts/GiftShop/D3/GolfAreaGiftShop.json",
        bytes: 282041,
        sha256:
          "64034d3c664bd00d7b4564a0ad512dfdf1ad9b19d84c748a5e64a1baaa573cdf",
        mtime: "2026-08-28T17:10:28Z",
        note: "174 placed items.",
      },
      {
        path: "StreamingAssets/BusinessLayouts/GiftShop/D3/TennisAreaGiftShop.json",
        bytes: 273060,
        sha256:
          "418dab8ad7526ba7fd4c784f67ba4c376eb52360afa79829b1a501f9d7c7b1e1",
        mtime: "2026-08-28T17:10:28Z",
        note: "160 placed items.",
      },
      {
        path: "ba_buildings.json (Big Copilot, already shipped)",
        bytes: null,
        sha256: null,
        mtime: null,
        note:
          "885 buildings. Gives every supplier address its neighbourhood, " +
          "size code, floor area and traffic index.",
      },
    ],
    build: [
      {
        label: "Product",
        value: "Big Ambitions - Hovgaard Games",
        where: "Big Ambitions_Data/app.info",
        certain: true,
      },
      {
        label: "Unity engine",
        value: "2022.3.62f2",
        where: "version string in Big Ambitions_Data/globalgamemanagers",
        certain: true,
      },
      {
        label: "Steam app / depot build",
        value: "app 1331550, buildid 25231854",
        where: "steamapps/appmanifest_1331550.acf",
        certain: true,
        caveat:
          "This is Steam's depot build id. It is not the game build number " +
          "that a save file carries, and the two must never be compared.",
      },
      {
        label: "Game build number",
        value: null,
        where: "not present in any plain-text file in the installation",
        certain: false,
        caveat:
          "The build number Big Copilot checks (MIN_BUILD / VERIFIED_BUILD) " +
          "is read from a save, not from the install. This extraction " +
          "therefore cannot state which game build these files belong to.",
      },
    ],
  };

  /* ---- the pages this sample actually contains ------------------------- */

  const CATEGORIES = [
    { key: "help_general", name: "General", pages: 9, sample: 0 },
    { key: "common_finance", name: "Finance", pages: 3, sample: 0 },
    { key: "building_title", name: "Buildings", pages: 10, sample: 2 },
    { key: "common_business_types", name: "Business types", pages: 24, sample: 3 },
    { key: "employee_types", name: "Employee types", pages: 21, sample: 2 },
    { key: "employee_management", name: "Employee management", pages: 7, sample: 0 },
    { key: "common_sellable_products", name: "Products", pages: 76, sample: 4 },
    { key: "help_importers", name: "Wholesalers & importers", pages: 17, sample: 6 },
    { key: "common_furniture", name: "Furniture", pages: 522, sample: 8 },
    { key: "rivals_title", name: "Rivals", pages: 4, sample: 0 },
    { key: "common_factoryrecipes", name: "Factory recipes", pages: 62, sample: 3 },
    { key: "common_factorymachines", name: "Factory machines", pages: 17, sample: 3 },
    { key: "common_factory_ingredients", name: "Factory ingredients", pages: 61, sample: 5 },
    { key: "vehicles_title", name: "Vehicles", pages: 19, sample: 0 },
  ];

  /* ---- suppliers ------------------------------------------------------- */
  /* address strings are verbatim from the help text; street, neighbourhood,
     size and traffic come from ba_buildings.json, matched on street + number. */

  const SUPPLIERS = {
    pederson: {
      name: "AJ Pederson & Son",
      raw: "address:13 5a",
      street: "13 5th Avenue",
      hood: "Garment District",
      kind: "Furniture vendor",
      size: "M",
      area: 1000,
      traffic: 45,
      mentions: 43,
    },
    square: {
      name: "Square Appliances",
      raw: "address:16 4a",
      street: "16 4th Avenue",
      hood: "Hell's Kitchen",
      kind: "Furniture vendor",
      size: "C",
      area: 225,
      traffic: 50,
      mentions: 26,
    },
    essentials: {
      name: "Essentials Appliances",
      raw: "address:16 11s",
      street: "16 11th Street",
      hood: "Lower Manhattan",
      kind: "Furniture vendor",
      size: "M",
      area: 1000,
      traffic: 23,
      mentions: 81,
    },
    hampton: {
      name: "Hampton Supplies",
      raw: "address: 13 7a",
      street: "13 7th Avenue",
      hood: "The Hamptons",
      kind: "Furniture vendor",
      size: "D",
      area: 285,
      traffic: 53,
      mentions: 30,
    },
    ika: {
      name: "Ika Bohag",
      raw: "address:50 4s",
      street: "50 4th Street",
      hood: "Garment District",
      kind: "Furniture vendor",
      size: "G",
      area: 2000,
      traffic: 34,
      mentions: 178,
    },
    bluestone: {
      name: "Bluestone Imports",
      raw: "address: 4 pier",
      street: "4 Pier",
      hood: "Murray Hill",
      kind: "Importer - retail inventory",
      size: "H",
      area: 690,
      traffic: 18,
      mentions: 15,
      flag:
        "The bundled building table puts 4 Pier in Murray Hill while 7, 8 " +
        "and 9 Pier are Lower Manhattan. Worth one in-game check before " +
        "this badge ships.",
    },
    globalharvest: {
      name: "Global Harvest Traders",
      raw: "address: 9 pier",
      street: "9 Pier",
      hood: "Lower Manhattan",
      kind: "Importer - factory raw goods",
      size: "H",
      area: 690,
      traffic: 18,
      mentions: 17,
    },
    maritime: {
      name: "Maritime Freight Line",
      raw: "address: 7 pier",
      street: "7 Pier",
      hood: "Lower Manhattan",
      kind: "Importer - factory raw goods",
      size: "H",
      area: 690,
      traffic: 18,
      mentions: 16,
    },
    aquatic: {
      name: "Aquatic Bay Cargo",
      raw: "address: 8 pier",
      street: "8 Pier",
      hood: "Lower Manhattan",
      kind: "Importer - factory raw goods",
      size: "H",
      area: 690,
      traffic: 18,
      mentions: 18,
    },
    factorydepot: {
      name: "Factory Supply Depot",
      raw: "address:2 25s",
      street: "2 25th Street",
      hood: "Industry City",
      kind: "Factory machine vendor",
      size: "M",
      area: 1000,
      traffic: 37,
      mentions: 14,
    },
    anderson: {
      name: "Anderson Recruitment Corp.",
      raw: "address: 16 5a",
      street: "16 5th Avenue",
      hood: "Garment District",
      kind: "Recruitment",
      size: "C",
      area: 225,
      traffic: 50,
      mentions: 10,
    },
  };

  const WHOLESALERS = [
    { name: "Hudson Wholesale", raw: "address:13 12s", street: "13 12th Street", hood: "Lower Manhattan", traffic: 14 },
    { name: "Metro Wholesale", raw: "address:18 1s", street: "18 1st Street", hood: "Hell's Kitchen", traffic: 56 },
    { name: "NY Distro Inc", raw: "address: 37 1s", street: "37 1st Street", hood: "Garment District", traffic: 15 },
    { name: "StockCo", raw: "address: 1 6s", street: "1 6th Street", hood: "Midtown", traffic: 25 },
    { name: "Titans of Industry Supply", raw: "address: 4 25s", street: "4 25th Street", hood: "Industry City", traffic: 37 },
    { name: "Total Produce Trading", raw: "address: 4 6a", street: "4 6th Avenue", hood: "Murray Hill", traffic: 43 },
  ];

  /* ---- fixtures -------------------------------------------------------- */

  const FIXTURES = {
    roundedshelf: {
      name: "Rounded Shelf",
      src: "help_ba:itemname_roundedshelf_content",
      sells: ["cheapgift", "expensivegift", "cheapflower", "expensiveflower"],
      capacity: [
        { label: "Gifts", value: 300, unit: "units" },
        { label: "Flowers", value: 100, unit: "units" },
      ],
      customers: 15,
      vendors: ["pederson"],
      observed:
        "10 in the M1 rival gift shop, 4 in each of the golf and tennis " +
        "shops. Shipped shops stock them with cheap gifts, expensive gifts " +
        "and expensive flowers.",
    },
    productpanel: {
      name: "Product Panel",
      src: "help_ba:itemname_productpanel_content",
      sells: ["cheapgift", "umbrella"],
      capacity: [{ label: "Any product", value: 100, unit: "units" }],
      customers: 10,
      vendors: ["pederson"],
      observed:
        "8 in the M1 rival gift shop, 4 in each of the golf and tennis " +
        "shops - every single one set to umbrella, never to cheap gift. " +
        "The help text allows both; the shipped shops use one.",
    },
    baskets: {
      name: "Stack of Shopping Baskets",
      src: "help_ba:itemname_stackofshoppingbaskets_content",
      sells: [],
      capacity: [],
      customers: 30,
      vendors: ["square", "pederson", "essentials", "hampton"],
      observed: "3 in the M1 rival shop, 2 in each of the golf and tennis shops.",
    },
    cashregister: {
      name: "Cash Register",
      src: "help_ba:itemname_cashregister_content",
      sells: [],
      capacity: [{ label: "Products", value: 1000, unit: "units" }],
      customers: 20,
      station: "Customer Service",
      needs: "Paper Bag",
      mount: "Cabinets, Cocktail Bar, or Cocktail Bar (Wooden)",
      vendors: ["square", "pederson", "essentials", "hampton"],
      observed:
        "4 in the M1 rival shop, 2 in each of the golf and tennis shops. " +
        "No shipped gift shop uses a checkout counter.",
    },
    checkoutleft: {
      name: "Checkout Counter (Left)",
      src: "help_ba:itemname_checkoutcounterleft_content",
      sells: [],
      capacity: [{ label: "Products", value: 1000, unit: "units" }],
      customers: 30,
      station: "Customer Service",
      needs: "Paper Bag",
      vendors: ["pederson", "hampton"],
      observed: "Not used in any of the three shipped gift shop layouts.",
    },
    checkoutright: {
      name: "Checkout Counter (Right)",
      src: "help_ba:itemname_checkoutcounterright_content",
      sells: [],
      capacity: [{ label: "Products", value: 1000, unit: "units" }],
      customers: 30,
      station: "Customer Service",
      needs: "Paper Bag",
      vendors: ["pederson", "hampton"],
      observed: "Not used in any of the three shipped gift shop layouts.",
    },
    storageshelf: {
      name: "Storage Shelf",
      src: "help_ba:itemname_storageshelf_content",
      sells: [],
      capacity: [{ label: "Boxes", value: 16, unit: "boxes" }],
      customers: null,
      vendors: ["pederson", "essentials", "ika", "square", "hampton"],
      observed: "12 in the M1 rival shop, 2 in each of the golf and tennis shops.",
    },
  };

  /* ---- products -------------------------------------------------------- */

  const PRODUCTS = {
    cheapgift: {
      name: "Gift (Cheap)",
      slug: "ba:itemname_cheapgift",
      src: "help_ba:itemname_cheapgift_content",
      rank: "primary",
      alsoSoldBy: ["Florist", "Bookstore"],
      fixtures: ["roundedshelf", "productpanel"],
      wholesale: true,
      importers: ["bluestone"],
      recipe: "cheapgiftrecipe",
      crosscheck:
        "Rounded Shelf and Product Panel are the only two furniture pages " +
        "in the whole file that name this product, so the product page and " +
        "the furniture pages agree in both directions.",
    },
    expensivegift: {
      name: "Gift (Expensive)",
      slug: "ba:itemname_expensivegift",
      src: "help_ba:itemname_expensivegift_content",
      rank: "primary",
      alsoSoldBy: ["Florist"],
      fixtures: ["roundedshelf"],
      wholesale: false,
      importers: ["bluestone"],
      recipe: "expensivegiftrecipe",
      crosscheck:
        "Rounded Shelf is the only furniture page that names it, and it is " +
        "absent from the wholesaler product list - so wholesale really is " +
        "closed for this one.",
    },
    umbrella: {
      name: "Umbrella",
      slug: "ba:itemname_umbrella",
      src: "help_ba:itemname_umbrella_content",
      rank: "primary",
      alsoSoldBy: ["Florist", "Bookstore"],
      fixtures: ["productpanel"],
      wholesale: true,
      importers: ["bluestone"],
      recipe: "umbrellarecipe",
      crosscheck:
        "Product Panel is the only furniture page that names it. Doubles as " +
        "a character accessory that blocks rain.",
    },
  };

  const EXTRAS = [
    "Arty Fish Smartwatch",
    "Energy Drink",
    "Flower (Cheap)",
    "Flower (Expensive)",
    "Picture Book",
    "Rhythm By Tre",
    "Soda Can",
    "ZanaMan Smartwatch",
  ];

  /* ---- recipes --------------------------------------------------------- */

  const RECIPES = {
    cheapgiftrecipe: {
      name: "Gift (Cheap) Recipe",
      src: "help_recipes_cheapgiftrecipe_content",
      workstation: "Consumer Goods Workstation",
      inputs: [{ item: "Clay", per: 50, from: ["globalharvest"] }],
      out: { item: "Gift (Cheap)", per: 100 },
    },
    expensivegiftrecipe: {
      name: "Gift (Expensive) Recipe",
      src: "help_recipes_expensivegiftrecipe_content",
      workstation: "Consumer Goods Workstation",
      inputs: [
        { item: "Glass", per: 100, from: ["maritime"] },
        { item: "Plastic", per: 250, from: ["maritime"] },
        { item: "Water", per: 100, from: ["aquatic", "globalharvest"] },
      ],
      out: { item: "Gift (Expensive)", per: 100 },
    },
    umbrellarecipe: {
      name: "Umbrella Recipe",
      src: "help_recipes_umbrellarecipe_content",
      workstation: "Consumer Goods Workstation",
      inputs: [
        { item: "Plastic", per: 50, from: ["maritime"] },
        { item: "Metal Wire", per: 100, from: ["globalharvest"] },
      ],
      out: { item: "Umbrella", per: 100 },
    },
  };

  const WORKSTATION = {
    name: "Consumer Goods Workstation",
    src: "help_factory_workstation_consumergoods_content",
    assembly: "Consumer Goods Assembly Machine",
    production: ["Laser Cutting Machine"],
    vendor: "factorydepot",
    runs: [
      "Cigar",
      "Cigarette",
      "Gifts (Cheap)",
      "Gifts (Expensive)",
      "Limited Edition Book",
      "Motivational Book",
      "Novel",
      "Paper Bag",
      "Picture Book",
      "Technical Manual",
      "Umbrella",
      "Youth Novel",
    ],
  };

  /* ---- the business ---------------------------------------------------- */

  const BUSINESS = {
    slug: "businesstypes-giftshop",
    name: "Gift Shop",
    nameSrc: "ba:businesstype_giftshop",
    src: "help_ba:businesstype_giftshop_content",
    building: "Retail",
    serving: "Self-serving",
    skills: ["Customer Service", "Cleaning"],
    hiring: "anderson",
    primary: ["cheapgift", "expensivegift", "umbrella"],
    extras: EXTRAS,
  };

  const RETAIL_SIZES = [
    { code: "A1", area: 75, customers: 15 },
    { code: "A2", area: 75, customers: 15 },
    { code: "C1", area: 225, customers: 30 },
    { code: "C2", area: 225, customers: 30 },
    { code: "D2", area: 285, customers: 40 },
    { code: "M1", area: 1000, customers: 75 },
  ];

  /* ---- gaps this extraction could not close ---------------------------- */

  const GAPS = [
    {
      what: "Prices",
      detail:
        "No price appears anywhere in en.json - not rent, not furniture, " +
        "not wholesale or import cost. Nothing on this page can carry a " +
        "money figure without a loaded save.",
    },
    {
      what: "Weekly delivery limits",
      detail:
        "help_wholesalers_weeklylimits_content says every importer and " +
        "wholesaler caps each item per week and that the cap resets Monday " +
        "08:00, but never gives a number for any item.",
    },
    {
      what: "Rated rate is a ceiling, not an observation",
      detail:
        "Every recipe page gives a 'Max Production Rate Per Hour'. Nothing " +
        "in the game files says what a line achieves in practice, or what " +
        "happens when an input runs out mid-hour. Big Copilot's 24-hour " +
        "model is inferred from measured factory draw, not from this text.",
    },
    {
      what: "Customer capacity by size code is ambiguous",
      detail:
        "help_building_types_content lists C1 twice: 30 customers as " +
        "retail, 8 as office. ba_buildings.json stores only the letter, so " +
        "it cannot tell C1 from C2 either. Size code alone does not fix a " +
        "shop's door limit.",
    },
    {
      what: "Five help links point nowhere",
      detail:
        "common_exercise (17 times), common_accessories (5), common_watchtv, " +
        "common_playcomputer and common_readbooks are used as link targets " +
        "but are not page slugs in helpstructure.json. The renderer has to " +
        "degrade to plain text, not throw.",
    },
    {
      what: "Malformed markdown in the source",
      detail:
        "help_ba:itemname_productdisplaystandtiered_content opens " +
        "'**Product Capacity: 40' and never closes the bold. Supplier names " +
        "are inconsistent too: 'Haylcon Fairway' for Halcyon, 'JetCargo " +
        "Imports' and 'Jet Cargo Imports' for the same pier.",
    },
    {
      what: "Which build this is",
      detail:
        "The installation carries no game build number in plain text. Only " +
        "the Unity engine version and Steam's depot build id are readable, " +
        "and neither is the number a save reports.",
    },
  ];

  return {
    SOURCES,
    CATEGORIES,
    SUPPLIERS,
    WHOLESALERS,
    FIXTURES,
    PRODUCTS,
    RECIPES,
    WORKSTATION,
    BUSINESS,
    RETAIL_SIZES,
    GAPS,
  };
})();
