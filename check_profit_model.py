"""Check Open a store's profit model against the player's own shops, on every save here.

    python check_profit_model.py                     # the newest save of each character
    python check_profit_model.py "path\\to\\folder"    # a different save root to walk
    python check_profit_model.py -v                  # also list every shop, worst first

For each character's newest save at or above MIN_BUILD, extract() builds the payload
and the board's own model (the "Expansion › Open a store" section of the board
script in ba_dashboard.py, run in Node) prices each of the player's trading shops
and offices on its own building, hours, promotion and satisfaction. The ratio is
what the shop really earned a day over its last finished days
(_own_shops(), goods at import prices) against what the rules give it. Above 1
means the model under-predicts. docs/open-a-store-scope.md, "Expected profit", has
the numbers this is held to; the range the board shows is the p25 to p90.

Nothing is written but a scratch folder under the system temp directory, which is
removed afterwards; no save or payload is kept. Needs `node` on PATH.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile

from ba_save import load_locale, load_save, newest_save
from ba_dashboard import MIN_BUILD, OWN_PROFIT_DAYS, Names, extract
from check_saves import SAVE_ROOT

HERE = os.path.dirname(os.path.abspath(__file__))
START = "/* --- Expansion › Open a store ---"
END = "/* --- plan a chain ---"

# Runs the board's model over one payload per argument and prints one JSON
# row per shop. The board's helpers the model touches are stubbed.
RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const code = fs.readFileSync(process.argv[2], 'utf8');
const rows = [];
for(const file of process.argv.slice(3)){
  const P = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ctx = {D: P, gameName: k => (P.names || {})[k] || '', icon: () => '', prettySlug: s => s, paybackMode: () => 'firm',
    premises: () => P.premises, localStorage: {getItem(){ return null; }, setItem(){}}, tt: (k, en) => typeof en === 'string' ? en : '',
    once: f => f, Map, Math, JSON, Number, Array, String, Object, Set, console};
  vm.createContext(ctx);
  vm.runInContext(code + '\n;this.osOwnRatio = osOwnRatio;', ctx);
  for(const slug of Object.keys((P.openStore || {}).own || {})){
    const r = ctx.osOwnRatio(slug);
    if(!r) continue;
    const model = ((P.openStore.types || {})[slug] || {}).model;
    r.rows.forEach(x => rows.push({save: P.who, modded: P.modded, type: slug.replace('ba:businesstype_', ''), model, key: x.key,
      actual: x.actual, predicted: x.model, ratio: x.ratio, days: x.days}));
  }
}
console.log(JSON.stringify(rows));
"""


# Mods that change the camera, the interface or placement, add a job or an
# objective (the HART ones are the owner's), or only read the game (Big
# Copilot Link): none of them touches what a shop earns. Checked by name on 29
# Sep 2026; a mod not listed here counts as one that might.
HARMLESS_MODS = ("Big Copilot Link", "BigCopilotLink", "Camera Tools", "HART Free Camera", "Campaign Objectives",
                 "HARTDeliveryDrive", "HARTCampaign", "Immersion - RPG Camera", "Continuous Placement", "BrandSystem")


def modded(save, path: str) -> bool:
    """Whether a mod that could change what shops earn ran on this save: one
    active at the last save (the .hsg.meta's activeModsAtLastSave) that is
    not in HARMLESS_MODS. The save's own hasEverUsedMods is not the test: Big
    Copilot Link alone sets it, as it does on nearly every save that links."""
    try:
        with open(path + ".meta", encoding="utf-8-sig") as fh:
            active = json.load(fh).get("activeModsAtLastSave") or []
    except (OSError, ValueError):
        active = []
    words = [f"{m.get('modDisplayName') or ''} {m.get('modId') or ''}" for m in active]
    return any(not any(h in w for h in HARMLESS_MODS) for w in words)


def board_model() -> str:
    """The Open a store section of the board script, as the page runs it."""
    with open(os.path.join(HERE, "ba_dashboard.py"), encoding="utf-8") as fh:
        text = fh.read()
    start = text.index(START)
    return text[start:text.index(END, start)]


