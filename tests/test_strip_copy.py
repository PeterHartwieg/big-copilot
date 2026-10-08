"""The worker's smaller Python copy keeps the source's executable lines."""
import ast
import io
from pathlib import Path
import tokenize
import traceback
import types
import unittest

import build_web


def docstrings(text):
    for node in ast.walk(ast.parse(text)):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and node.body:
            expr = node.body[0]
            if (isinstance(expr, ast.Expr) and isinstance(expr.value, ast.Constant)
                    and isinstance(expr.value.value, str)):
                yield expr.value.value


def code_objects(code):
    yield code
    for constant in code.co_consts:
        if isinstance(constant, types.CodeType):
            yield from code_objects(constant)


class StripSnippets(unittest.TestCase):
    def assert_copy(self, source, expected):
        stripped = build_web.strip_copy(source)
        self.assertEqual(stripped, expected)
        self.assertEqual(stripped.count("\n"), source.count("\n"))
        self.assertEqual(stripped.endswith("\n"), source.endswith("\n"))
        self.assertEqual(build_web.strip_copy(stripped), stripped)
        for text in (source, stripped):
            compile(text, "m.py", "exec")
        # Every snippet also checks an actual exception's line, including
        # source without a final newline and with differently sized docstrings.
        lines = []
        for text in (source, stripped):
            ns = {}
            exec(compile(text + '\n\ndef explode():\n    raise ValueError("boom")\n', "m.py", "exec"), ns)
            try:
                ns["explode"]()
            except ValueError as exc:
                lines.append(traceback.extract_tb(exc.__traceback__)[-1].lineno)
        self.assertEqual(lines[0], lines[1])
        return stripped

    def test_comments_and_string_hashes(self):
        self.assert_copy(
            '# heading\n  # indented\nx = 1  # trailing\ns = "# string"\n'
            't = """# triple\n# still string"""\nf = f"# {x}" # comment\n\n   \n',
            '\n\nx = 1\ns = "# string"\n'
            't = """# triple\n# still string"""\nf = f"# {x}"\n\n   \n',
        )

    def test_all_docstring_owners_and_later_string_statement(self):
        source = (
            '"""Module\nwords""" # module comment\n'
            'class Example:\n'
            '    r"""Class\n    words"""\n'
            '    def method(self):\n'
            '        "single"; x = 1 # suffix\n'
            '        def nested():\n'
            '            """Nested"""\n'
            '            raise ValueError("boom")\n'
            '        "keep later string #"\n'
            '        return nested()\n'
            'async def task():\n'
            '    "async"\n'
            '    return 2\n'
        )
        expected = (
            '"""\n"""\n'
            'class Example:\n'
            '    """\n"""\n'
            '    def method(self):\n'
            '        """"""; x = 1\n'
            '        def nested():\n'
            '            """"""\n'
            '            raise ValueError("boom")\n'
            '        "keep later string #"\n'
            '        return nested()\n'
            'async def task():\n'
            '    """"""\n'
            '    return 2\n'
        )
        stripped = self.assert_copy(source, expected)
        self.assertEqual(len(list(docstrings(stripped))), 5)
        self.assertTrue(all(not value.strip() for value in docstrings(stripped)))
        raised = []
        for text in (source, stripped):
            ns = {}
            exec(compile(text, "m.py", "exec"), ns)
            try:
                ns["Example"]().method()
            except ValueError as exc:
                raised.append([(frame.name, frame.lineno) for frame in traceback.extract_tb(exc.__traceback__)
                               if frame.filename == "m.py"])
        self.assertEqual(raised[0], raised[1])

    def test_concatenated_docstring_and_suffix(self):
        self.assert_copy(
            'def run():\n    ("first" # between strings\n'
            '     r"second"\n     "third"); x = 1 # after doc\n    return x',
            'def run():\n    """\n\n"""; x = 1\n    return x',
        )

    def test_utf8_columns_and_docstring_contents(self):
        self.assert_copy(
            'def café(): "é 😀 文"; x = "keep é #" # comment\n'
            'class Ω: r"""é\n文 😀"""; y = 2\n',
            'def café(): """"""; x = "keep é #"\n'
            'class Ω: """\n"""; y = 2\n',
        )

    def test_single_quotes_and_empty_input(self):
        self.assert_copy("'module'; x = '# kept'", '""""""; x = \'# kept\'')
        self.assert_copy("", "")


class StripDashboard(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = Path(__file__).resolve().parents[1] / "ba_dashboard.py"
        cls.source = build_web.read_text(str(source))
        cls.stripped = build_web.strip_copy(cls.source)
        cls.original_code = compile(cls.source, "ba_dashboard.py", "exec")
        cls.stripped_code = compile(cls.stripped, "ba_dashboard.py", "exec")

    def test_lines_and_size(self):
        self.assertEqual(self.source.count("\n"), self.stripped.count("\n"))
        self.assertEqual(self.source.endswith("\n"), self.stripped.endswith("\n"))
        self.assertLess(len(self.stripped.encode("utf-8")), len(self.source.encode("utf-8")) * 0.8)

    def test_no_comments_and_only_empty_docstrings(self):
        self.assertFalse(any(token.type == tokenize.COMMENT for token in
                             tokenize.generate_tokens(io.StringIO(self.stripped).readline)))
        original = list(docstrings(self.source))
        stripped = list(docstrings(self.stripped))
        self.assertTrue(original)
        self.assertEqual(len(original), len(stripped))
        self.assertTrue(all(not value.strip() for value in stripped))

    def test_idempotent(self):
        self.assertEqual(build_web.strip_copy(self.stripped), self.stripped)

    def test_every_code_object_keeps_source_lines(self):
        original = list(code_objects(self.original_code))
        stripped = list(code_objects(self.stripped_code))
        self.assertEqual(len(original), len(stripped))
        for before, after in zip(original, stripped):
            with self.subTest(name=before.co_name, line=before.co_firstlineno):
                self.assertEqual(before.co_name, after.co_name)
                self.assertEqual(before.co_firstlineno, after.co_firstlineno)
                self.assertEqual([line for _, _, line in before.co_lines()],
                                 [line for _, _, line in after.co_lines()])


if __name__ == "__main__":
    unittest.main()
