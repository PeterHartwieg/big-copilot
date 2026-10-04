"""Reproducible warm synthetic profiling; also runs on the pre-index baseline.

    python tools/profile_store_planner.py --iterations 10

Uses no installed game, owner save or output payload file. cProfile timings
include profiling overhead; unprofiled wall time is reported separately.
"""
import argparse
import cProfile
import json
from pathlib import Path
import pstats
import sys
import tempfile
import time



def measure(fn, iterations):
    fn()  # warm lazy catalogue files, as in the original audit
    start = time.perf_counter()
    for _ in range(iterations):
        fn()
    wall = time.perf_counter() - start
    profile = cProfile.Profile()
    profile.enable()
    for _ in range(iterations):
        fn()
    profile.disable()
    stats = pstats.Stats(profile).stats
    functions = {}
    for name in ('extract', '_open_store', 'outfit_lines', 'flags', 'sold', 'mounts', 'unit_cost', 'works_in'):
        rows = [row for (_file, _line, function), row in stats.items() if function == name]
        functions[name] = {'calls': sum(r[1] for r in rows),
                           'cumulative_seconds': round(sum(r[3] for r in rows), 6)}
    return {'iterations': iterations, 'wall_seconds': round(wall, 6), 'functions': functions}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--iterations', type=int, default=10)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1],
                        help='Checkout to profile (including an unchanged baseline)')
    args = parser.parse_args()
    sys.path.insert(0, str(args.root.resolve()))
    global board
    import ba_dashboard as board
    from ba_save import Names, load_save
    from tests.es3_fixture import write_link_save
    if args.iterations <= 0:
        parser.error('--iterations must be positive')
    with tempfile.TemporaryDirectory() as tmp:
        path = str(Path(tmp) / 'synthetic.hsg')
        write_link_save(path)
        save, names = load_save(path), Names({})
        build = board.build_core(save, names, None)
        board.section(build, 'premises')
        result = {
            'fixture': 'tests.es3_fixture.link_company',
            'python': sys.version.split()[0],
            'extract': measure(lambda: board.extract(save, names, None), args.iterations),
            '_open_store': measure(lambda: board._open_store_section(build), args.iterations),
        }
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
