"""Generates the Big Copilot redesign canvas: project/*.dc.html and project/canvas.json.

Design brief: docs/ui-structure-proposal.md and docs/ui-designer-prompt.md (the audit's
worktree, origin/main 09c5c32). Visual authority: TEMPLATE in ba_dashboard.py at that
commit. NOTES.md beside this file holds the rationale, compromises and data needs.

Never hand-edit project/: change the builders and rerun. `--preview` also writes plain
HTML copies into _preview/ for screenshots at each width (not part of the canvas).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

import kit  # noqa: E402
import boards_overview as ov  # noqa: E402
import boards_supply as sp  # noqa: E402
import boards_more as mo  # noqa: E402
import boards_structure as st  # noqa: E402
import boards_r2 as r2  # noqa: E402

ROOT = HERE / "project"
CREATED_AT = "2026-09-26T12:00:00Z"

# file, title, builder, w, h, page, row, dark, reduced, extra css
BOARDS = [
    # --- 1 · structure ------------------------------------------------------
    ("Sitemap.dc.html", "Sitemap: five destinations, two references, the shell", st.sitemap, 1440, 1340, "structure", 0, True, False, st.CSS),
    ("Coverage.dc.html", "Feature coverage: 105 capabilities, 31 finding kinds", st.coverage, 1440, 3920, "structure", 0, True, False, st.CSS),
    ("Rationale.dc.html", "Rationale: hierarchy, navigation, shared workflows, motion", st.rationale, 1440, 1500, "structure", 0, True, False, st.CSS),
    ("NavCompare.dc.html", "Navigation: sidebar (recommended) against the evolved masthead", st.nav_compare, 1440, 980, "structure", 1, True, False, st.CSS),
    ("OverviewMasthead.dc.html", "Alternative · Overview with the evolved masthead", ov.overview_masthead, 1440, 900, "structure", 1, True, False, ""),
    ("Motion.dc.html", "Motion, focus and their still equivalents", st.motion, 1440, 1160, "structure", 1, True, False, st.CSS),
    # --- 2 · overview -------------------------------------------------------
    ("Main.dc.html", "Overview · first screen, 1440 × 900 (recommended)", ov.overview, 1440, 900, "overview", 0, True, False, ""),
    ("OverviewFull.dc.html", "Overview · the whole page, dark", ov.overview, 1440, 1900, "overview", 0, True, False, ""),
    ("OverviewLight.dc.html", "Overview · the whole page, light", ov.overview, 1440, 1900, "overview", 0, False, False, ""),
    ("OverviewMany.dc.html", "Overview · every finding shown (17)", lambda: ov.app("overview", "attention", "Overview", ov.overview_body(expanded=True)), 1440, 2360, "overview", 1, True, False, ""),
    ("Customize.dc.html", "Customize checks · every kind, the $ line, what is off", ov.customize, 1440, 900, "overview", 1, True, False, ov.CUST_CSS),
    ("OverviewCalm.dc.html", "Overview · no urgent findings (checks off, waiting for data)", ov.overview_calm, 1440, 1480, "overview", 1, True, False, ""),
    ("OverviewShopOnly.dc.html", "Overview · shop-only company, no factories", ov.overview_shop_only, 1440, 1400, "overview", 1, False, False, ""),
    ("OverviewStale.dc.html", "Overview · refresh failed, last good board kept", ov.overview_stale, 1440, 900, "overview", 1, True, False, ""),
    ("OverviewLong.dc.html", "Overview · German labels and long names", ov.overview_long, 1440, 900, "overview", 1, True, False, ""),
    ("OverviewFocus.dc.html", "Overview · keyboard focus, reduced motion", ov.overview_focus, 1440, 900, "overview", 1, True, True, ""),
    ("Overview1024.dc.html", "Overview · 1024 px", ov.overview_1024, 1024, 2580, "overview", 2, True, False, ov.BP1024),
    ("Overview768.dc.html", "Overview · 768 px", ov.overview_768, 768, 2900, "overview", 2, True, False, ov.TAB),
    ("PhoneOverview.dc.html", "Overview · phone, dark", ov.phone_overview, 390, 2400, "overview", 2, True, False, ov.PHONE),
    ("PhoneOverviewLight.dc.html", "Overview · phone, light", ov.phone_overview, 390, 2400, "overview", 2, False, False, ov.PHONE),
]
BOARDS += sp.BOARDS + mo.BOARDS

# round 2: the five refined screens, the navigation comparison and the before/after sheets
_ASSETS = json.loads((HERE / "assets.json").read_text(encoding="utf-8")) if (HERE / "assets.json").exists() else {"img": {}, "words": {}}
BOARDS += [
    ("R2Overview.dc.html", "R2 · Overview, masthead, dark", r2.overview, 1440, 1720, "r2", 0, True, False, r2.CSS),
    ("R2OverviewLight.dc.html", "R2 · Overview, masthead, light", r2.overview, 1440, 1720, "r2", 0, False, False, r2.CSS),
    ("R2OverviewLong.dc.html", "R2 · long queue, scrolled: All tools stays one click away", r2.overview_long, 1440, 900, "r2", 0, True, False, r2.CSS),
    ("R2OverviewSidebar.dc.html", "R2 · the same Overview with a slim sidebar (comparison)", r2.overview_sidebar, 1440, 1860, "r2", 0, True, False, r2.CSS + r2.SIDE_CSS),
    ("R2Imports.dc.html", "R2 · Imports", r2.imports, 1440, 1000, "r2", 1, True, False, r2.CSS),
    ("R2ImportsOpen.dc.html", "R2 · Imports, 'Why this amount?' and 'Set it in the game' open", lambda: r2.imports(True), 1440, 1140, "r2", 1, False, False, r2.CSS),
    ("R2Changes.dc.html", "R2 · Changes", r2.changes, 1440, 1060, "r2", 1, True, False, r2.CSS),
    ("R2Business.dc.html", "R2 · a business page", r2.business, 1440, 1320, "r2", 1, True, False, r2.CSS),
    ("R2Phone.dc.html", "R2 · phone Overview, dark", r2.phone, 390, 2220, "r2", 2, True, False, ov.PHONE + r2.CSS),
    ("R2PhoneLight.dc.html", "R2 · phone Overview, light", r2.phone, 390, 2220, "r2", 2, False, False, ov.PHONE + r2.CSS),
    ("R2PhoneImports.dc.html", "R2 · phone Imports", r2.phone_imports, 390, 880, "r2", 2, True, False, ov.PHONE + sp.SUP_CSS + r2.CSS),
    ("R2PhoneWrite.dc.html", "R2 · phone, the write as a sheet", lambda: r2.phone_imports(True), 390, 880, "r2", 2, True, False, ov.PHONE + sp.SUP_CSS + r2.CSS),
] + [(f"{b[0]}.dc.html", f"Before and after · {b[1]}", (lambda i=i: r2.ba_sheet(i, _ASSETS["img"], _ASSETS["words"])), 1440, 1180 if b[0] != "BAPhone" else 1300,
      "r2", 3, True, False, r2.CSS) for i, b in enumerate(r2.BA)]

PAGES = [("r2", "Round 2 · after review"), ("structure", "1 · Structure"), ("overview", "2 · Overview"), ("supply", "3 · Supply fix journey"),
         ("tasks", "4 · Staffing, Businesses, Expansion"), ("support", "5 · Supporting frames")]
ROW_TITLES = {
    ("structure", 0): "Structure: sitemap, coverage and the reasons", ("structure", 1): "Navigation: recommendation, alternative, motion",
    ("overview", 0): "Overview: Needs attention first", ("overview", 1): "Overview: volume, calm, young company, failure",
    ("overview", 2): "Overview at 1024, 768 and 390",
}
ROW_TITLES.update(sp.ROW_TITLES)
ROW_TITLES.update({("r2", 0): "Round 2 · Overview: compact criticals, one expanded, All tools", ("r2", 1): "Round 2 · Imports, Changes, a business page",
                   ("r2", 2): "Round 2 · phone Overview and the import flow", ("r2", 3): "Round 2 · before and after"})
ROW_TITLES.update(mo.ROW_TITLES)
NOTES = {}
NOTES.update(st.NOTES)
NOTES.update(sp.NOTES)
NOTES.update(mo.NOTES)
NOTES.update({
    "r2-a": ("r2", 0, 0, "Masthead refined (the review's preferred direction) with a persistent local row in each area; the slim sidebar at the right carries the same content and type scale for a fair comparison."),
    "r2-b": ("r2", 0, 3040, "Proposed, not existing: the arrival strip and return position, 'Next finding', and the goods-flow product filter. They are notes here so the product frames carry no design commentary."),
    "r2-c": ("r2", 1, 0, "Imports: manual marking and the game link are alternatives in one action bar, not steps. The state pill shows where the change stands; its history opens from it."),
    "r2-d": ("r2", 3, 0, "Word counts are the on-page text of the main area, measured in the browser on both versions (same method, whole page)."),
})


def build(preview: bool = False, only: str | None = None) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    boards, order, notes = {}, [], {}
    cursor: dict = {}
    row_h: dict = {}
    # rows stack per page; each row's y is the sum of the rows above it
    for spec in BOARDS:
        name, title, builder, w, h, pg, row, dark, rm, css = spec
        row_h[(pg, row)] = max(row_h.get((pg, row), 0), h)
    row_y: dict = {}
    for pg, _ in PAGES:
        y = 0
        for r in sorted(k[1] for k in row_h if k[0] == pg):
            row_y[(pg, r)] = y
            y += row_h[(pg, r)] + 420
    for spec in BOARDS:
        name, title, builder, w, h, pg, row, dark, rm, css = spec
        if only and only not in name:
            continue
        body = builder()
        (ROOT / name).write_text(kit.page(title, body, w, h, dark, rm, css), encoding="utf-8", newline="\n")
        if preview:
            out = HERE / "_preview"
            out.mkdir(exist_ok=True)
            (out / name.replace(".dc.html", ".html")).write_text(kit.preview(title, body, w, h, dark, rm, css), encoding="utf-8", newline="\n")
        x = cursor.get((pg, row), 0)
        cursor[(pg, row)] = x + w + 80
        boards[name] = {"x": x, "y": row_y[(pg, row)], "w": w, "h": h, "title": title, "is_interactive": True, "page": pg}
        order.append(name)
    for (pg, row), text in ROW_TITLES.items():
        if (pg, row) in row_y:
            nid = f"row-{pg}-{row}"
            notes[nid] = {"x": 0, "y": row_y[(pg, row)] - 300, "text": text, "kind": "title1", "page": pg,
                          "maxW": max(cursor.get((pg, row), 1400) - 80, 1400)}
    for nid, n in NOTES.items():
        pg, row, dx, text = n
        if (pg, row) in row_y:
            notes[nid] = {"x": dx, "y": row_y[(pg, row)] - 180, "w": 520, "maxH": 150, "text": text, "page": pg, "fill": "blue"}
    if only:
        print("wrote", len(order), "artboards (partial; index not written)")
        return
    index = {"v": 3, "createdOnFiles": {"v": 1, "at": CREATED_AT}, "title": "Big Copilot Redesign",
             "launch": {"view": "canvas", "page": "r2"}, "pages": [{"id": i, "name": n} for i, n in PAGES],
             "boards": boards, "order": order, "notes": notes, "designSystems": []}
    (ROOT / "canvas.json").write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8", newline="\n")
    print("wrote", len(order), "artboards")


if __name__ == "__main__":
    only = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--only=")), None)
    build("--preview" in sys.argv, only)
