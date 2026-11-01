VERDICT: FAIL

Windows locked-session acceptance proof for [Big Copilot PR #552](https://github.com/PeterHartwieg/big-copilot/pull/552), requested 1 November 2026. Role: rig_test. This result does not authorize merge. The full advertised Host contract was not met on the native Windows Unity/Mono runtime.

The explicit candidate guard is proven for `127.0.0.1:9999`: control serves the save, candidate returns exactly `403 {"error":"host_not_allowed"}`. However, the advertised allowed alias `localhost:8322` returns runtime **400 Invalid host** on both builds, and four of the five foreign-Host variants return runtime 400 before the mod. Those observations prevent the requested all-variants PASS. They do not show a save leak on those runtime-rejected names, and the localhost behavior predates this PR.

| Build | Source SHA | Link | Package SHA-256 |
| --- | --- | --- | --- |
| Candidate | `76a5ea2d9ea837351a35251bcf457ecd022a8a24` | 0.8.3 | `7db7f4829952c6df211908bdc75ff576626026ffb576a320cf97f5099eac0d90` |
| Control | `7f4373793902abd78e3f5ace661e1e35e8318088` | 0.8.2 | `0642394bb00e4b9370149bcea440e794ffdf0a3f02c6ffaf461f6d4de295834a` |

Both ZIP hashes matched before installation; CRCs passed. Control's `mod/` is byte-identical in git to merge base `8a64ef9135cc723992b21a5fd248e9a8491af8de`. Both native runs report schema 5 and game build/runningBuild 3682. Packages were not rebuilt; source was not changed.

| Check | Result | Observation |
| --- | --- | --- |
| R1 | PASS | IP Host health 200, modVersion 0.8.2. |
| R2 | PARTIAL | Requested evil Hosts, with and without port: health/save/facts all runtime 400. **red = runtime/none** for those names. Supplemental wrong-port Host returned 200 health and 200 save, establishing a reachable red baseline. |
| R3 | PARTIAL | Evil-Host OPTIONS returned runtime 400, so the expected control 204 could not be demonstrated. Allowed-IP OPTIONS returned 204 with site CORS. |
| G1 | FAIL | IP Host health 200 and modVersion 0.8.3. `localhost:8322` returned runtime 400, not required 200. |
| G2 | PASS | IP Host plus site Origin: save and paired facts 200 with `Access-Control-Allow-Origin: https://bigcopilot.com`. All 108 parsed save root keys/types and all 14 facts root keys/types match control. |
| G3 | FAIL | Wrong-port variant passes every explicit refusal check. Other four variants return runtime 400 rather than the required mod JSON 403. Foreign HEAD bodies are empty and have no CORS, but four statuses are 400 rather than 403. |
| G4 | PARTIAL | 64 concurrent requests: 48 allowed save reads produced 45 x 200 and 3 x 503 busy; 8 wrong-port reads stayed exact 403 host_not_allowed, and 8 evil-name reads were runtime 400. No foreign request got 503. Explicit guard ordering is proven for the reachable wrong-port variant. |
| G5 | PARTIAL | CLI PASS: actual `--watch --game` downloaded and parsed the portable live snapshot, wrote a 17,894,276-byte dashboard and served a live page with HTTP 200. Website NOT-RUN: headless Chrome's local-network permission gate denied loopback access before health; no board populated. |
| G6 | PASS | Candidate log has zero exception-like lines and no BigCopilotLink request failure. Relevant startup/capture lines quoted below. |
| Restore | PASS | Install tree, ModsLocal, remaining profile, and registry all match baselines exactly; zero differences, zero runtime-log exceptions. |
| Lease | PASS | Released only after verified restore; status held=false and pending=0. No started process remains. |

The request matrix below summarizes the actual native HTTP responses. All candidate foreign variants were tested on GET health/save/facts, POST `/write/uniforms` with `{}`, OPTIONS save, and HEAD save. Facts success requests used the paired `?stamp=` from health. There was no approved write request and no write was applied.

| Host / request | Control | Candidate |
| --- | --- | --- |
| `127.0.0.1:8322` GET health | 200, 0.8.2/schema 5 | 200, 0.8.3/schema 5 |
| `localhost:8322` GET health | 400 Invalid host | 400 Invalid host |
| IP Host, site Origin, GET save | 200, 1,932,040 bytes | 200, 1,932,040 bytes |
| IP Host, site Origin, GET paired facts | 200 | 200 |
| IP Host, site Origin, OPTIONS save | 204 + CORS | 204 + CORS |
| `evil.example:8322`, GET health/save/facts | 400 Invalid host | 400 Invalid host |
| `evil.example`, GET health/save/facts | 400 Invalid host | 400 Invalid host |
| Either evil Host, OPTIONS save | 400 Invalid host | 400 Invalid host |
| `127.0.0.1:9999`, GET health/save | 200 (supplemental red) | 403 `{"error":"host_not_allowed"}` |
| `127.0.0.1:9999`, GET facts, POST invalid write, OPTIONS save | Not run on control | 403 `{"error":"host_not_allowed"}` |
| `127.0.0.1:9999`, HEAD save | Not run on control | 403, zero bytes, no Access-Control-* headers |
| `localhost.evil.example:8322`, all non-HEAD probes | Not run on control | 400 Invalid host |
| `[::1]:8322`, all non-HEAD probes | Not run on control | 400 Invalid url (runtime malformed IPv6 URL) |
| Other four foreign variants, HEAD save | Not run on control | 400, zero bytes, no Access-Control-* headers |

`Invalid host` is the literal HTML body `<h1>Bad Request (Invalid host)</h1>`, not the new mod JSON. IPv6 error bodies include the runtime's malformed `http://[:8322/...` target. The complete matrix, requests, headers and original response lengths/hashes are in [http-control.txt](http-control.txt), [http-candidate.txt](http-candidate.txt) and their [control](http-control.jsonl)/[candidate](http-candidate.jsonl) JSONL records. Actual equivalent curl.exe commands and replies are in [curl-control.txt](curl-control.txt) and [curl-candidate.txt](curl-candidate.txt). `curl -I` emits headers into its output file; it is not used to infer body length. The raw Python HEAD probes establish empty bodies.

An initial control probe ran before the first snapshot was ready and correctly received 503 no_save_yet. The later `ready-*` and `final-*` control records supersede those initial data-availability checks. The first control scene-camera capture was replaced in this review by a repeat control run's full native game view.

The `/save` transport is gzip-compressed Easy Save 3 bytes (the API's octet-stream contract), rather than literal JSON. The actual client successfully parsed it. Live save bytes differ between runs, as their snapshot metadata changes; this is a shape/contract comparison, not a byte-identical simulation claim. No save values or binary previews ship here. Successful response bodies and identifying headers are redacted for publication; recorded lengths and SHA-256 hashes cover the original bytes. Key/type tables are in [control-save-shape.json](control-save-shape.json), [candidate-save-shape.json](candidate-save-shape.json) and [allowed-comparison.json](allowed-comparison.json).

Candidate log excerpt:

```text
[Mod:BigCopilotLink] [BigCopilotLink] serving the game to Big Copilot on http://127.0.0.1:8322/
[BigCopilotLink] serialized in 1285 ms on a worker thread (floor)
```

[Game-log excerpt](game-log-excerpt.txt), [busy results](busy-result.json), [client results](client-results.json), and [website permission result](website-result.json) provide the remaining check evidence. Headless Chrome was launched with channel chrome. It reported permission denied for the loopback address space; no OS/browser permission was changed and no human approval was possible in the locked session. The owned CLI watcher was stopped with CTRL_BREAK after its first completed poll, and exited; no continuous watcher was left behind.

Agent1 was launched visibly at `C:\BigAmbitions-AgentTests` through copied/adapted rig tooling. Owned game PIDs: control 40816, candidate 34244, repeat control 38428. All exited normally through the authenticated agent1 bridge quit command; no kill was used. A disposable copy of one existing agent1 FT save was loaded; no ordinary save was loaded in place. All existing mods were retained. The city was paused and the native `CustomSecondsBetweenAutosave 2147483647` command deferred autosave for the session (about 68 years); this is session suppression, not a claim that GameManager.preventAutoSave was set. No helper mod, game binary change, system setting, scheduled task, service, Steam change or normal profile access was used. The active disposable copy was removed by restoration. During the candidate run, no original save file changed; the only three added save-folder files were the disposable save, its metadata and its generated portrait. No autosave file appeared. [Save safety summary](save-safety-summary.json).

Stage: `C:\Users\Peter\HART-Builds\link-host-guard-20261101`. Raw screenshots: its sibling `screenshots\link-host-guard-20261101` folder. Private backups/raw logs remain outside git. Before any install, full sorted path/size/SHA-256 manifests covered the whole install tree (including backups and launcher/receipts/log), ModsLocal, and the remaining agent profile. The full profile, changed root files and agent-only registry key were backed up and verified. Restoration copied the original files back and replaced the agent-only registry values from that export. [restore-verify.json](restore-verify.json) records:

| Restored scope | Files | Differences | Manifest / export SHA-256 |
| --- | ---: | ---: | --- |
| Whole agent install | 1,622 | 0 | `44f368a14b093d93d39dbffc76ca0a953278c0519331d3629b633794f54baed1` |
| ModsLocal | 287 | 0 | `39ed223a208ecc44a573a7afca1091ca8f2da961fcc92c25fc78f4599f20a126` |
| Remaining profile | 4,541 | 0 | `6e42c87fb20fa322671be88981d36840f7b83a93549a2ce2c0bcc284daf9f6c6` |
| Registry export | — | 0 | `66fccbcc5f63bc492e36ba7f342d9d2480adb2b87404a650a8607094d207381d` |

Lease AssertOwner succeeded as the first operation. The existing owner lease was used throughout, never taken over. Release was verified at **04:02:29.353 CET (PC local, 2026-11-01T04:02:29.3533062+01:00)** / **03:02:29.353 UTC (2026-11-01T03:02:29.3533062Z)**, after the identical hashes. [release-receipt.json](release-receipt.json) records held=false, pending=0. No process started for this proof remains running, and the console session stayed locked.

Native game-view evidence (JPEG encoded from original bridge PNGs solely to keep each artifact small): [control](control.jpg), [candidate](candidate.jpg). [Website permission screen](website.png). [images.json](images.json) records source PNG and published image hashes. No source modification, PR comment, approval, merge, deployment or Workshop upload was performed.