def stats(values: list) -> dict:
    v = sorted(values)
    n = len(v)
    at = lambda p: v[min(n - 1, int(p * n))]  # noqa: E731
    mid = v[(n - 1) // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2
    within = lambda w: round(100 * sum(1 for x in v if 1 - w <= x <= 1 + w) / n)  # noqa: E731
    return {"n": n, "median": round(mid, 3), "p10": round(at(.1), 2), "p25": round(at(.25), 2),
            "p75": round(at(.75), 2), "p90": round(at(.9), 2), "within15": within(.15), "within30": within(.3)}


def line(label: str, values: list) -> str:
    if not values:
        return f"{label:<26} n   0"
    s = stats(values)
    return (f"{label:<26} n {s['n']:>3}  median {s['median']:.3f}  p10 {s['p10']:.2f}  p25 {s['p25']:.2f}  "
            f"p75 {s['p75']:.2f}  p90 {s['p90']:.2f}  within 15% {s['within15']}%  within 30% {s['within30']}%")


def collect(root: str) -> tuple[int, list]:
    """(saves read, one row per shop and office the model priced)."""
    names = Names(load_locale())
    scratch = tempfile.mkdtemp(prefix="profit_model_")
    try:
        files = []
        for folder in sorted(os.scandir(root), key=lambda e: e.name):
            if not folder.is_dir():
                continue
            try:
                path = newest_save(folder.path)
                save = load_save(path)
            except Exception:  # noqa: BLE001 -- a folder with no readable save is skipped
                continue
            if (save.root.get("buildNumberAtLastSave") or 0) < MIN_BUILD:
                continue
            payload = extract(save, names, None)
            out = {k: payload.get(k) for k in ("openStore", "businesses", "premises", "meta", "names")}
            out["who"] = folder.name[:8]
            out["modded"] = modded(save, path)
            file = os.path.join(scratch, f"{len(files)}.json")
            with open(file, "w", encoding="utf-8") as fh:
                json.dump(out, fh, separators=(",", ":"))
            files.append(file)
        if not files:
            return 0, []
        model = os.path.join(scratch, "model.js")
        with open(model, "w", encoding="utf-8") as fh:
            fh.write(board_model())
        runner = os.path.join(scratch, "run.cjs")
        with open(runner, "w", encoding="utf-8") as fh:
            fh.write(RUNNER)
        done = subprocess.run(["node", runner, model, *files], capture_output=True, text=True, encoding="utf-8")
        if done.returncode:
            raise SystemExit(done.stderr)
        return len(files), json.loads(done.stdout)
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


def main(argv: list) -> int:
    verbose = "-v" in argv
    args = [a for a in argv if a != "-v"]
    root = args[0] if args else SAVE_ROOT
    saves, rows = collect(root)
    if not saves:
        print("no save at or above MIN_BUILD under", root)
        return 1
    paid = [r for r in rows if r["actual"] > 0]
    shops = [r for r in paid if r["model"] == "retail"]
    offices = [r for r in paid if r["model"] == "office"]
    settled = lambda r: r["days"] >= OWN_PROFIT_DAYS  # noqa: E731 -- open long enough for a full window
    print(f"{saves} saves, {len(rows)} shops and offices, {len(rows) - len(paid)} with no profit left out")
    print(f"headline: unmodded saves, open {OWN_PROFIT_DAYS} days or more")
    for label, group in (("shops", shops), ("offices", offices)):
        if group:
            print(line(label, [r["ratio"] for r in group if not r["modded"] and settled(r)]))
    print("the rest")
    for label, pick in (("shops, saves with gameplay mods", lambda r: r["modded"] and settled(r)),
                        (f"shops, open < {OWN_PROFIT_DAYS} days (held to the ramp)", lambda r: not settled(r)),
                        ("shops, all", lambda r: True)):
        group = [r["ratio"] for r in shops if pick(r)]
        if group:
            print(line(label, group))
    for kind in sorted({r["type"] for r in paid}):
        print(line("  " + kind, [r["ratio"] for r in paid if r["type"] == kind]))
    for who in sorted({r["save"] for r in paid}):
        mod = next(r["modded"] for r in paid if r["save"] == who)
        print(line(f"  save {who}{' (modded)' if mod else ''}", [r["ratio"] for r in paid if r["save"] == who]))
    if verbose:
        for r in sorted(paid, key=lambda r: r["ratio"]):
            print(f"{r['save']} {r['type']:<22} {r['key']:<34} {r['actual']:>9.0f} {r['predicted']:>9.0f} {r['ratio']:.2f} {r['days']:>2}d")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
