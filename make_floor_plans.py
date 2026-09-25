"""Draw the finder's floor plans out of the game's own building shells.

    py -m pip install --target <scratch folder outside this repo> UnityPy
    set PYTHONPATH=<that folder>
    python make_floor_plans.py

Writes web/maps/floor-plans.json, which the Map page's finder fetches the first
time it shows a plan. Like ba_demand_curves.json, the result is committed and
the site ships it: UnityPy (with Pillow, which it installs) and the installed
game are owner-side only, and nothing ba_dashboard.py imports needs either.

Which plans: one for each layout that ba_buildings.json gives a retail, office
or warehouse building (FLOOR_PLAN_KINDS in ba_dashboard.py). A layout is size
code plus version ("C2"); the game picks the interior by exactly that pair, so
an office C2 and a shop C2 share one plan. Run make_buildings.py --versions
first when the table has no versions yet.

Where the shells are: every layout is its own Addressables bundle,

    <game>/Big Ambitions_Data/StreamingAssets/aa/StandaloneWindows64/
        buildingstructures_assets_assets/prefabs/buildingstructures/<x>/
            buildingstructure<size><version>.prefab_<hash>.bundle

with its meshes in the art bundles beside it. The prefab is modular: floor
tiles, wall, facade and partition modules, doors, windows. This script walks
the prefab's transform tree, bakes each mesh into place and draws the triangles
from above at 24 px a metre, one flat class a mesh: floor, wall, window, door,
or bay. The drawing is then merged into one SVG path of rectangles per class,
so the page paints the plan in the board's own colours in either theme.

- A door is the wall module with the opening. The door leaves themselves (the
  panels, drawn standing open) are left out: they are the door meshes lower
  than DOOR_LEAF_TOP.
- A bay is where a warehouse's vehicles stand: a hole with no floor tile inside
  the outline, or the sunken loading dock ("Negative Space Loading Dock").
- doors counts the door pieces on the outside wall: a shop's or an office's
  entrances. bays counts the bays.

The plans are in the prefab's own frame (+X right, +Z up), not turned to the
street; the page shows them as stored.

The written shape, kept short:

    {"schema": 1, "px": 24,
     "kinds": {"retail": ["A1", ...], "office": [...], "warehouse": [...]},
     "plans": {"C2": {"w": px, "h": px, "doors": 1, "bays": 0,
                      "paths": {"f": "M0 0h..", "b": .., "w": .., "n": .., "d": ..}}}}

w and h include half a metre of margin all round. Path classes: f floor (the
whole inside), b bay, w wall, n window, d door; later classes paint over
earlier ones, in that order.
"""

from __future__ import annotations

import glob
import json
import os
import re
import sys
from collections import deque

try:  # owner-side only: the board never imports this module
    import UnityPy
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover - depends on the operator's machine
    raise SystemExit(
        "UnityPy is not installed. It is an owner-side dependency, like the one "
        "make_demand_curves.py needs, and must not reach the board's requirements:\n"
        "  py -m pip install --target <scratch folder outside this repo> UnityPy\n"
        "then put that folder on PYTHONPATH and run this again."
    )

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "web", "maps", "floor-plans.json")
PX = 24  # pixels a metre
MARGIN = 0.5  # metres of margin round the outline
DOOR_LEAF_TOP = 2.8  # metres: a door mesh lower than this is a leaf, not the opening
# Kept in step with FLOOR_PLAN_KINDS in ba_dashboard.py (a test checks).
KINDS = ("retail", "office", "warehouse")

# class ids in the drawing, in paint order; 0 is nothing drawn
FLOOR, BAY, WALL, WINDOW, DOOR = 1, 2, 3, 4, 5
PATH_CLASS = {FLOOR: "f", BAY: "b", WALL: "w", WINDOW: "n", DOOR: "d"}


def _structures_dir() -> str:
    sys.path.insert(0, HERE)
    from make_demand_curves import BUNDLE_DIR, _game_root

    return os.path.join(_game_root(), BUNDLE_DIR)


# --------------------------------------------------------------------------
# the prefab: transforms baked into world triangles
# --------------------------------------------------------------------------
def _qmat(q):
    x, y, z, w = q.x, q.y, q.z, q.w
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]


def _local(t):
    r, s, p = _qmat(t.m_LocalRotation), t.m_LocalScale, t.m_LocalPosition
    return [[r[i][0] * s.x, r[i][1] * s.y, r[i][2] * s.z, (p.x, p.y, p.z)[i]] for i in range(3)] + [[0, 0, 0, 1]]


def _mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def _apply(m, v):
    return tuple(m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2] + m[i][3] for i in range(3))


