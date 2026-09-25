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
from tests.es3_fixture import link_payload, write_link_save

SUPPLY = {"graph": {"links": []}, "shops": [], "idle": [], "imports": []}

# The areas whose Python prose is converted to msg(), and where that prose
# sits in the payloads below: (payload, path to a list of rows, field). A
# conversion pull request adds its area here, and from then on every such
# sentence in the fixtures has to reach the page as a message, not as a plain
# string that stays English. None is converted yet: PR 1 is the machinery,
# with f.loss and f.staff.none as its worked example (tested on their own).
CONVERTED = {
    # "f": [("es3", "alerts", "text"), ("es3", "alerts", "detail"), ...],
    # The Company page: each chain's name in the Portfolio.
    "co": [("es3", "chains", "name")],
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


def uncovered(payload, path, field):
    """The rows whose `field` reaches the page as a plain English string."""
    return [r[field] for r in rows_at(payload, path)
            if isinstance(r.get(field), str) and field not in (r.get("i18n") or {})]


def fixtures():
    """The payloads the coverage runs over, wired as extract() wires them."""
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "Link Co.hsg")
        write_link_save(path)
        es3 = link_payload(path)
    theatre = theatre_fixture.rows()
    return {
        "es3": es3,
        "theatre": _wire_msgs({"hourFindings": theatre["findings"], "hours": [theatre["grid"]]}),
        "roster": _wire_msgs({"staffing": list(roster_fixture.rows().values())}),
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
        self.assertEqual(row["i18n"], {"text": ["f.loss", {"w": 1234.4}]})

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


class Coverage(unittest.TestCase):
    def test_every_converted_area_reaches_the_page_as_messages(self):
        payloads = fixtures()
        for area, places in CONVERTED.items():
            for name, path, field in places:
                with self.subTest(area=area, payload=name, path=path, field=field):
                    self.assertTrue(rows_at(payloads[name], path), f"{name} has nothing at {path}")
                    self.assertEqual(uncovered(payloads[name], path, field), [],
                                     "a sentence of a converted area lost its message (a + or .replace()?)")

    def test_the_coverage_check_finds_a_sentence_that_lost_its_message(self):
        # The guard itself: a row edited after msg() is reported, a wired one is not.
        payload = _wire_msgs({"alerts": [{"text": msg("f.staff.none", "No staff assigned")},
                                         {"text": msg("f.staff.none", "No staff assigned") + "!"}]})
        self.assertEqual(uncovered(payload, "alerts", "text"), ["No staff assigned!"])
        self.assertEqual(len(rows_at({"a": [{"b": [{}, {}]}, {"b": [{}]}]}, "a.b")), 3)


if __name__ == "__main__":
    unittest.main()
