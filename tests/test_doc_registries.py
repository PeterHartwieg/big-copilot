"""The registries docs/architecture.md writes down, held to the code.

Issue #100 Change C. Each test fails with the name of the row that is missing
on either side, so a new payload key, build token or finding kind cannot land
without its row in the doc (see the Registries section of docs/architecture.md).
"""
from __future__ import annotations

import ast
import os
import re
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, ROOT)

import ba_dashboard  # noqa: E402
import es3_fixture  # noqa: E402
from ba_save import Names, load_save  # noqa: E402


def read(name: str) -> str:
    with open(os.path.join(ROOT, name), encoding="utf-8") as fh:
        return fh.read()


def between(text: str, start: str, end: str, what: str) -> str:
    """The text from `start` (found exactly once) to the first `end` after it."""
    count = text.count(start)
    if count != 1:
        raise AssertionError(f"{what}: anchor {start!r} is there {count} times, expected once")
    at = text.index(start)
    stop = text.find(end, at + len(start))
    if stop < 0:
        raise AssertionError(f"{what}: end anchor {end!r} not found after {start!r}")
    return text[at:stop]


ARCH = read("docs/architecture.md")
DASHBOARD = read("ba_dashboard.py")
TOKEN = re.compile(r"__[A-Z_]+__")


def diff_message(what: str, doc: set, code: set) -> str:
    lines = [what]
    if code - doc:
        lines.append(f"  in the code, missing from the doc: {', '.join(sorted(code - doc))}")
    if doc - code:
        lines.append(f"  in the doc, gone from the code: {', '.join(sorted(doc - code))}")
    return "\n".join(lines)


class PayloadTableTests(unittest.TestCase):
    """(a) The payload-contract table lists every top-level key of extract()."""

    @staticmethod
    def doc_keys() -> set:
        table = between(ARCH, "## The payload contract", "\n## ", "payload contract section")
        return set(re.findall(r"^\| `(\w+)` \|", table, re.M))

    @staticmethod
    def payload_keys() -> set:
        # extract() returns one fixed dict, so the skeleton company carries every
        # key (tests/test_payload_snapshot.py shows the data company's are the same).
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "registry.hsg")
            es3_fixture.write_link_save(path)
            return set(ba_dashboard.extract(load_save(path), Names({}), None))

    def test_the_payload_table_has_a_row_for_every_key_extract_returns(self):
        doc, code = self.doc_keys(), self.payload_keys()
        self.assertTrue(doc, "no rows read out of the payload table")
        self.assertEqual(doc, code, diff_message(
            "docs/architecture.md, The payload contract, does not match extract()'s keys:", doc, code))


class BuildTokenTests(unittest.TestCase):
    """(b) The private-token list names every __TOKEN__ build_web.py fills."""

    @staticmethod
    def doc_tokens() -> set:
        sentence = between(ARCH, "`build_web.py` has a second, private set of tokens",
                           "Those are substituted", "private token list")
        return set(TOKEN.findall(sentence))

    @staticmethod
    def code_tokens() -> set:
        template = between(DASHBOARD, 'TEMPLATE = r"""', '"""', "TEMPLATE")
        # BANNER carries the template's own <!--__FOOTER__-->, which the
        # "Template placeholders" table documents; only the tokens TEMPLATE does
        # not carry are build_web.py's private set.
        return set(TOKEN.findall(read("build_web.py"))) - set(TOKEN.findall(template))

    def test_the_private_token_list_matches_build_web(self):
        doc, code = self.doc_tokens(), self.code_tokens()
        self.assertTrue(doc, "no tokens read out of the private token list")
        self.assertEqual(doc, code, diff_message(
            "docs/architecture.md's private build_web.py tokens do not match build_web.py:", doc, code))


