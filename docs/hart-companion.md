# HART Mod Pack companion reporting

The current pack exports the pure public API
`HARTModPack.Companion.CaptureV1(GameInstance)` and publishes the same report to
`modData["hartmodpack:companion"]` on ordinary game saves. Legacy Hard Mode Patch
has no new publisher. Link never invokes gameplay readiness, billing, manager or
save handlers to obtain a report.

The envelope is `{schemaVersion:1,provider:"hart-mod-pack",modVersion,captured,modules}`.
`captured` is character/day/hour/whole minute, matching the copied save. Modules
have `{version:1,status:ready|disabled|unavailable|failed,data}`; non-ready data is
null, and ready empty means known zero. Independent boundaries are `runtime`,
`rent`, `runningCosts`, `factoryPurchases`, and `retailDemand`. Unknown owner/model
or malformed data disables only the surfaces that depend on it.

Runtime distinguishes requested options from effective rules, legacy stand-down,
RLO review and patch availability. An undecided RLO gate is not accepted. Same
assembly duplicate instances share one owner; distinct assembly objects are
ambiguous. A blocked pack does not prove which rules a loaded legacy mod applies.
The legacy capability fallback observes only selected options and public flags.

Link discovers the current API separately from RLO. Its single private snapshot
copy receives the raw report and `bigcopilot:hart-snapshot.v1`, binding the exact
UTF-8 report hash. A missing/throwing/invalid/ambiguous live provider removes the
copied retained report and marks it unavailable, without modifying live state or
other providers. Captured clock mismatch is unavailable. The canonical report
identity/version/modules are compared after asynchronous save walking; changed
state retries publication. Ordinary reports do not prove the provider is still
installed: same-clock retained output after removal is not distinguishable offline.

Live new-lease rent/deposit, signed rent/deposit, registered item prices and native
bank terms are separate native facts described in the
[Link contract](game-link-api.md#native-economy-and-new-leases). Never apply HART's
rent multiplier to a native quote that already includes it, or add Office IT to
RLO internet accrual that already contains the seat charge. Factory course gates
apply to purchases; owning an existing machine is not a new course purchase.
Producer-owned models and their generated vectors define calculation support.

Factory planning applies the captured operating model to the new factory and
supporting depot. At existing sites it subtracts the captured baseline from the
same site with added equipment, so unchanged rent, equipment and licences are
not charged again. HQ furniture purchases and added operating costs use only
workstations needed beyond verified, unassigned complete furniture groups.
Unknown support placement or spare capacity makes the dependent estimate
incomplete. A depot plan assumes an additional van; it does not infer that an
existing assigned vehicle can serve another route.

Course tuition is an economic investment once per required course; initial cash
is shown separately. Existing enrollment does not trigger a second fee, and an
unknown remaining payment schedule blocks a complete investment estimate.
Financing uses known initial cash, while incomplete investment suppresses loan
recommendations. Owning a machine does not charge a course retroactively, but
buying another copy still checks the current purchase gate.

The SDK-only synthetic harness in `mod/build/compatibility-tests` tests report
composition, exact hashes, clock/module freshness, failure isolation, duplicate
assemblies and ownership refusal/fallback. Build and run it inside the dedicated
SDK as described in the Link README. SDK validation is not in-game verification;
ordinary save/reload, option changes, manager ownership changes and refused undo
must still be checked with the exact release candidates before distribution.
