"""Python's sentences, translatable: msg(), Msg and _wire_msgs().

msg() returns the English sentence Python always wrote, as a str that also
carries its catalogue key and params, and _wire_msgs() hands those to the page
in each row's `i18n` field at the end of extract(). The English must not move
by a byte, so every reader and test that compares, slices or plain()s a
sentence sees what it saw before. docs/architecture.md, "UI text".

Synthetic data only: tests/es3_fixture.py's company, the stub businesses of
tests/test_site_panel_fields.py, and the theatre and roster fixtures.
"""
import copy
import json
import os
import pickle
import tempfile
import unittest

import ba_dashboard
from ba_dashboard import Msg, _alerts, _wire_msgs, msg, plain, tok
from test_site_panel_fields import stub
from tests import roster_fixture, theatre_fixture
from tests.game_names_fixture import fixture as game_names_fixture
from tests.es3_fixture import link_payload, write_link_save
from tests import save_fixtures
from ba_save import Names, load_save

SUPPLY = {"graph": {"links": []}, "shops": [], "idle": [], "imports": []}

# The areas whose Python prose is converted to msg(), and where that prose
# sits in the payloads below: (payload, path to a list of rows, field[, which
# rows]). A conversion pull request adds its area here, and from then on every
# such sentence in the fixtures has to reach the page as a message, not as a
# plain string that stays English.
#
# The findings are converted in two halves: _alerts() and _shelf_notes() (5a),
# then the helpers after _shelf_notes() (5b). The kinds the first half writes
# are held to it with every summary line and unit
# (findings_5a), and the kinds the second half writes with their detail and
# synthetic sites (findings_5b). "staff", "outruns" and "wholesale" are
# written by both halves (and "staff" by the site panel's area too).
FINDINGS_5A = {
    "notrading", "vacant", "loss", "satisfaction", "uniform", "bathroom", "toiletprivacy", "sink",
    "music", "interior", "jobdemand", "companydemand", "promotion", "hype", "trend", "atcap",
    "idlestaff", "unplanned",
}


def findings_5a(row, field):
    if field == "text" and "detail" in row:
        return True  # a summary line (_condense)
    if field == "unit":
        return bool(row.get("unit"))
    if field == "site":
        return row.get("siteKey") is None and row.get("group") in FINDINGS_5A
    return row.get("group") in FINDINGS_5A


FINDINGS_5B = {"topup", "paused", "order", "shortfall", "feed", "unnamed", "unset", "dead", "notrouted", "target"}


def findings_5b(row, field):
    if row.get("group") not in FINDINGS_5B:
        return False
    if field == "text":
        return "detail" not in row  # a summary line's own text: findings_5a
    if field == "site":
        return row.get("siteKey") is None
    return True


CONVERTED = {
    "f": [(name, "alerts", field, findings_5a)
          for name in ("es3", "game_names") for field in ("text", "unit")]
    + [(name, "alerts", field, findings_5b)
       for name in ("data", "game_names") for field in ("text", "detail", "site")],
    # Today writes its own words in the page (tt()); Python sends it numbers only.
    "today": [],
}


def rows_at(payload, path):
    """The rows under a dotted path: a list, or a list inside each row of one."""
    here = [payload]
    for part in path.split("."):
        nxt = []
        for node in here:
            v = node.get(part) if isinstance(node, dict) else None
            if isinstance(v, list):
                nxt.extend(v)
            elif v is not None:
                nxt.append(v)
        here = nxt
    return [r for r in here if isinstance(r, dict)]


def uncovered(payload, path, field, which=None):
    """The rows whose `field` reaches the page as a plain English string."""
    return [r[field] for r in rows_at(payload, path)
            if (which is None or which(r, field))
            and isinstance(r.get(field), str) and field not in (r.get("i18n") or {})]


