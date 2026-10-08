"""Filter ordinary unittest discovery by module, preserving its import names/path.

At the end it prints one "shard-weight python <module> <seconds>" line per
module (wall time from its first test to the next module's, class and module
fixtures included); tools/shard_weights.mjs reads them back from CI logs.
"""
import contextlib
import json
from pathlib import Path
import sys
import time
import unittest


class TimedResult(unittest.TextTestResult):
    """Records when each module's first test starts; tests run grouped by module."""
    starts = []

    def startTest(self, test):
        module = test.__class__.__module__
        if not self.starts or self.starts[-1][0] != module:
            self.starts.append((module, time.perf_counter()))
        super().startTest(test)


def module_seconds(starts, end):
    seconds = {}
    for i, (module, start) in enumerate(starts):
        stop = starts[i + 1][1] if i + 1 < len(starts) else end
        seconds[module] = seconds.get(module, 0) + stop - start
    return seconds


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
    selected = unittest.TestSuite(test for test in discovered if test.__class__.__module__ in requested)
    if not selected.countTestCases():
        print('Python shard selected zero tests', file=sys.stderr)
        return 1
    result = unittest.TextTestRunner(resultclass=TimedResult).run(selected)
    for module, seconds in sorted(module_seconds(TimedResult.starts, time.perf_counter()).items()):
        print(f'shard-weight python {module} {max(seconds, 0.1):.1f}', file=sys.stderr)
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    sys.exit(main())
