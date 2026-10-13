"""Run one script under several hash seeds.

Set iteration order follows PYTHONHASHSEED, which is fixed for a process, so a
test that holds a payload to one order has to compare fresh interpreters.
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def under_seeds(script, seeds=("0", "12345"), unset=()):
    """What `python -c script` prints under each seed, in the order of `seeds`.

    The script runs from the repository root, so it imports `ba_dashboard` and
    test modules through `tests.`. Environment variables named in `unset` are
    left out. A script that fails raises with its stderr.
    """
    env = {key: value for key, value in os.environ.items() if key not in unset}
    printed = []
    for seed in seeds:
        env["PYTHONHASHSEED"] = seed
        run = subprocess.run([sys.executable, "-c", script], cwd=ROOT, env=env,
                             capture_output=True, text=True)
        if run.returncode:
            raise AssertionError(f"PYTHONHASHSEED={seed} failed:\n{run.stderr}")
        printed.append(run.stdout)
    return printed