def fixtures():
    """The payloads the coverage runs over, wired as extract() wires them."""
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "Link Co.hsg")
        write_link_save(path)
        es3 = link_payload(path)
        # tests/save_fixtures.py's trading company, whose factories raise
        # findings the skeleton company is too quiet for.
        save_fixtures.write_data_save(path, save_fixtures.DAY)
        data = ba_dashboard.extract(load_save(path), Names(dict(save_fixtures.data_names())),
                                    os.path.join(tmp, "history.json"))
    theatre = theatre_fixture.rows()
    return {
        "es3": es3,
        "theatre": _wire_msgs({"hourFindings": theatre["findings"], "hours": [theatre["grid"]]}),
        "roster": _wire_msgs({"staffing": list(roster_fixture.rows().values())}),
        "game_names": _wire_msgs(game_names_fixture()["payload"]),
        "data": data,
    }


class MsgIsTheEnglish(unittest.TestCase):
    def test_a_message_is_the_sentence_python_wrote(self):
        profit = -1234.5
        m = msg("f.loss", "Lost {w:$} yesterday", w=abs(profit))
        self.assertIsInstance(m, str)
        self.assertEqual(m, f"Lost ${abs(profit):,.0f} yesterday")
        self.assertEqual((m.key, m.p), ("f.loss", {"w": 1234.5}))
        self.assertEqual(plain(m), m)

    def test_the_specs_write_what_the_f_strings_wrote(self):
        cases = [
            ("{n}", 7, "7"), ("{n}", 2.5, "2.5"), ("{n:,}", 1234567, "1,234,567"),
            ("{n:,}", 1234.6, "1,234.6"), ("{x:.1f}", 3.14159, "3.1"), ("{x:.2f}", 1234.5, "1234.50"),
            ("{x:,.1f}", 12345.67, "12,345.7"), ("{w:$}", 98.4, "$98"), ("{w:$}", 1234567, "$1,234,567"),
            ("{w:$}", -50, "-$50"), ("{w:$c}", 98, "$98"), ("{w:$c}", 751_400, "$751k"),
            ("{w:$c}", 3_574_000, "$3.57M"), ("{w:$c}", 12_345_678, "$12.3M"), ("{w:$c}", 1_125_000, "$1.13M"),
            ("{w:$c}", -2500, "-$3k"), ("{d:day}", 0, "Sunday"), ("{d:day}", 6, "Saturday"),
        ]
        for template, value, want in cases:
            with self.subTest(template=template, value=value):
                self.assertEqual(msg("f.x", template, n=value, x=value, w=value, d=value), want)

    def test_each_spec_is_byte_for_byte_the_f_string_it_replaces(self):
        # Fractional, negative, tiny and huge: the converted template writes
        # what the old f-string wrote, including where "$" and "-" fall.
        values = (0, 7, -7, 1234, -1234, 1234.5, -1234.5, 0.30000000000000004, 1234.5678, -0.04,
                  2.675, 999999.999, 1e21, 12_345_678.9)
        pairs = [("{x}", lambda x: f"{x}"), ("{x:,}", lambda x: f"{x:,}"), ("{x:,.0f}", lambda x: f"{x:,.0f}"),
                 ("{x:.1f}", lambda x: f"{x:.1f}"), ("{x:,.2f}", lambda x: f"{x:,.2f}"),
                 ("${x:,.0f}", lambda x: f"${x:,.0f}"),
                 ("{x:$}", lambda x: ("-" if x < 0 else "") + f"${abs(x):,.0f}")]
        for template, old in pairs:
            for x in values:
                with self.subTest(template=template, x=x):
                    self.assertEqual(msg("f.x", template, x=x), old(x))
        # Only a sign-first old string converts to {w:$}; "$-1,234" keeps its literal dollar.
        self.assertEqual(msg("f.x", "${x:,.0f}", x=-1234.4), "$-1,234")
        self.assertEqual(msg("f.x", "{x:$}", x=-1234.4), "-$1,234")

    def test_fractions_and_decimals_travel_as_numbers(self):
        import decimal
        import fractions
        m = msg("f.x", "{a} {b}", a=fractions.Fraction(1, 4), b=decimal.Decimal("2.5"))
        self.assertEqual(m.wire(), ["f.x", {"a": 0.25, "b": 2.5}])
        self.assertEqual(json.loads(json.dumps(m.wire())), ["f.x", {"a": 0.25, "b": 2.5}])

    def test_plural_english_is_chosen_by_n(self):
        en = {"one": "{n} machine runs dry", "other": "{n} machines run dry"}
        self.assertEqual(msg("f.x", en, n=1), "1 machine runs dry")
        self.assertEqual(msg("f.x", en, n=3), "3 machines run dry")
        self.assertEqual(msg("f.x", en, n=0), "0 machines run dry")

    def test_names_and_nested_messages_keep_their_english(self):
        coffee = tok("ba:itemname_coffee", "Coffee")
        inner = msg("f.inner", "{days:.1f} days early", days=3.5)
        m = msg("f.outer", "{item}: runs dry {when}", item=coffee, when=inner)
        self.assertEqual(plain(m), "Coffee: runs dry 3.5 days early")
        self.assertEqual(m.wire(), ["f.outer", {"item": coffee, "when": {"m": ["f.inner", {"days": 3.5}, "3.5 days early"]}}])

    def test_a_mistake_at_the_call_site_fails_loudly(self):
        with self.assertRaises(KeyError):
            msg("f.x", "Lost {w:$} yesterday")
        with self.assertRaises(ValueError):
            msg("f.x", "{w:%}", w=1)

    def test_editing_a_message_gives_plain_english(self):
        # The loss is visible, not wrong: the row keeps its English and no key.
        m = msg("f.staff.none", "No staff assigned")
        for edited in (m + ".", m.replace("No", "No"), m.upper(), f"{m}"):
            self.assertIs(type(edited), str)

    def test_a_message_survives_a_copy_and_a_pickle(self):
        m = msg("f.loss", "Lost {w:$} yesterday", w=12.0)
        for twin in (copy.deepcopy(m), copy.copy(m), pickle.loads(pickle.dumps(m))):
            self.assertEqual((twin, twin.key, twin.p), (m, m.key, m.p))
            self.assertIsInstance(twin, Msg)


