"""Compare RECIPE_ITEMS with the installed game's factory recipe assets.

    python tools/game_update/recipes.py

Owner-only: install UnityPy outside the repository and put it on PYTHONPATH,
as described in docs/game-update.md. Reads the game found through BA_LOCALE or
the usual Steam locations. Prints the bundle fingerprint and every difference;
exits non-zero on a difference or an incomplete read. Nothing is written.
"""
from __future__ import annotations

import hashlib
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from ba_dashboard import RECIPE_ITEMS  # noqa: E402
from ba_save import bundled_locale, find_game_locale  # noqa: E402


def recipe_bundle() -> Path:
    locale = find_game_locale()
    if not locale or bundled_locale(locale):
        raise ValueError("game not found: set BA_LOCALE to the install's "
                         "StreamingAssets/locale/en.json")
    # Resolve from the locale, so macOS's app layout and Windows both work.
    aa = Path(locale).resolve().parent.parent / "aa"
    bundles = sorted(aa.glob("*/defaultlocalgroup_assets_factories/recipes_*.bundle"))
    if len(bundles) != 1:
        found = "\n".join(str(path) for path in bundles) or "none"
        raise ValueError(f"expected one factory recipes bundle under {aa}, "
                         f"found {len(bundles)}:\n{found}\n"
                         "Check the installation and bundle layout; do not guess between copies.")
    return bundles[0]


def read_recipes(data: bytes) -> dict[str, str]:
    try:
        import UnityPy
        from UnityPy.classes.PPtr import PPtr
    except ImportError as exc:
        raise ValueError("UnityPy is required: install it in a scratch folder outside "
                         "the repo and add that folder to PYTHONPATH; "
                         "see docs/game-update.md") from exc

    recipes = {}
    for obj in UnityPy.load(data).objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            tree = obj.read_typetree()
            # Resolve the pointer in this object's serialized file, not a global
            # path-id set: different files can reuse the same path id.
            pointer = tree["m_Script"]
            script_obj = PPtr(m_FileID=pointer["m_FileID"],
                              m_PathID=pointer["m_PathID"],
                              assetsfile=obj.assets_file).deref()
            if script_obj.type.name != "MonoScript":
                raise ValueError("m_Script does not point to a MonoScript")
            script = script_obj.read_typetree()
            if (script.get("m_ClassName"), script.get("m_Namespace"),
                    script.get("m_AssemblyName")) != (
                    "Recipe", "BigAmbitions.Factories.Recipes", "BigAmbitions.Factories"):
                raise ValueError("unexpected script in factory recipes bundle")
            recipe_id = tree.get("id")
            output = tree.get("output")
            item = output.get("item") if isinstance(output, dict) else None
            if not isinstance(recipe_id, str) or not recipe_id or recipe_id != recipe_id.strip():
                raise ValueError("missing or malformed recipe id")
            if not isinstance(item, str) or not re.fullmatch(r"ba:itemname_[a-z0-9_]+", item):
                raise ValueError("missing or malformed output.item")
            if recipe_id in recipes:
                raise ValueError(f"duplicate recipe id {recipe_id!r}")
            # machineVisuals[].outputItemName includes intermediate products;
            # only the recipe's top-level output establishes its identity.
            recipes[recipe_id] = item
        except Exception as exc:
            raise ValueError(f"cannot verify object {obj.path_id}: {exc}") from exc
    if not recipes:
        raise ValueError("no Recipe assets read; refusing an empty comparison")
    return recipes


def main() -> int:
    try:
        bundle = recipe_bundle()
        data = bundle.read_bytes()
        print(f"Bundle: {bundle}")
        print(f"SHA-256: {hashlib.sha256(data).hexdigest()}")
        recipes = read_recipes(data)
    except Exception as exc:
        print(f"Recipe check failed: {exc}", file=sys.stderr)
        return 1

    differences = 0
    for recipe_id in sorted(recipes.keys() | RECIPE_ITEMS.keys()):
        game, board = recipes.get(recipe_id), RECIPE_ITEMS.get(recipe_id)
        if game != board:
            differences += 1
            print(f"RECIPE_ITEMS {recipe_id}: game={game!r}, board={board!r}")
    print(f"{len(recipes)} recipe identities read; {differences} difference(s)")
    return int(differences != 0)


if __name__ == "__main__":
    sys.exit(main())
