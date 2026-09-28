import sys, os, json, glob
sys.dont_write_bytecode = True
sys.path.insert(0, r'C:/Users/Peter/Coding_Projects/big-copilot-break-even-core')
import ba_dashboard as bd
from ba_save import load_save, newest_save, load_locale
names = bd.Names(load_locale())
ROOT = os.path.expandvars(r"%USERPROFILE%\AppData\LocalLow\Hovgaard Games\Big Ambitions\SaveGames\Big Ambitions")
for folder in sorted(glob.glob(ROOT + "/*/")):
    try:
        s = load_save(newest_save(folder))
    except Exception:
        continue
    if (s.root.get('buildNumberAtLastSave') or 0) < 3540: continue
    cid = os.path.basename(os.path.normpath(folder))[:8]
    p = bd.extract(s, names, None)
    out = {k: p[k] for k in ('openStore', 'businesses', 'premises', 'meta', 'names')}
    json.dump(out, open(f'{cid}.json', 'w'), separators=(',', ':'))
    print(cid, len(p['openStore'].get('own', {})), sum(len(v) for v in p['openStore'].get('own', {}).values()))
