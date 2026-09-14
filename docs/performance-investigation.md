# Dashboard idle performance investigation — 2026-09-14

The reported symptom was choppy YouTube playback while the dashboard remained
visible on a second screen; closing and reopening the dashboard relieved it.
The exact video slowdown was not reproduced. Three unnecessary sources of work
were reproduced and fixed. Measurements below were collected on the investigation
checkout; the release applies these fixes to current main to preserve the newer
Wiki and map features.

## Confirmed issues and changes

- The landing and dashboard spheres continuously requested animation frames
  and wrote transforms after settling, including with reduced motion enabled.
  They now sleep when settled, wake for pointer movement and relevant layout or
  scroll changes, and pause their easing while the document is hidden. Removing
  the landing also stops its pending entrance work.
- The folder timer and visibility-change callback could start overlapping scans
  because the existing busy flag only covered save builds. Automatic checks now
  allow one scan at a time, release the guard after failures, and defer work while
  hidden. Returning to the tab triggers the existing immediate check. Visible
  second-screen dashboards still watch for saves as before.
- Continuous status-dot pulses kept the compositor drawing even after the
  JavaScript sphere loops went to sleep. The online/live and folder-watch dots
  are now steady; their labels and state colors remain.

## Measurements

Windows, headless Microsoft Edge 153, 1920 × 1080 viewport. Each idle sample
lasted five seconds; heap samples followed explicit garbage collection. These
measurements cover page scripting/main-thread work, not GPU usage or video decoding.

Correction after independent review: the original timing figures (96/11 ms on
Today and 172/84 ms on Map) included explicit garbage collection at the end of
each timed interval. The corrected samples below collect before starting the
timer. In particular, the previous 84 ms Map result was not evidence of unexplained
idle application work. The memory observations below are unchanged.

| Five-second idle sample | Before | After |
| --- | ---: | ---: |
| Today: animation callbacks | 375 | 0 |
| Today: main-thread task time | 77.5 ms | 6.8 ms |
| Map: animation callbacks | 376 | 0 |
| Map: main-thread task time | 74.3 ms | 4.6 ms |

Across 60 redraws using existing local dashboard data, document nodes and event
listeners stayed constant. The baseline collected JavaScript heap rose from
about 2.05 MB to 2.56 MB; the fixed version behaved similarly (2.04 MB to 2.55 MB).
This short run does not establish that every long-session allocation is bounded.
The loaded map had about 108,000 DOM nodes including its embedded SVG document;
this is a substantial asset, but no growing map allocation was demonstrated.

The actual browser Python worker processed the same local save 20 times, retaining
updated history between builds. Its WebAssembly allocation rose from 51.94 MB
after the first build to 62.38 MB by build five and stayed there through build 20.
After collection, the Python object count stayed at 25,431. Builds took roughly
200–235 ms. Save contents remained local; only the normal public Python runtime
was downloaded. No worker source changes were required.

The measurements support removing wasteful idle work. They do not prove this was
the sole cause of the reported playback stutter or rule out browser/GPU pressure
over a longer session.

## Validation

### Follow-up: status pulse and hardware-accelerated compositing

A local A/B probe used Edge 153 with GPU compositing enabled through ANGLE/D3D11
on the NVIDIA GeForce RTX 4070. It loaded the dashboard template and local data,
with save polling stubbed so only the status pulse changed. The sole running
animation at rest was the CSS `pulse`. Two alternating enabled/disabled pairs
produced these results per three-second sample:

| Measurement | Pulse enabled | Pulse disabled |
| --- | ---: | ---: |
| Compositor `DrawFrame` events | 225–226 | 0 |
| CPU time in the browser GPU process | 224–238 ms | 3.7–4.7 ms |

CPU sampling took place separately from tracing to avoid tracing overhead in
those CPU figures. GPU-process CPU time is not GPU utilization. After removing
the pulse rules, a native-style follow-up also recorded no running animations
and no compositor `DrawFrame` events at rest.

This confirms that the small dot sustained roughly 75 compositor draws per
second and meaningful work outside the page's main-thread metrics. It does not
establish that it caused the original YouTube stutter: this was a hardware-backed
headless probe, not playback on the physical two-monitor layout. The fix removes
the continuous pulses from both the shared live/online status and the folder-watch
indicator. No new regression tests were added or run for this follow-up, as requested.
The local probe is `research/pulse-profile.cjs`; its baseline and fixed results
are saved beside it outside the committed release. Browser assets were rebuilt;
deployment was deferred until the release step.

### Earlier checks

`tests/performance.test.cjs` exercises real landing/dashboard animation lifecycles
with normal and reduced motion, plus a deterministic overlapping folder-check
reproduction. The original five regressions failed before the fixes and passed
afterward. Additional coverage checks spawning, scrolling, visibility and recovery
after a failed scan.

Review follow-up checks also passed for the three-ball gulp/replacement cycle,
resizing below and above the orb's visible breakpoint, and hiding during an
unfinished folder scan before returning to trigger a build. The status dot's CSS
animation was outside the RAF-counter coverage and was subsequently investigated
and removed as described above.

The broad browser run passed 138 of 139 tests. The failure was
`URL destination wins over remembered page without adding a visit` in
`tests/restore.test.cjs`; it also fails with the app and sphere code captured
before this investigation. It is outside this performance change.

All 118 Python tests passed using `.venv-map/Scripts/python.exe`; the ordinary
Python environment lacks Shapely required by the private map-pipeline tests.
The browser assets were rebuilt with `python build_web.py` during the investigation.

### Release integration

Independent reviews using `claude-opus-5` and `grok-4.6` found no proven functional
regression in the animation scheduling or folder-check guard. Their coverage and
GPU questions informed the follow-up measurements above; neither review proved
the cause of the original video stutter.

The release is based on main `7b40573`. The newer map can consume all shelf balls,
including the original clone template. Animation visibility therefore checks the
current balls, so fresh balls can still move after the map consumes the originals.
No additional regression tests were added for release integration or the pulse.
This performance-only release intentionally has no changelog announcement.

On the release checkout, all 229 Node/browser checks passed using Edge, including
the six performance regressions and the generated-page release check. All 173
Python checks passed. The production build, `git diff --check`, and Wrangler
deployment dry run also passed. The earlier restoration failure did not recur
on current main.
