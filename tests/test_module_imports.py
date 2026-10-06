"""Every test module imports by its package name, as `npm run test:python -- tests.<name>` runs it.

`discover -s tests` puts tests/ on sys.path, so a bare `import es3_fixture` passes
there and fails when unittest is handed `tests.test_company_fixes` (#333). This
imports each `tests.test_*` module in a fresh interpreter whose path holds only
the repository root, the way `python -m unittest tests.<name>` starts.
"""
import json
import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# For each module: import it by package name, then put sys.path back and drop
# any tests/ module loaded under its bare name, so one module's own path insert
# cannot carry the next one. A bare name left behind is reported too: it is a
# second copy of a sibling the module should have imported through `tests.`.
SCRIPT = r"""
import importlib, json, os, sys, traceback
here = os.path.join(os.getcwd(), "tests")
pristine = list(sys.path)
failures = {}
for name in sys.argv[1:]:
    try:
        importlib.import_module("tests." + name)
    except BaseException:
        failures[name] = traceback.format_exc(limit=-3)
    bare = sorted(key for key, mod in list(sys.modules.items())
                  if not key.startswith("tests") and
                  os.path.dirname(os.path.abspath(getattr(mod, "__file__", None) or "")) == here)
    if bare and name not in failures:
        failures[name] = "imported a tests/ module by its bare name: " + ", ".join(bare)
    for key in bare:
        del sys.modules[key]
    sys.path[:] = pristine
print(json.dumps(failures))
"""


class ModuleImportTest(unittest.TestCase):
    def test_every_test_module_imports_by_package_name(self):
        names = sorted(f[:-3] for f in os.listdir(HERE)
                       if f.startswith("test_") and f.endswith(".py"))
        self.assertIn("test_company_fixes", names)
        env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
        run = subprocess.run([sys.executable, "-c", SCRIPT, *names], cwd=ROOT, env=env,
                             capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        failures = json.loads(run.stdout.strip().splitlines()[-1])
        self.assertEqual(failures, {}, "\n\n".join(f"tests.{k}:\n{v}" for k, v in failures.items()))


if __name__ == "__main__":
    unittest.main()
