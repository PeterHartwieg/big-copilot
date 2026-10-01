"""Assert on which message, not on its English (issue #173).

msg() in ba_dashboard.py returns a Msg: the English as a str, plus .key and
.p (params, a nested sentence being another Msg). A test about which sentence
a finding or note says, with which values, names the key and the params, so
rewording the English breaks no test. Mix MsgAsserts into a TestCase:

    self.assertMsg(line["text"], "f.companydemand", n=6)
    note = self.assertHasMsg(fact["text"], "sup.note.raise", to=1280)
    self.assertNoMsg(note["text"], "sup.note.import")
    self.assertWire(row, "text", "f.paused", n=1)   # a payload read back from JSON
    [first, second] = list_items(text.p["demands"])  # the items of a "a, b, c" list

A param given as a str is compared with plain() on both sides, so a game name
reads as its English whether or not it travels as a token; a nested Msg param
is compared by key with msg_param("key", **params), or by its English as a
str. Not a test module: the name keeps it out of discovery.
"""
from ba_dashboard import Msg, plain


class MsgParam:
    """An expected nested message: its key and, optionally, some params."""

    def __init__(self, key, **params):
        self.key, self.params = key, params

    def __repr__(self):
        return f"msg_param({self.key!r}, **{self.params!r})"


def msg_param(key, **params):
    return MsgParam(key, **params)


def msgs(value):
    """value and every Msg nested in its params, depth first."""
    if isinstance(value, Msg):
        yield value
        for v in value.p.values():
            yield from msgs(v)
    elif isinstance(value, (list, tuple)):
        for v in value:
            yield from msgs(v)


def find_msg(value, key):
    """The first Msg with this key at or inside value, or None."""
    return next((m for m in msgs(value) if m.key == key), None)


def list_items(value):
    """The items of a list _msg_list() built ("a, b, c" as nested f.list /
    f.list.last messages), in order; a single item is itself."""
    if isinstance(value, Msg) and value.key in ("f.list", "f.list.last"):
        return [value.p["a"], *list_items(value.p["b"])]
    return [value]


def _param_problem(got, want):
    """Why got does not match want, or None."""
    if isinstance(want, MsgParam):
        if not isinstance(got, Msg):
            return f"{got!r} is not a message"
        if got.key != want.key:
            return f"message {got.key!r}, not {want.key!r}"
        for name, w in want.params.items():
            if name not in got.p:
                return f"{got.key}: no param {name!r}"
            why = _param_problem(got.p[name], w)
            if why:
                return f"{got.key}.{name}: {why}"
        return None
    if isinstance(want, str):
        return None if isinstance(got, str) and plain(str(got)) == plain(want) else f"{got!r} != {want!r}"
    if isinstance(want, (list, tuple)) and isinstance(got, (list, tuple)):
        if len(got) != len(want):
            return f"{got!r} != {want!r}"
        for g, w in zip(got, want):
            why = _param_problem(g, w)
            if why:
                return why
        return None
    return None if got == want else f"{got!r} != {want!r}"


def matches(value, key, params):
    if not isinstance(value, Msg) or value.key != key:
        return False
    return all(name in value.p and _param_problem(value.p[name], w) is None for name, w in params.items())


class MsgAsserts:
    def assertMsg(self, value, key, **params):
        """value is the message key, with (at least) these params."""
        self.assertIsInstance(value, Msg, f"not a message: {value!r}")
        self.assertEqual(value.key, key, f"message {value.key!r}: {value!r}")
        for name, want in params.items():
            self.assertIn(name, value.p, f"{key}: no param {name!r} in {value.p!r}")
            why = _param_problem(value.p[name], want)
            self.assertIsNone(why, f"{key}.{name}: {why}")
        return value

    def assertHasMsg(self, value, key, **params):
        """value, or a message nested in its params, is the key with these params."""
        for m in msgs(value):
            if matches(m, key, params):
                return m
        found = [(m.key, m.p) for m in msgs(value)]
        self.fail(f"no message {key!r} with {params!r} in {found!r}")

    def assertWire(self, row, field, key, **params):
        """For a payload that went through JSON: row["i18n"][field] is
        [key, params] with (at least) these params, compared as sent (a game
        name as its token, a nested message as {"m": [key, params, english]})."""
        wire = (row.get("i18n") or {}).get(field)
        self.assertIsInstance(wire, list, f"{field} carries no i18n wire: {row.get(field)!r}")
        self.assertEqual(wire[0], key, f"{field}: {row.get(field)!r}")
        for name, want in params.items():
            self.assertIn(name, wire[1], f"{key}: no param {name!r} in {wire[1]!r}")
            got = wire[1][name]
            if isinstance(want, MsgParam):
                self.assertEqual((got.get("m") or [None])[0] if isinstance(got, dict) else None, want.key,
                                 f"{key}.{name}: {got!r}")
            elif isinstance(want, str) and isinstance(got, str):
                self.assertEqual(plain(got), plain(want), f"{key}.{name}")
            else:
                self.assertEqual(got, want, f"{key}.{name}")
        return wire

    def assertNoMsg(self, value, key):
        """Neither value nor any message inside it is the key."""
        self.assertIsNone(find_msg(value, key), f"{key!r} is in {value!r}")