class WiringTests(unittest.TestCase):
    def test_every_message_field_gets_its_wire_beside_it(self):
        payload = {"alerts": [
            {"text": msg("f.loss", "Lost {w:$} yesterday", w=40.0), "detail": msg("f.staff.none", "No staff assigned"),
             "site": "HART. Gifts"},
            {"text": "Plain English", "site": "x"},
        ], "nested": {"rows": [[{"limit": msg("f.x", "{n:,} short", n=1500)}]]}}
        _wire_msgs(payload)
        self.assertEqual(payload["alerts"][0]["i18n"], {
            "text": ["f.loss", {"w": 40.0}], "detail": ["f.staff.none", {}]})
        self.assertNotIn("i18n", payload["alerts"][1])
        self.assertEqual(payload["nested"]["rows"][0][0]["i18n"], {"limit": ["f.x", {"n": 1500}]})
        self.assertEqual(payload["alerts"][0]["text"], "Lost $40 yesterday")

    def test_wiring_twice_changes_nothing(self):
        row = {"text": msg("f.loss", "Lost {w:$} yesterday", w=40.0)}
        payload = {"a": [row], "b": [row]}
        _wire_msgs(payload)
        once = json.dumps(payload)
        _wire_msgs(payload)
        self.assertEqual(json.dumps(payload), once)

    def test_the_wire_is_json_and_comes_back_whole(self):
        coffee = tok("ba:itemname_coffee", "Coffee")
        payload = _wire_msgs({"rows": [{"text": msg("f.x", "{item} {n:,}", item=coffee, n=3, ok=True, gone=None)}]})
        back = json.loads(json.dumps(payload))
        self.assertEqual(back["rows"][0]["text"], f"{coffee} 3")
        self.assertEqual(back["rows"][0]["i18n"]["text"], ["f.x", {"item": coffee, "n": 3, "ok": True, "gone": None}])


