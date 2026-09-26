"""Generates the Big Copilot redesign canvas: project/*.dc.html and project/canvas.json.

Design brief: docs/ui-structure-proposal.md and docs/ui-designer-prompt.md (the audit's
worktree, origin/main 09c5c32). Visual authority: TEMPLATE in ba_dashboard.py at that
commit. NOTES.md beside this file holds the rationale, compromises, data needs and the
history of the three rounds.

The product frames are drawn by screens.py (the masthead treatment) and by the screen
builders in boards_supply.py and boards_more.py, rendered through screens.app2(). The
structure sheets are boards_structure.py; boards_r2.py keeps the round-2 stylesheet and
the before/after sheets; boards_overview.py keeps the phone stylesheet and Customize.

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
import screens as sc  # noqa: E402

# every screen renders in the masthead shell, with the round-3 arrival strip
for _m in (sp, mo):
    _m.app = sc.app2
    _m.from_strip = sc.from_strip
sp.imports = lambda *a, **k: sc.imports()

ROOT = HERE / "project"
CREATED_AT = "2026-09-26T12:00:00Z"
_ASSETS = json.loads((HERE / "assets.json").read_text(encoding="utf-8")) if (HERE / "assets.json").exists() else {"img": {}, "words": {}}

P = sc.CSS                               # product frames
PS = sc.CSS + sp.SUP_CSS                 # supply screens
PM = sc.CSS + sp.SUP_CSS + mo.MORE_CSS   # everything else
PH = ov.PHONE + sp.SUP_CSS + sc.CSS      # phones
STR = st.CSS + PM                        # sheets that embed product frames

# file, title, builder, w, h, page, row, dark, reduced, extra css
BOARDS = [
    # --- Overview -------------------------------------------------------------
    ("Main.dc.html", "Overview · dark (start here)", sc.overview, 1440, 1640, "overview", 0, True, False, P),
    ("OverviewDetails.dc.html", "Overview · Details open on a finding", lambda: sc.overview(True), 1440, 1860, "overview", 0, True, False, P),
    ("OverviewLight.dc.html", "Overview · light", sc.overview, 1440, 1640, "overview", 0, False, False, P),
    ("OverviewLong.dc.html", "Overview · long queue, scrolled: All tools stays in reach", sc.overview_long, 1440, 900, "overview", 0, True, False, P),
    ("Customize.dc.html", "Customize checks", sc.customize, 1440, 900, "overview", 1, True, False, P + ov.CUST_CSS),
    ("OverviewCalm.dc.html", "Overview · no urgent findings", sc.overview_calm, 1440, 1200, "overview", 1, True, False, P),
    ("OverviewShopOnly.dc.html", "Overview · shop-only company", sc.overview_shop_only, 1440, 1200, "overview", 1, False, False, P),
    ("OverviewStale.dc.html", "Overview · refresh failed, last good board kept", sc.overview_stale, 1440, 900, "overview", 1, True, False, P),
    ("OverviewNames.dc.html", "Overview · German navigation and long names", sc.overview_names, 1440, 900, "overview", 1, True, False, P),
    ("OverviewFocus.dc.html", "Overview · keyboard focus on Details, reduced motion", sc.overview_focus, 1440, 900, "overview", 1, True, True, P),
    ("Overview1024.dc.html", "Overview · 1024 px, Details open", sc.overview_1024, 1024, 2240, "overview", 2, True, False, P),
    ("Overview768.dc.html", "Overview · 768 px, Details open", sc.overview_768, 768, 2700, "overview", 2, True, False, P),
    ("PhoneOverview.dc.html", "Overview · phone, dark", sc.phone, 390, 2180, "overview", 2, True, False, PH),
    ("PhoneOverviewDetails.dc.html", "Overview · phone, Details open", lambda: sc.phone(True), 390, 2440, "overview", 2, True, False, PH),
    ("PhoneOverviewLight.dc.html", "Overview · phone, light", sc.phone, 390, 2180, "overview", 2, False, False, PH),
    ("PhoneLargeText.dc.html", "Overview · phone, text at 130%, Details open", lambda: sc.phone(True, zoom=True), 390, 3280, "overview", 2, True, False, PH),
    # --- the supply fix journey ------------------------------------------------------
    ("Changes.dc.html", "Supply › Changes", sc.changes, 1440, 1060, "supply", 0, True, False, PS),
    ("Imports.dc.html", "Supply › Imports · from Needs attention", sc.imports, 1440, 1060, "supply", 0, True, False, PS),
    ("ImportsDemand.dc.html", "Imports · Plan for switched to Shop demand", lambda: sc.imports(full=False), 1440, 1060, "supply", 0, True, False, PS),
    ("ImportsManual.dc.html", "Imports · Why this amount? and Manual instructions open", lambda: sc.imports(open_=True), 1440, 1240, "supply", 0, False, False, PS),
    ("WritePreview.dc.html", "Write 1 · preview", lambda: sp.write_frame("preview"), 1440, 900, "supply", 0, True, False, PS),
    ("WritePermission.dc.html", "Write 2 · waiting for permission", lambda: sp.write_frame("permission"), 1440, 900, "supply", 0, True, False, PS),
    ("WriteApplying.dc.html", "Write 3 · applying, reading again", lambda: sp.write_frame("applying"), 1440, 900, "supply", 0, True, False, PS),
    ("WriteDone.dc.html", "Write 4 · done, the undo scope", lambda: sp.write_frame("done"), 1440, 900, "supply", 0, True, False, PS),
    ("OverviewReturn.dc.html", "Back to Needs attention · place and order kept", sc.overview_return, 1440, 900, "supply", 0, True, False, P),
    ("ImportsApplied.dc.html", "Imports · applied, awaiting refresh", lambda: sc.imports("link"), 1440, 1060, "supply", 1, True, False, PS),
    ("ImportsMarked.dc.html", "Imports · marked done by you", lambda: sc.imports("mine"), 1440, 1060, "supply", 1, True, False, PS),
    ("ImportsConfirmed.dc.html", "Imports · confirmed from refreshed data", lambda: sc.imports("conf", arrived=False), 1440, 1100, "supply", 1, False, False, PS),
    ("WriteRefused.dc.html", "Write · refused, lock window", lambda: sp.write_frame("lock"), 1440, 900, "supply", 1, True, False, PS),
    ("WriteOverCap.dc.html", "Write · a row over the supplier cap", lambda: sp.write_frame("over"), 1440, 900, "supply", 1, True, False, PS),
    ("WriteChanged.dc.html", "Write · changed in the game meanwhile", lambda: sp.write_frame("changed"), 1440, 900, "supply", 1, True, False, PS),
    ("WriteOldMod.dc.html", "Write · older mod, reads only", lambda: sp.write_frame("old"), 1440, 900, "supply", 1, False, False, PS),
    ("Production.dc.html", "Supply › Production · hours, basis, inputs, staffing", sp.production, 1440, 1420, "supply", 2, True, False, PS),
    ("ProductionNone.dc.html", "Supply › Production · no factories yet", sp.production_none, 1440, 900, "supply", 2, False, False, PS),
    ("Deliveries.dc.html", "Supply › Deliveries", mo.deliveries, 1440, 900, "supply", 2, True, False, PM),
    ("GoodsFlow.dc.html", "Supply › Goods flow · following Water from Bridge Hub", mo.goods_flow, 1440, 1080, "supply", 2, True, False, PM),
    ("Imports1024.dc.html", "Imports · 1024 px, Shop demand", sc.imports_1024, 1024, 1120, "supply", 3, True, False, PS),
    ("PhoneImports.dc.html", "Imports · phone, dark", sc.phone_imports, 390, 900, "supply", 3, True, False, PH),
    ("PhoneImportsDemand.dc.html", "Imports · phone, Shop demand", lambda: sc.phone_imports(full=False), 390, 900, "supply", 3, False, False, PH),
    ("PhoneWrite.dc.html", "Imports · phone, the write as a sheet", lambda: sc.phone_imports(True), 390, 900, "supply", 3, True, False, PH),
    ("PhoneImportsLargeText.dc.html", "Imports · phone, text at 130%", lambda: sc.phone_imports(zoom=True), 390, 1620, "supply", 3, True, False, PH),
    # --- Staffing, Businesses, Expansion -------------------------------------------------
    ("Schedules.dc.html", "Staffing › Schedules", mo.schedules, 1440, 1120, "tasks", 0, True, False, PM),
    ("StaffNeeds.dc.html", "Staffing › Staff needs", mo.staff_needs, 1440, 900, "tasks", 0, True, False, PM),
    ("Payroll.dc.html", "Staffing › Payroll", mo.payroll, 1440, 900, "tasks", 0, True, False, PM),
    ("Results.dc.html", "Businesses › Results", mo.results, 1440, 1240, "tasks", 1, True, False, PM),
    ("BusinessDetail.dc.html", "Businesses › a business page (shop)", sc.business, 1440, 1340, "tasks", 1, True, False, PM),
    ("BusinessKinds.dc.html", "Business pages: warehouse, factory, office, home", mo.business_kinds, 1440, 900, "tasks", 1, True, False, PM),
    ("Prices.dc.html", "Businesses › Products & prices", lambda: mo.prices(False), 1440, 900, "tasks", 1, True, False, PM),
    ("PricesShop.dc.html", "Products & prices · one shop against the market", lambda: mo.prices(True), 1440, 900, "tasks", 1, True, False, PM),
    ("Standards.dc.html", "Businesses › Standards", mo.standards, 1440, 900, "tasks", 1, True, False, PM),
    ("Milestones.dc.html", "Businesses › Milestones", mo.milestones, 1440, 900, "tasks", 1, True, False, PM),
    ("Demand.dc.html", "Expansion › Demand", mo.demand, 1440, 900, "tasks", 2, True, False, PM),
    ("Finder.dc.html", "Expansion › Find a location", lambda: mo.finder(), 1440, 1060, "tasks", 2, True, False, PM),
    ("FinderDetail.dc.html", "Find a location · a building, filters kept", lambda: mo.finder(True), 1440, 1060, "tasks", 2, False, False, PM),
    ("PlanFactory.dc.html", "Expansion › Plan a factory", mo.plan_factory, 1440, 900, "tasks", 2, True, False, PM),
    # --- references, utilities, entry ------------------------------------------------------
    ("Guide.dc.html", "Game guide", mo.guide, 1440, 900, "support", 0, True, False, PM),
    ("CityMap.dc.html", "City map, a home's card", mo.city_map, 1440, 960, "support", 0, True, False, PM),
    ("Preferences.dc.html", "Preferences", mo.preferences, 1440, 1080, "support", 0, False, False, PM),
    ("Help.dc.html", "Help & feedback", mo.help_page, 1440, 1000, "support", 0, True, False, PM),
    ("NoSave.dc.html", "No save yet · the entry", mo.no_save, 1440, 900, "support", 0, True, False, PM),
    # --- structure ------------------------------------------------------------------------
    ("Sitemap.dc.html", "Sitemap", st.sitemap, 1440, 1340, "structure", 0, True, False, st.CSS),
    ("Coverage.dc.html", "Feature coverage: 105 capabilities, 31 finding kinds", st.coverage, 1440, 3920, "structure", 0, True, False, st.CSS),
    ("Rationale.dc.html", "Rationale", st.rationale, 1440, 1360, "structure", 0, True, False, st.CSS),
    ("Journeys.dc.html", "Four journeys, step by step", st.journeys, 1440, 1980, "structure", 1, True, False, STR),
    ("NavCompare.dc.html", "Navigation: masthead (recommended) and slim sidebar", st.nav_compare, 1440, 960, "structure", 1, True, False, STR + r2.CSS + sc.SIDE_CSS),
    ("Motion.dc.html", "Motion, focus and touch", st.motion, 1440, 1160, "structure", 1, True, False, STR),
] + [(f"{b[0]}.dc.html", f"Round 1 → round 2 · {b[1]}", (lambda i=i: r2.ba_sheet(i, _ASSETS["img"], _ASSETS["words"])), 1440, 1180 if b[0] != "BAPhone" else 1300,
      "history", 0, True, False, r2.CSS) for i, b in enumerate(r2.BA)]

PAGES = [("overview", "1 · Overview"), ("supply", "2 · Supply fix journey"), ("tasks", "3 · Staffing, Businesses, Expansion"),
         ("support", "4 · References and utilities"), ("structure", "5 · Structure and journeys"), ("history", "History")]
ROW_TITLES = {
    ("overview", 0): "Overview: every critical finding summarised, Details on demand",
    ("overview", 1): "Overview states: checks, calm, young company, failure, long names, focus",
    ("overview", 2): "Overview at 1024, 768, phone and larger text",
    ("supply", 0): "The import fix: open → review → apply → return",
    ("supply", 1): "Other outcomes: applied, marked, confirmed, refused, over cap, moved on, old mod",
    ("supply", 2): "Production, Deliveries and the followed route",
    ("supply", 3): "The journey at 1024, on a phone and with larger text",
    ("tasks", 0): "Staffing", ("tasks", 1): "Businesses", ("tasks", 2): "Expansion",
    ("support", 0): "References, utilities and the entry",
    ("structure", 0): "Sitemap, coverage and rationale", ("structure", 1): "Journeys, navigation, motion",
    ("history", 0): "Round 1 → round 2, with matched crops",
}
NOTES = {
    "n-handoff": ("overview", 0, 3040, "Implementation handoff: mockup/ui-redesign/NOTES.md, 'Implementation handoff'. H1 one basis and amount everywhere; H2 shop demand names its factory hours; H3 returning keeps the finding, filters and place; H4 which controls work, link, illustrate or are unwired."),
    "n-start": ("overview", 0, 0, "Play from Main: Details opens a finding in place; Review import opens the setting. Details start closed so the whole queue is visible."),
    "n-journey": ("supply", 0, 0, "Imports holds two fixes: 1 prevents the recurring shortage (the weekly order, writable through the game link); 2 covers the gap until Monday (a one-time purchase, by hand). Toggle Plan for to see the amount move."),
    "n-states": ("supply", 1, 0, "Three kinds of done: Marked by you (outlined, neutral), Applied · awaiting refresh (blue), Confirmed (solid green, only from a newer read)."),
    "n-prod": ("supply", 2, 0, "Production owns factory hours and the people they need; Staffing links here. Scheduling blocks, not named workers."),
    "n-prop": ("supply", 0, 1520, "Proposed, not existing today: the arrival strip with return position, Details per finding, and following a product's route in Goods flow."),
    "n-sched": ("tasks", 0, 0, "Schedules lists shops with their plan status; offices say why shop schedules do not apply; factories link to Supply › Production."),
    "n-price": ("tasks", 1, 0, "Overview › Check prices and product sales lands on Products & prices; picking a shop shows its prices beside the market."),
    "n-find": ("tasks", 2, 1520, "Find a location keeps its filters: open a building (FinderDetail) and Results returns to the same list."),
    "n-hist": ("history", 0, 0, "Round 1 used a sidebar and a right rail; round 2 moved to the masthead and compact summaries; round 3 (these pages) adds Details, the two named fixes and the three ticks."),
}


def _clean(project: Path) -> None:
    keep = {b[0] for b in BOARDS} | {"canvas.json"}
    for f in project.glob("*.dc.html"):
        if f.name not in keep:
            f.unlink()


def build(preview: bool = False, only: str | None = None) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    if not only:
        _clean(ROOT)
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
             "launch": {"view": "canvas", "page": "overview"}, "pages": [{"id": i, "name": n} for i, n in PAGES],
             "boards": boards, "order": order, "notes": notes, "designSystems": []}
    (ROOT / "canvas.json").write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8", newline="\n")
    print("wrote", len(order), "artboards")


if __name__ == "__main__":
    only = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--only=")), None)
    build("--preview" in sys.argv, only)
