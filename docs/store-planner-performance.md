# Store-planner catalogue indexing

Issue #267, measured on 4 October 2026 against `c1864237`.

`_open_store()` now creates one `_OutfitCatalogue` for its invocation. It indexes
price-table flags and the furniture that displays each product, and shares
`_OutfitType` decisions across that type's layouts: whether a piece is sold,
its placement furniture and its combined unit cost. Requirement unions retain
price-table order; cheapest-item choices retain their explicit price/name ties.

The catalogue owns no save data. Capacity, floor area, selected quantities,
covered products and copied shelving remain local to `outfit_lines()`. Nothing
survives the `_open_store()` call. Standalone callers of `outfit_lines()` receive
a fresh catalogue; the private `_catalogue` argument is for reuse within one
invocation with unchanged rules and prices.

## Reproduce the native measurements

Use the new profiler with both checkouts, in separate processes:

```sh
python3 tools/profile_store_planner.py --root /path/to/baseline --iterations 30
python3 tools/profile_store_planner.py --iterations 30
```

The fixture is `tests.es3_fixture.link_company()`, encoded and loaded as a
synthetic save. It needs no installed game or private save. Each path is warmed
once, timed without profiling, then run separately under cProfile. The planner
measurement invokes `_open_store_section()` on a build whose prerequisites have
already been calculated; it does not time the rest of extraction. Reported
cumulative times include profiler overhead and must not be read as wall times.

On this Mac with Python 3.14.6, 30 iterations produced:

| Measurement | Baseline | Indexed |
| --- | ---: | ---: |
| Mean complete extraction, unprofiled | 18.21 ms | 9.80 ms |
| Mean store planning, unprofiled | 12.57 ms | 4.47 ms |
| Complete extraction, cumulative profiled total | 2.523 s | 1.119 s |
| Store planning within extraction, cumulative | 2.016 s | 0.583 s |
| `outfit_lines` calls | 570 | 570 |
| `flags` accessor calls | 1,344,960 | 8,160 |
| `works_in` calls | 96,390 | 32,820 |

The accessor count shows eliminated repeated flag lookups, not every operation:
the new index still reads each price-table row once per planner invocation.
The profile also reports sold/mount/unit-cost calls; cached calls still count.

## Pyodide check

A separate Node harness loaded the repository's bundled Pyodide 314.0.6
(Python 3.14.2), the same six Python/data files, `gametext.json` and the synthetic
fixture writer into its virtual filesystem. It loaded one synthetic save,
wrapped `_open_store()` with `time.perf_counter()`, warmed three full
extractions, then measured 30 full extractions with fresh `Names` objects and
no history file. Runtime startup and file loading are excluded.

| Median warm runtime | Baseline | Indexed |
| --- | ---: | ---: |
| Complete extraction | 45.78 ms | 30.40 ms |
| Store planning within extraction | 25.29 ms | 8.36 ms |

These are measurements of a small synthetic fixture, not claims about large
saves or initial browser loading. The native and Pyodide harnesses use different
name-table setup and summary statistics, so compare before/after within each
runtime rather than comparing their absolute times.

The focused outfit/store/payback/snapshot checks pass without changing snapshots.
Private complete-payload comparison covered all 259 local save outcomes: zero
differences, including 230 unchanged old-build rejections. No private save data
is included in this document or the synthetic fixtures.