class WorkedExample(unittest.TestCase):
    """f.loss and f.staff.none: the two findings PR 1 converts, as the model
    for the rest."""

    def lines(self, **over):
        out = _alerts([stub("k1", "HART. Gifts", "retail", **{"promotion": 100, **over})], SUPPLY, [], [], [], [], [], 60, 0.0)
        return {r["group"]: r for r in out["lines"] + out["minor"]["rows"]}

    def test_the_loss_reads_as_it_did_and_carries_its_message(self):
        row = self.lines(profit=-1234.4, costCentre=False, revenue=10.0)["loss"]
        self.assertEqual(row["text"], "Lost $1,234 yesterday")
        self.assertEqual((row["text"].key, row["text"].p), ("f.loss", {"w": 1234.4}))
        _wire_msgs(row)
        self.assertEqual(row["i18n"], {"text": ["f.loss", {"w": 1234.4}], "unit": ["f.unit.loss", {}]})

    def test_no_staff_reads_as_it_did_and_carries_its_message(self):
        row = self.lines(staff=0, revenue=10.0)["staff"]
        self.assertEqual(row["text"], "No staff assigned")
        self.assertEqual(row["text"].key, "f.staff.none")

    def test_extract_wires_the_payload_it_returns(self):
        payload = fixtures()["es3"]
        staff = [a for a in payload["alerts"] if a["group"] == "staff"]
        self.assertTrue(staff, "the fixture company has a shop with nobody on it")
        for row in staff:
            self.assertEqual(row["i18n"]["text"], ["f.staff.none", {}])
        # The same save builds the same payload, messages included.
        again = fixtures()["es3"]
        for key in ("generated", "saved"):
            payload["meta"].pop(key)
            again["meta"].pop(key)
        self.assertEqual(json.dumps(payload, sort_keys=True), json.dumps(again, sort_keys=True))


class PageTests(unittest.TestCase):
    """render() splices web/i18n.js into the head, and --lang carries a table."""

    def test_the_head_carries_tt_before_any_other_script(self):
        page = ba_dashboard.render(None)
        self.assertIn("const TT_EMBED = null;", page)
        # After the stylesheets, so the browser finds them first; before any
        # markup of the body, so the page can be hidden before it paints.
        at = page.index("function tt(key, en, params)")
        self.assertLess(page.index("</style>"), at)
        self.assertLess(at, page.index('<div class="wrap">'))
        self.assertLess(at, page.index("let D = "))
        self.assertNotIn("/*__I18N_SCRIPT__*/", page)

    def test_a_lang_page_carries_its_table(self):
        page = ba_dashboard.render(None, ui={"lang": "de", "table": {"nav.today": "Heute</script>"}})
        self.assertIn('const TT_EMBED = {"lang":"de","table":{"nav.today":"Heute<\\/script>"}};', page)

    def test_the_table_is_spliced_last_and_only_into_the_head(self):
        # No later placeholder runs over the table's text, and a marker in the
        # player's own words (the payload) stays as written.
        table = {"nav.x": "__TITLE__ <!--__FOOTER__--> /*__MAP_SCRIPT__*/"}
        page = ba_dashboard.render(None, ui={"lang": "de", "table": table})
        self.assertIn(json.dumps(table, separators=(",", ":")), page)
        payload = fixtures()["es3"]
        payload["meta"]["save"] = "Co /*__I18N_SCRIPT__*/"
        page = ba_dashboard.render(payload)
        self.assertEqual(page.count("function tt(key, en, params)"), 1)
        self.assertIn('"save":"Co /*__I18N_SCRIPT__*/"', page)

    def test_cli_ui_table_is_none_for_english_and_an_empty_table(self):
        self.assertIsNone(ba_dashboard.cli_ui_table(None))
        self.assertIsNone(ba_dashboard.cli_ui_table("en"))
        self.assertIsNone(ba_dashboard.cli_ui_table("xx"))
        with open(os.path.join(os.path.dirname(ba_dashboard.__file__), "web", "i18n", "de.json"), encoding="utf-8") as fh:
            shipped = json.load(fh)
        got = ba_dashboard.cli_ui_table("de")
        self.assertEqual(got, {"lang": "de", "table": shipped} if shipped else None)