def _mesh(mesh, cache):
    key = (mesh.assets_file.name, mesh.object_reader.path_id)
    if key not in cache:
        verts, faces = [], []
        for line in mesh.export().splitlines():
            if line.startswith("v "):
                _, x, y, z = line.split()[:4]
                verts.append((-float(x), float(y), float(z)))  # the OBJ export mirrors X
            elif line.startswith("f "):
                faces.append(tuple(int(p.split("/")[0]) - 1 for p in line.split()[1:4]))
        cache[key] = (verts, faces)
    return cache[key]


def _category(path: str) -> str | None:
    """What a mesh is, from its place in the prefab's tree."""
    p = path.lower()
    if any(k in p for k in ("roof", "groundplane", "groundgrid", "exitzone", "reflection",
                            "navmesh", "thumbnail", "previewcamera", "decal",
                            "deliveryspot", "handtruck")):
        return None
    if "loading dock" in p:
        return "bay"
    if "door" in p or "entrance" in p:
        return "door"
    if "window" in p or "glass" in p:
        return "window"
    if "floor" in p:
        return "floor"
    if any(k in p for k in ("wall", "perimeter", "partition", "facade", "corner", "inside")):
        return "wall"
    return None  # anything unnamed is left out rather than guessed at


def triangles(env, name: str) -> dict:
    """{category: [triangle in world metres]} for one BuildingStructure prefab."""
    transforms = [o.read() for o in env.objects if o.type.name == "Transform"]
    roots = [t for t in transforms if (not t.m_Father or t.m_Father.path_id == 0)
             and t.m_GameObject.read().m_Name.lower() == "buildingstructure" + name.lower()]
    if not roots:
        raise SystemExit(f"no BuildingStructure{name} prefab in its bundle")
    out, cache = {}, {}

    def walk(t, parent, path):
        go = t.m_GameObject.read()
        if not go.m_IsActive:
            return
        path = f"{path}/{go.m_Name}"
        world = _mul(parent, _local(t))
        cat = _category(path)
        if cat:
            for c in go.m_Component:
                ptr = c.component if hasattr(c, "component") else c.second
                if ptr.type.name != "MeshFilter":
                    continue
                try:
                    mesh = ptr.read().m_Mesh.read()
                except Exception:  # a Unity built-in (decal quad, ground plane): not ours
                    continue
                verts, faces = _mesh(mesh, cache)
                placed = [_apply(world, v) for v in verts]
                if cat == "door" and placed and max(v[1] for v in placed) < DOOR_LEAF_TOP:
                    continue  # a door leaf, drawn standing open: the opening is enough
                out.setdefault(cat, []).extend((placed[a], placed[b], placed[c]) for a, b, c in faces)
        for child in t.m_Children:
            walk(child.read(), world, path)

    identity = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
    for root in roots:
        # The game replaces the root's own transform with the building's; keep identity.
        for child in root.m_Children:
            walk(child.read(), identity, root.m_GameObject.read().m_Name)
    return out


# --------------------------------------------------------------------------
# the drawing: one class a pixel, then rectangles
# --------------------------------------------------------------------------
def draw(tris: dict) -> tuple[list[bytearray], int, int]:
    """The plan from above as rows of class ids, PX pixels a metre."""
    outline = [p for cat in ("floor", "wall") for tri in tris.get(cat, []) for p in tri]
    if not outline:
        raise SystemExit("a layout with no floor and no walls")
    x0 = min(p[0] for p in outline) - MARGIN
    x1 = max(p[0] for p in outline) + MARGIN
    z0 = min(p[2] for p in outline) - MARGIN
    z1 = max(p[2] for p in outline) + MARGIN
    w, h = round((x1 - x0) * PX), round((z1 - z0) * PX)
    img = Image.new("L", (w, h), 0)
    pen = ImageDraw.Draw(img)
    for cat, cls in (("floor", FLOOR), ("bay", BAY), ("wall", WALL), ("window", WINDOW), ("door", DOOR)):
        for tri in tris.get(cat, []):
            if cat == "floor" and max(p[1] for p in tri) > 0.5:
                continue  # a raised tile (a stair, a stage), not the floor
            pen.polygon([((p[0] - x0) * PX, (z1 - p[2]) * PX) for p in tri], fill=cls)
    raw = img.tobytes()
    return [bytearray(raw[y * w:(y + 1) * w]) for y in range(h)], w, h


def components(mask: list[bytearray], w: int, h: int) -> list[list[tuple[int, int]]]:
    seen = [bytearray(w) for _ in range(h)]
    found = []
    for y in range(h):
        for x in range(w):
            if mask[y][x] and not seen[y][x]:
                queue, pts = deque([(x, y)]), []
                seen[y][x] = 1
                while queue:
                    cx, cy = queue.popleft()
                    pts.append((cx, cy))
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = 1
                            queue.append((nx, ny))
                found.append(pts)
    return found


