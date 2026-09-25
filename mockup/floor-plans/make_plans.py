"""Turns the rendered floor plans in plans/*.png into plans.json: one small vector plan a layout.

The PNGs come from research/floor-plans/render_plans.py in the main checkout (the game's own
BuildingStructure prefabs, drawn top-down at 24 px a metre, flat colours, no anti-aliasing).
Every colour is a class, so each class becomes one SVG path of merged rectangles, and the
canvas can paint the plan in the board's own tokens in either theme. The same step is what
the port would run at build time (NOTES.md, "Porting").

Per layout it also counts what the canvas shows beside the plan:
- doors: door-coloured pieces that touch the outside (an entrance, or a warehouse's loading
  door). Doors between rooms do not count.
- bays: floorless holes inside the outline plus the unclassified blocks the renderer drew
  grey. Both sit where a warehouse's vehicles would stand; that reading is unverified.

Run: python make_plans.py (a few seconds a layout; pure Python, no numpy).
"""
from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
PX = 24  # pixels a metre in the source PNGs
# source colour -> class: f floor, w wall, n window, d door, o unclassified block
COL = {(236, 232, 222): "f", (60, 60, 66): "w", (120, 170, 210): "n", (205, 120, 60): "d", (170, 160, 150): "o"}

# the finder's 24 layouts: (kind, layout); office C1/C2/D2 share retail's structures
FINDER = {
    "retail": ["A1", "A2", "C1", "C2", "D2", "M1"],
    "office": ["A3", "C1", "C2", "D2", "J1", "K1"],
    "warehouse": ["H1", "H2", "H3", "I1", "I2", "I3", "P1", "P2", "P3", "Q1", "Q2", "Q3"],
}


def rect_path(mask: list[bytearray], w: int, h: int) -> tuple[str, int]:
    """Merge a boolean mask into rectangles: runs a row, extended down while identical."""
    out, live = [], {}
    for y in range(h + 1):
        runs = set()
        if y < h:
            row, x = mask[y], 0
            while x < w:
                if row[x]:
                    x0 = x
                    while x < w and row[x]:
                        x += 1
                    runs.add((x0, x))
                else:
                    x += 1
        nxt = {}
        for r, y0 in live.items():
            if r in runs:
                nxt[r] = y0
            else:
                out.append((r[0], y0, r[1] - r[0], y - y0))
        for r in runs:
            nxt.setdefault(r, y)
        live = nxt
    out.sort(key=lambda r: (r[1], r[0]))
    return "".join(f"M{x} {y}h{rw}v{rh}h-{rw}z" for x, y, rw, rh in out), len(out)


def components(mask: list[bytearray], w: int, h: int) -> list[list[tuple[int, int]]]:
    seen = [bytearray(w) for _ in range(h)]
    comps = []
    for y in range(h):
        for x in range(w):
            if mask[y][x] and not seen[y][x]:
                q, pts = deque([(x, y)]), []
                seen[y][x] = 1
                while q:
                    cx, cy = q.popleft()
                    pts.append((cx, cy))
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = 1
                            q.append((nx, ny))
                comps.append(pts)
    return comps


def plan(png: Path) -> dict:
    im = Image.open(png).convert("RGBA")
    w, h = im.size
    raw = im.tobytes()
    cls = {c: [bytearray(w) for _ in range(h)] for c in "fwndob"}
    empty = [bytearray(w) for _ in range(h)]
    for y in range(h):
        for x in range(w):
            i = (y * w + x) * 4
            if raw[i + 3] == 0:
                empty[y][x] = 1
                continue
            k = COL.get((raw[i], raw[i + 1], raw[i + 2]))
            if k:
                cls["f"][y][x] = 1
                if k != "f":
                    cls[k][y][x] = 1
    # holes: empty regions that never reach the image's edge, larger than a door gap
    holes = [c for c in components(empty, w, h)
             if len(c) > PX * PX and all(0 < x < w - 1 and 0 < y < h - 1 for x, y in c)]
    for c in holes:
        for x, y in c:
            cls["b"][y][x] = 1
    # an unclassified block counts as a bay too, and is drawn as one
    for y in range(h):
        for x in range(w):
            if cls["o"][y][x]:
                cls["b"][y][x] = 1
    blocks = [c for c in components(cls["o"], w, h) if len(c) > PX * PX]

    def outside(pts):
        for x, y in pts:
            for dx in range(-3, 4):
                for dy in range(-3, 4):
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < w and 0 <= ny < h) or empty[ny][nx]:
                        return True
        return False

    doors = [c for c in components(cls["d"], w, h) if len(c) > 20 and outside(c)]
    paths = {}
    for c in "fwndb":
        d, _ = rect_path(cls[c], w, h)
        if d:
            paths[c] = d
    return {"px": [w, h], "m": [round(w / PX, 1), round(h / PX, 1)], "doors": len(doors),
            "bays": len(holes) + len(blocks), "paths": paths}


def main() -> None:
    out = {}
    for kind, layouts in FINDER.items():
        for code in layouts:
            png = HERE / "plans" / f"{kind}-{code}.png"
            p = plan(png)
            out[f"{kind}-{code}"] = p
            print(f"{kind}-{code}", p["m"], "doors", p["doors"], "bays", p["bays"],
                  sum(len(v) for v in p["paths"].values()), "bytes")
    (HERE / "plans.json").write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