def keys_in(value, out=None):
    """Every message key in a Msg and the messages nested in its params."""
    out = set() if out is None else out
    if isinstance(value, Msg):
        out.add(value.key)
        for v in value.p.values():
            keys_in(v, out)
    return out


class FindingsHalfB(unittest.TestCase):
    """The helpers after _shelf_notes(), every branch on synthetic rows: each
    sentence and synthetic site a message, every key reached, the English as
    the f-strings wrote it."""

    def facts(self):
        """_import_notes() over one depot holding a fact of each shape."""
        facts, imports, depots, lines = {}, [], {}, []

        def add(fact, row=None, entry=None):
            slug = f"ba:itemname_x{len(facts)}"
            facts[slug] = fact
            lines.append({"slug": slug, "item": f"Item {len(facts)}", "units": 2500})
            if row is not None:
                imports.append({"s": 0, "slug": slug, "item": f"Item {len(facts)}", "perDay": 40, **row})
            if entry is not None:
                depots[slug] = entry

        wk = {"cad": "weekly", "lvl": "critical", "use": 2800, "why": "order"}
        for set_to in (None, 9000):
            add({"role": "depot", "cad": "daily", "st": "short", "why": "target", "have": 100, "use": 250,
                 "setTo": 300})
            for route in (0, 1500):
                add({**wk, "role": "depot", "st": "short", "why": "order", "wholesale": True, "have": 1000,
                     "setTo": set_to, "parts": {"route": route}})
            add({**wk, "role": "input", "st": "short", "why": "order", "setTo": set_to}, entry={"weekly": 800})
            for level_name in (None, "Pier 1"):
                add({**wk, "role": "input", "st": "short", "why": "order", "setTo": set_to},
                    entry={"smart": True, "target": 900, "levelName": level_name})
        for sites, route in ((0, 0), (0, 400), (2, 0), (2, 400)):
            add({**wk, "role": "input", "st": "noplan", "lvl": "warn", "parts": {"sites": sites, "route": route}})
        add({**wk, "role": "input", "st": "paused", "why": "order"})
        for cover in (1.0, 2.5):
            add({**wk, "role": "depot", "st": "paused", "why": "order"},
                row={"cover": cover, "coverFit": "ok", "runsOut": None, "arrives": 3})
        add({**wk, "role": "depot", "st": "paused", "why": "order"})
        for smart in (False, True):
            for fit, runs in (("ok", None), ("short", "Tuesday"), ("short", None)):
                add({**wk, "role": "depot", "st": "short", "why": "order"},
                    row={"cover": 1.0, "coverFit": fit, "runsOut": runs, "arrives": 8, "shortBy": 2.25},
                    entry={"smart": True, "target": 900, "plainAfter": 50} if smart else {"weekly": 1300})
        for covered, paused, routed in ((False, False, 0), (False, False, 60), (True, False, 60), (True, True, 60)):
            add({**wk, "role": "depot", "st": "short", "why": "shortfall"},
                row={"cover": 2.5, "importPerDay": 1100, "peakPerDay": 2150, "covered": covered, "paused": paused,
                     "routed": routed, "runsOut": None, "arrives": 5, "shortBy": 1.25})
        return {"facts": {"0": facts}, "imports": imports, "shops": [],
                "factories": {"depots": {0: depots}, "sites": []}}, lines

    def rows(self):
        depot = stub("k0", "Depot One", "warehouse")
        supply, depot["lines"] = self.facts()
        real = ba_dashboard._supply_fact
        ba_dashboard._supply_fact = lambda facts, s, slug, mode: facts[str(s)][slug]
        try:
            found = ba_dashboard._import_notes([depot], supply, set())
        finally:
            ba_dashboard._supply_fact = real
        smart = [ba_dashboard._smart_words(500, after, before) for after in (0, 70) for before in (0, 300, 500, 800)]

        plant = stub("k1", "Plant", "factory", typeSlug="ba:businesstype_factory", type="Factory")
        needs = [{"slug": "ba:itemname_f0", "item": "Feed", "perDay": 480, "from": 0, "directImport": False,
                  "lines": ["Bread", "Cake"], "lineSlugs": ["ba:itemname_bread"], "target": 240, "depotStock": 9000,
                  "arrives": 200, "level": "critical", "status": "noplan", "why": None, "ownPaused": own}
                 for own in (False, True)]
        for own in (False, True):
            for frm in (0, None):
                needs += [dict(needs[0], status="short", why="target", setTo=raise_to, stalled=stalled,
                               ownPaused=own, **{"from": frm})
                          for raise_to in (None, 700) for stalled in (False, True)]
                needs += [dict(needs[0], status=status, why=why, ownPaused=own, **{"from": frm})
                          for status, why in (("short", "dry"), ("stalled", "notDrawn"))]
        unnamed = [{"idle": idle, "machines": n, "workstation": "Oven", "slots": list(range(1, n + 1)),
                    "workstationKey": "ba:factoryworkstationtype_oven"} for idle in (True, False) for n in (1, 3)]
        factories = {"sites": [{"s": 1, "needs": needs, "unnamed": unnamed[i::2], "lines": []} for i in (0, 1)]}
        found += ba_dashboard._feed_notes([depot, plant], factories, set())
        found += ba_dashboard._unnamed_notes([depot, plant], factories, set())

        gifts = [stub(f"k{i}", f"Gift {i}", "retail", typeSlug="ba:businesstype_giftshop", type="Gift Shop")
                 for i in (2, 3)]
        idle = []
        others = [stub("k4", "Plant 2", "factory", typeSlug="ba:businesstype_factory", type="Factory"),
                  stub("k5", "Travel", "office", typeSlug="ba:businesstype_travelagency", type="Travel Agency")]
        for unfed in ([(2, 120, 3)], [(2, 120, None)], [(1, 50, 2)], [(1, 50, None)], [(2, 60, 4), (3, 70, 1)],
                      [(2, 60, None), (3, 70, None)], [(1, 60, 4), (4, 70, 2)], [(1, 60, None), (5, 70, None)],
                      [(1, 60, 4), (2, 70, 2)], [(1, 60, None), (2, 70, None)]):
            idle.append({"why": "notRouted", "unfed": unfed})
        idle += [{"why": "notMoving", "routedFrom": 1, "target": 5000}, {"why": "notMoving"},
                 {"why": "importHigh", "smart": True, "importLevel": 20000}, {"why": "importHigh", "importLevel": 9000},
                 {"why": "overstock"}, {"why": "targetHigh", "target": 3000, "s": 2},
                 {"why": "targetHigh", "target": 3000, "s": 3}, {"why": "targetHigh", "target": 0, "s": 2},
                 {"why": "targetHigh", "target": 800, "s": 2, "item": "Solo"}]
        idle = [{"s": 0, "slug": f"ba:itemname_i{i}", "item": f"Idle {i}", "stock": 12345, "weeks": 6.4,
                 "perWeek": 1900, "value": 5000.0, "price": 3.0, "dead": False, "target": None, **r}
                for i, r in enumerate(idle)]
        found += ba_dashboard._idle_notes([depot, plant, *gifts, *others], idle, set())
        return found, smart

    def test_every_row_of_the_second_half_is_a_message(self):
        found, smart = self.rows()
        keys = set()
        for m in smart:
            self.assertIsInstance(m, Msg)
            keys |= keys_in(m)
        for r in found:
            with self.subTest(group=r["group"], text=r["text"]):
                self.assertIsInstance(r["text"], Msg)
                keys |= keys_in(r["text"])
                if r["siteKey"] is None:
                    self.assertIsInstance(r["site"], Msg)
                    keys |= keys_in(r["site"])
                self.assertIn("text", _wire_msgs(dict(r))["i18n"])
        self.assertEqual(sorted(k for k in keys if k not in ("f.list", "f.list.last")), sorted(FINDINGS_5B_KEYS))

    def test_the_english_is_what_the_f_strings_wrote(self):
        found, _ = self.rows()
        text = {plain(r["text"]) for r in found}
        for want in (
            "Item 18 import is paused: 1 days left at 40/day",
            "Item 19 import is paused: 2 days left at 40/day",
            "Item 22 orders 1,300 a week against a 2,800 week of use, 1,500 short; already runs dry on Tuesday, "
            "2.2 days before Monday's import",
            "Item 26: Smart Delivery keeps 900 in stock, plus 50 a week on top against a 2,800 week of use, 2,800 "
            "short; already runs dry in 1.0 days, 2.2 days before Monday's import",
            "3 machines at Oven #1, Oven #2, Oven #3 have no recipe set: staffed and rented, making nothing",
            "1 machine at Oven #1 runs a recipe without usable details. Its inputs are missing from the totals; "
            "name unknown recipes or load matching game text to include them",
            "Feed top-up of 240 covers 12 hours of a 480/day line; raise it to 700; and none arrived last week "
            "though the depot holds 9,000; or resume the paused Feed import to Plant",
            "Depot One holds 12,345 Idle 4 no plan sends on; 2 gift shops sell 130/day and hold ~2 days",
            "Depot One holds 12,345 Idle 6 no plan sends on; 2 factories need 130/day and hold ~3 days",
            "Depot One holds 12,345 Idle 7 no plan sends on; 2 sites need 130/day",
            "Idle 15, Idle 16 top-up target of 3,000 is 11x daily sales in 2 shops; lower the target",
            "Solo top-up target of 800 is 3x daily sales in 1 shop; lower the target",
        ):
            self.assertIn(want, text)
        # Several shops of one type name the type by its key, so a translation
        # can write it in the names language.
        typed = next(r["text"] for r in found if "gift shops" in plain(r["text"]))
        self.assertIn(tok("ba:businesstype_giftshop", "gift shops"), typed)