def rect_path(mask: list[bytearray], w: int, h: int) -> str:
    """A mask as one path: runs a row, each extended down while it repeats."""
    rects, live = [], {}
    for y in range(h + 1):
        runs = set()
        if y < h:
            row, x = mask[y], 0
            while x < w:
                if row[x]:
                    start = x
                    while x < w and row[x]:
                        x += 1
                    runs.add((start, x))
                else:
                    x += 1
        kept = {}
        for run, top in live.items():
            if run in runs:
                kept[run] = top
            else:
                rects.append((run[0], top, run[1] - run[0], y - top))
        for run in runs:
            kept.setdefault(run, y)
        live = kept
    rects.sort(key=lambda r: (r[1], r[0]))
    return "".join(f"M{x} {y}h{rw}v{rh}h-{rw}z" for x, y, rw, rh in rects)


def plan(tris: dict) -> dict:
    grid, w, h = draw(tris)
    empty = [bytearray(1 if v == 0 else 0 for v in row) for row in grid]
    masks = {cls: [bytearray(1 if v == cls else 0 for v in row) for row in grid] for cls in PATH_CLASS}
    # Floor is the whole inside; every other class paints over it.
    masks[FLOOR] = [bytearray(1 if v else 0 for v in row) for row in grid]
    # A hole with no floor that never reaches the edge, bigger than a door gap,
    # is where a vehicle stands.
    holes = [c for c in components(empty, w, h)
             if len(c) > PX * PX and all(0 < x < w - 1 and 0 < y < h - 1 for x, y in c)]
    for c in holes:
        for x, y in c:
            masks[BAY][y][x] = 1
    docks = [c for c in components([bytearray(1 if v == BAY else 0 for v in row) for row in grid], w, h)
             if len(c) > PX * PX]

    def outside(pts):
        for x, y in pts:
            for dx in range(-3, 4):
                for dy in range(-3, 4):
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < w and 0 <= ny < h) or empty[ny][nx]:
                        return True
        return False

    doors = [c for c in components(masks[DOOR], w, h) if len(c) > 20 and outside(c)]
    paths = {}
    for cls, key in PATH_CLASS.items():
        d = rect_path(masks[cls], w, h)
        if d:
            paths[key] = d
    return {"w": w, "h": h, "doors": len(doors), "bays": len(holes) + len(docks), "paths": paths}


# --------------------------------------------------------------------------
def layouts_by_kind() -> dict:
    """The layouts ba_buildings.json gives each kind, in size then version order."""
    with open(os.path.join(HERE, "ba_buildings.json"), encoding="utf-8") as fh:
        rows = json.load(fh)
    kinds = {kind: set() for kind in KINDS}
    for r in rows:
        if r["t"] in kinds and r.get("v") is not None:
            kinds[r["t"]].add((r["z"], int(r["v"])))
    if not any(kinds.values()):
        raise SystemExit("ba_buildings.json has no versions; run make_buildings.py --versions first")
    return {kind: [f"{z}{v}" for z, v in sorted(found)] for kind, found in kinds.items()}


def main() -> None:
    kinds = layouts_by_kind()
    wanted = sorted({code for codes in kinds.values() for code in codes})
    base = os.path.join(_structures_dir(), "buildingstructures_assets_assets")
    art = glob.glob(os.path.join(base, "art", "**", "*.bundle"), recursive=True)
    shared = glob.glob(os.path.join(os.path.dirname(base), "shared*.bundle"))
    bundles = {}
    for path in glob.glob(os.path.join(base, "prefabs", "buildingstructures", "*", "buildingstructure*.prefab_*.bundle")):
        found = re.search(r"buildingstructure(\w+?)\.prefab", os.path.basename(path))
        if found:
            bundles[found.group(1).upper()] = path
    plans = {}
    for code in wanted:
        if code not in bundles:
            raise SystemExit(f"no building structure bundle for layout {code} under {base}")
        env = UnityPy.load(bundles[code], *art, *shared)
        plans[code] = plan(triangles(env, code))
        p = plans[code]
        print(f"{code}: {p['w'] / PX:.1f} x {p['h'] / PX:.1f} m, {p['doors']} doors, {p['bays']} bays, "
              f"{sum(len(v) for v in p['paths'].values()) // 1024} KB")
    out = {"schema": 1, "px": PX, "kinds": kinds, "plans": plans}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline=chr(10)) as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"web/maps/floor-plans.json: {len(plans)} plans, {os.path.getsize(OUT) // 1024} KB")


if __name__ == "__main__":
    main()
