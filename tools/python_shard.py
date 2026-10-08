"""Filter ordinary unittest discovery by module, preserving its import names/path.

At the end it prints one "shard-weight python <module> <seconds>" line per
module: the wall time of its own suite, its class and module set-up included
(the last teardown of a module runs as the next module starts).
tools/shard_weights.mjs reads them back from CI logs.
"""
import contextlib
import json
from pathlib import Path
import sys
import time
import unittest


class TimedSuite(unittest.TestSuite):
    """One module's tests; adds the wall time of running them to `seconds`."""

    def __init__(self, module, tests, seconds):
        super().__init__(tests)
        self.module, self.seconds = module, seconds

    def run(self, result, debug=False):
        start = time.perf_counter()
        try:
            return super().run(result, debug)
        finally:
            self.seconds[self.module] = self.seconds.get(self.module, 0) + time.perf_counter() - start


def by_module(tests, seconds):
    """Consecutive tests of one module as one TimedSuite, in discovery order."""
    groups = []
    for test in tests:
        module = test.__class__.__module__
        if not groups or groups[-1][0] != module:
            groups.append((module, []))
        groups[-1][1].append(test)
    return unittest.TestSuite(TimedSuite(module, group, seconds) for module, group in groups)


def cases(suite):
    for test in suite:
        if isinstance(test, unittest.TestSuite):
            yield from cases(test)
        else:
            yield test


def main():
    # A script starts with tools/ on sys.path, whereas python -m unittest starts
    # with the working directory. Match the latter before discovery adds tests/.
    sys.path[0] = str(Path.cwd())
    with contextlib.redirect_stdout(sys.stderr):
        loader = unittest.TestLoader()
        discovered = list(cases(loader.discover('tests')))
    if loader.errors:
        for error in loader.errors:
            print(error, file=sys.stderr)
        return 1
    modules = sorted({test.__class__.__module__ for test in discovered})
    if sys.argv[1:] == ['--list']:
        print(json.dumps(modules))
        return 0
    requested = set(sys.argv[1:])
    missing = requested - set(modules)
    if not requested or missing:
        print(f'Invalid Python shard: empty selection or undiscovered modules: {sorted(missing)}', file=sys.stderr)
        return 1
    seconds = {}
    selected = by_module([test for test in discovered if test.__class__.__module__ in requested], seconds)
    if not selected.countTestCases():
        print('Python shard selected zero tests', file=sys.stderr)
        return 1
    result = unittest.TextTestRunner().run(selected)
    for module, spent in sorted(seconds.items()):
        print(f'shard-weight python {module} {max(spent, 0.1):.1f}', file=sys.stderr)
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    sys.exit(main())