# Every key the helpers after _shelf_notes() write; FindingsHalfB reaches each.
FINDINGS_5B_KEYS = {
    "f.smart", "f.smart.plus", "f.smart.counting", "f.smart.counting.plus", "f.smart.reaches",
    "f.smart.reaches.plus", "f.smart.passes", "f.smart.passes.plus",
    "f.topup", "f.depot.wholesale", "f.depot.wholesale.route", "f.depot.wholesale.raise",
    "f.depot.wholesale.route.raise", "f.import.paused.resume", "f.import.noplan", "f.import.noplan.route",
    "f.import.noplan.sites", "f.import.noplan.sites.route", "f.import.smart", "f.import.smart.at",
    "f.import.smart.raise", "f.import.smart.at.raise", "f.import.order", "f.import.order.raise",
    "f.paused", "f.paused.bare", "f.order", "f.order.dry", "f.order.smart", "f.order.smart.dry",
    "f.dry.on", "f.dry.in", "f.shortfall", "f.shortfall.routed", "f.shortfall.route", "f.shortfall.route.paused",
    "f.unnamed", "f.unset", "f.unnamed.spot",
    "f.feed.depot", "f.feed.noplan", "f.feed.noplan.resume", "f.feed.dry", "f.feed.dry.resume",
    "f.feed.notdrawn", "f.feed.notdrawn.resume", "f.feed.target", "f.feed.target.raise",
    "f.feed.target.stalled", "f.feed.target.resume", "f.feed.target.raise.stalled",
    "f.feed.target.raise.resume", "f.feed.target.stalled.resume", "f.feed.target.raise.stalled.resume",
    "f.notrouted.one.sells", "f.notrouted.one.sells.held", "f.notrouted.one.needs", "f.notrouted.one.needs.held",
    "f.notrouted.sell", "f.notrouted.sell.held", "f.notrouted.need", "f.notrouted.need.held",
    "f.notrouted.type", "f.notrouted.sites", "f.notrouted.days",
    "f.dead", "f.dead.route", "f.dead.import", "f.dead.import.smart", "f.dead.weeks",
    "f.target", "f.target.units", "f.target.site",
}
class FindingsHalfA(unittest.TestCase):
    """The kinds the fixtures do not raise, and the synthetic sites ("2 shops",
    "Company"): every sentence, pill and unit a message."""

    def test_every_row_of_the_first_half_is_a_message(self):
        shop = lambda k, name, **o: stub(k, name, "retail", **{"revenue": 10.0, "promotion": 100, **o})
        businesses = [
            stub("k0", "New", "retail", opened=59, staff=0),
            stub("k1", "Lease", "vacant"),
            shop("k2", "A", promotion=60, traffic=40, marketingIndex=20, customers=3, profit=-50.0, costCentre=False,
                 satisfaction={"overall": 70}, uniformGaps=["Cashier"], uniformGapSkills=["ba:skill_customerservice"],
                 staffLacking=2, staffLackingCompany=1, quitWarnings=1, staffDemands=[
                     {"slug": "ba:jobdemand_fulltime", "demand": "Full-time", "count": 2, "priority": 2,
                      "company": False, "workedOver": {"count": 1, "max": 50, "unit": "hours"}},
                     {"slug": "ba:jobdemand_silverhealthinsurance", "demand": "Health insurance", "count": 1,
                      "priority": 1, "company": True}]),
            shop("k3", "B", promotion=70, traffic=50, marketingIndex=20, customers=3, missingUniformLocker=True),
        ]
        trends = [{"s": 2, "ready": True, "change": -0.3, "last7": 700.0, "prev7": 1000.0}]
        cap = {"kind": "cap", "limit": "staffing", "cap": 30, "when": "Mon 12", "hours": 2, "throughput": 50.0,
               "fix": "more staff"}
        hours = [dict(cap, key="k2", site="A"), dict(cap, key="k3", site="B")]
        out = _wire_msgs(_alerts(businesses, SUPPLY, [], trends, [], hours, [], 60, 0.0))
        rows = out["lines"] + out["minor"]["rows"]
        self.assertTrue({"notrading", "vacant", "loss", "satisfaction", "uniform", "jobdemand", "companydemand",
                         "promotion", "trend", "atcap"} <= {r["group"] for r in rows})
        for r in rows:
            with self.subTest(group=r["group"], text=r["text"]):
                self.assertIn("text", r["i18n"])
                if r["siteKey"] is None:
                    self.assertIn("site", r["i18n"])
                if r["unit"]:
                    self.assertIn("unit", r["i18n"])


class Coverage(unittest.TestCase):
    def test_every_converted_area_reaches_the_page_as_messages(self):
        payloads = fixtures()
        for area, places in CONVERTED.items():
            for name, path, field, *which in places:
                with self.subTest(area=area, payload=name, path=path, field=field):
                    self.assertTrue(rows_at(payloads[name], path), f"{name} has nothing at {path}")
                    self.assertEqual(uncovered(payloads[name], path, field, *which), [],
                                     "a sentence of a converted area lost its message (a + or .replace()?)")

    def test_the_coverage_check_finds_a_sentence_that_lost_its_message(self):
        # The guard itself: a row edited after msg() is reported, a wired one is not.
        payload = _wire_msgs({"alerts": [{"text": msg("f.staff.none", "No staff assigned")},
                                         {"text": msg("f.staff.none", "No staff assigned") + "!"}]})
        self.assertEqual(uncovered(payload, "alerts", "text"), ["No staff assigned!"])
        self.assertEqual(len(rows_at({"a": [{"b": [{}, {}]}, {"b": [{}]}]}, "a.b")), 3)


if __name__ == "__main__":
    unittest.main()
