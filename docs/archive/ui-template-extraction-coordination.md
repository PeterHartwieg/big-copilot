# Template extraction coordination (#100 Change E)

26 September 2026. The redesign port has already begun editing `TEMPLATE` in an isolated worker checkout. Do not freeze/extract the older main-branch template while that worker is active. E remains parked. Prefer extracting a shared accepted revision containing the completed redesign and current-main additions (including PR #121 Staff hiring). No extraction or freeze is authorized by this note.

The design and product behavior do not require an embedded Python string. The current implementation instructions and test harnesses do depend on its source location and must move together when E runs.

## Anchors and contracts to preserve or repoint

- Python `TEMPLATE = r"""`, its closing boundary, template substitution/rendering and the final board `<script>`: move source ownership and build/render lookup together. The CLI and Pyodide must still produce the same board.
- `/*__MAP_SCRIPT__*/` and `/*__WIKI_SCRIPT__*/`: preserve splice semantics and shared global scope; do not accidentally turn these into independently scoped modules during byte-identical extraction.
- Existing registry/function identities: `PAGE_DRAWS`, `SUBS`, `SEC_PAGE`, `SEC_MOVED`, `ALERT_GROUPS`, `ALERT_LINKS`, `ALERT_EVIDENCE`, search registries, `planOrder`, `drawAlerts`, rendering/navigation/refresh helpers. The redesign adds `AREAS`, `REFS`, `ROUTES`, `FINDING_ROUTES` and `ov*` helpers. Repoint source reads; retain the accepted functions, DOM IDs and route aliases.
- Existing public `#site/<slug>` and `#wiki/<page>` contracts, new canonical task routes and old aliases in `docs/archive/ui-route-migration.md`: extraction should not change navigation.
- Source-slicing Node tests called out in AGENTS: `alert_kinds`, `fold_views`, `milestones`, `navigation`, `order_checklist`, `search`; also new redesign journey tests and upstream `staff_hire` tests. Inventory final tests rather than relying only on this starting list.
- Python tests that read template source, notably `test_plan_orders.py` and `test_routed_supply.py`, plus board-fixture/rendering helpers and privacy/build/parity tests.
- Source-location references in `AGENTS.md`, `docs/architecture.md`, `docs/archive/ui-implementation-plan.md`, and chunk handoffs/ownership instructions. The map/wiki code continues to share helpers unless a separately approved change says otherwise.

`build_web.py` must remain the generator of the checked-in web artifact and browser Python copies. The Pyodide filesystem contract must include any newly required external template asset or embed it during build; a new import-time file dependency would otherwise break the browser runtime. The extraction's own design should choose and verify that mechanism.

Before E starts, coordinate a stable input commit and absence of an active template writer. Its byte-identical comparison must use that final integrated revision, not the original audit baseline `09c5c32` or the interim review snapshot `356af7b`.
