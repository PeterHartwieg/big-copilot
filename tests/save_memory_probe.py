"""Manual synthetic parser RSS probe; never reads a player's save.

python tests/save_memory_probe.py [--baseline origin/main] [--mib 32 128]
Each measurement is a fresh process, excluding fixture construction. MiB is
opaque ASCII string length (the ES3 UTF-16 stream is about twice that size).
Peak RSS is a process high-water mark, not the memory retained by a Save.
"""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tests.es3_fixture import encode

CHILD = r'''
import gc, importlib.util, json, resource, sys, time
sys.path.insert(0, sys.argv[1])
spec = importlib.util.spec_from_file_location("probe_save", sys.argv[2])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
results = []
for _ in range(4):
    gc.collect()
    start = time.perf_counter()
    save = module.load_save(sys.argv[3])
    elapsed = time.perf_counter() - start
    assert len(save.items(save.root["modData"])[0]["$v"]) == int(sys.argv[4])
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    results.append({"seconds": round(elapsed, 4), "peak_rss_mib": round(peak / (2**20 if sys.platform == "darwin" else 1024), 2)})
    del save
print(json.dumps(results))
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', default='origin/main')
    parser.add_argument('--mib', nargs='+', type=int, default=[32, 128])
    args = parser.parse_args()
    baseline = subprocess.check_output(['git', 'show', f'{args.baseline}:ba_save.py'], cwd=ROOT)
    with tempfile.TemporaryDirectory(prefix='copilot-synthetic-memory-') as tmp:
        old = Path(tmp, 'baseline.py')
        old.write_bytes(baseline)
        for mib in args.mib:
            size = mib * 1024 * 1024
            raw = encode({'modData': [{'$k': 'unrecognized.mod', '$v': 'x' * size}]})
            path = Path(tmp, 'synthetic.hsg')
            path.write_bytes(raw)
            for name, source in [('baseline', old), ('bounded', ROOT / 'ba_save.py')]:
                result = subprocess.check_output([sys.executable, '-c', CHILD, str(ROOT), str(source), str(path), str(size)], text=True)
                print(json.dumps({'reader': name, 'opaque_mib': mib, 'compressed_bytes': len(raw), 'runs': json.loads(result)}), flush=True)


if __name__ == '__main__':
    main()