def _produced_groups() -> set:
    """Every finding group the Python build can emit: the literal group of each
    note() in _alerts() and each _finding() anywhere, the groups of
    AMENITY_DEMANDS, and a group taken from a literal tuple a for loop runs over.
    A group held in any other variable fails, so a new way of naming one is
    noticed here rather than skipped."""
    tree = ast.parse(DASHBOARD)
    groups, unresolved = set(), []
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id == "AMENITY_DEMANDS" for t in node.targets):
            groups |= {v.elts[0].value for v in node.value.values}
    for fn in ast.walk(tree):
        if not isinstance(fn, ast.FunctionDef) or fn.name == "note":
            continue  # note() is _alerts()'s wrapper round _finding(): its group is the caller's
        own = list(_own_nodes(fn))
        loops = [n for n in own if isinstance(n, ast.For)]
        for call in own:
            if not (isinstance(call, ast.Call) and isinstance(call.func, ast.Name)):
                continue
            if call.func.id == "_finding" or (call.func.id == "note" and fn.name == "_alerts"):
                arg = call.args[2] if len(call.args) > 2 else next(
                    (k.value for k in call.keywords if k.arg == "group"), None)
                if isinstance(arg, ast.Constant):
                    groups.add(arg.value)
                elif isinstance(arg, ast.Name) and _from_loop(arg.id, loops, groups):
                    pass
                elif isinstance(arg, ast.Name) and _amenity_unpack(arg.id, own):
                    pass  # `group, text = AMENITY_DEMANDS[slug]`, counted above
                else:
                    unresolved.append(f"{fn.name}: {ast.unparse(call)[:80]}")
    if unresolved:
        raise AssertionError("finding groups this test cannot read:\n  " + "\n  ".join(unresolved))
    return groups


def _from_loop(name: str, loops: list, groups: set) -> bool:
    """Add the values `name` takes in a `for a, name, b in ((...), ...)` loop."""
    for loop in loops:
        if not (isinstance(loop.target, ast.Tuple) and isinstance(loop.iter, (ast.Tuple, ast.List))):
            continue
        names = [t.id if isinstance(t, ast.Name) else None for t in loop.target.elts]
        if name in names:
            i = names.index(name)
            groups |= {row.elts[i].value for row in loop.iter.elts}
            return True
    return False


def _own_nodes(fn: ast.FunctionDef):
    """The nodes of `fn`'s own body, not those of a function nested in it,
    which the outer walk visits as a function of its own."""
    stack = list(fn.body)
    while stack:
        node = stack.pop()
        yield node
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
            stack.extend(ast.iter_child_nodes(node))


def _amenity_unpack(name: str, nodes: list) -> bool:
    """Whether `name` is bound by `name, ... = AMENITY_DEMANDS[...]`."""
    return any(isinstance(n, ast.Assign) and isinstance(n.value, ast.Subscript)
               and isinstance(n.value.value, ast.Name) and n.value.value.id == "AMENITY_DEMANDS"
               and any(isinstance(t, ast.Tuple) and any(isinstance(e, ast.Name) and e.id == name
                                                          for e in t.elts) for t in n.targets)
               for n in nodes)


class FindingGroupTests(unittest.TestCase):
    """(c) Every ALERT_GROUPS kind on the board is a group Python emits, and
    the other way round: a kind with no producer is a switch that does
    nothing, a group with no ALERT_GROUPS row cannot be switched off."""

    @staticmethod
    def board_kinds() -> set:
        table = between(DASHBOARD, "const ALERT_GROUPS = [", "\n];", "ALERT_GROUPS")
        return set(re.findall(r'\{id:"(\w+)"', table))

    def test_every_alert_group_is_a_group_the_findings_emit(self):
        board, python = self.board_kinds(), _produced_groups()
        self.assertTrue(board, "no ids read out of ALERT_GROUPS")
        self.assertEqual(board, python, diff_message(
            "ALERT_GROUPS (the doc side) does not match the groups note()/_finding() emit (the code side):",
            board, python))


if __name__ == "__main__":
    unittest.main()
