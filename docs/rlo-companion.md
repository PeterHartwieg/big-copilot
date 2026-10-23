# Real Life Overhaul companion reporting

Big Copilot detects
RLO records and shows report availability under Mods, with validated business,
employee and account counts and reported credit account balances. The masthead explains
the current limits. Detection is evidence in the save, not proof that RLO is
installed or currently running.

RLO exports the meaning of its own data. `ba_rlo.py` reads the versioned companion
report, without decoding RLO's private save formats. `ba_mods.detect()` includes
the compact result in `mods.rlo`; the full validated report is available through
`ba_rlo.read(save)`. Validation is cached on each Save and shared by CLI and Pyodide.
Producer-owned compatibility models are separate additive modules. Additional
debt and ordinary pay observations never get added to recorded profit. Their
availability does not establish completeness of a broader forecast.

## Transport and freshness

Ordinary saves carry a JSON string at `modData["reallife:companion"]`, written by
RLO after its normal save handlers. The same contract is returned by the optional
main-thread API `RealLifeOverhaul.Companion.CaptureV1(GameInstance)`.

Big Copilot Link discovers this API by reflection. Before background serialization,
`CompanionSnapshots` copies the root and `modData` once. Each mod adapter reads
the original live instance and writes only its own keys into the copy. RLO adds
`bigcopilot:rlo-snapshot.v1` with `status: fresh` and the SHA-256 of the exact UTF-8
report string. It never fires save events or edits the running instance. HART and Street Food
are composed into the same private copy. A canonical identity/version/modules
comparison before and after asynchronous serialization detects changed provider
state; only captured timestamps are excluded. A missing,
throwing or invalid provider produces `status: unavailable`; retained reports
are removed from the private copy, even if the game clock has not moved.

`ba_rlo` requires the capture's character and clock to match the accompanying
save, truncating the game's fractional minute to a whole minute. Save names and
build numbers are excluded because the game finalises them after its save event. Live sources and portable `.bcsave` files also require the
fresh marker and matching digest. This prevents an old ordinary-save report from
masquerading as a fresh live report, including after exporting and reopening it.
The digest is an association check, not a security signature. It does not prove
that an arbitrary third-party producer told the truth.

The Link wire schema remains unchanged: this is optional additive data inside the
existing save payload, with its own envelope and capability versions. An older
Link still loads saves, but its unrefreshed RLO report is unavailable for live use.

## Validation and boundaries

See [the shared schema](../contracts/rlo/schema.json). The authoritative source is
RLO's `contracts/companion/v1/`. The exporter is introduced by the paired RLO
contribution; releases without that exporter cannot provide the report.
Mod releases do not change the contract version automatically.

Unknown envelope versions are unavailable. Unknown or malformed capabilities are
isolated, preserving other validated modules. Unknown additive fields are ignored.
Input is bounded at 4 MiB, 10,000 rows per array and integers within JavaScript's
exact range. Duplicate fields or identities, invalid units, inconsistent hourly
wage components and ambiguous debt provenance are rejected. Missing reports do
not produce zero balances. A save containing only older RLO private keys is marked
as missing a companion report.

The modules cover selected feature settings, business identity, ordinary hourly
pay, additional credit and statement provenance. Business types stay opaque.
Addresses identify businesses only within this capture; account ids are scoped to
the company. Ordinary pay excludes overtime, sick pay and other charges. Credit
excludes ordinary game loan principal, private-lender debt and debts recorded by
other RLO features. A zero balance covers only the reported credit accounts. Recorded statements remain authoritative
for the activity they cover, without claiming complete RLO cash-flow coverage.

The original five modules grant no permission to modify manager-owned state.
The additive compatibility contracts supply owner models and `OwnershipV1`.
Link queries it freshly for review/apply/undo of schedule, hire, wholesale and
rent; only allowed permits mutation. Conditional is a refusal with concrete
manager effects, not an invitation to take over. Every source/destination and
schedule suboperation is checked before any change. Refused undo remains available.
See [the wire contract](game-link-api.md#fresh-mod-ownership) for exact request
shapes and the conservative fallback for older RLO.

Factory costs retain the native purchase boundaries: furniture delivery orders
are `ba:transaction_deliverycontract`, while the installation firm's entire fee
plus furniture is one `ba:transaction_interiorinstallation` bill. The latter
receives the captured Living adjustment when listed; delivery contracts do not
inherit an item-purchase adjustment. Carried in-store purchases are outside this
self-installation estimate. Default catalogue prices exclude the market and
import multipliers; wholesale costs apply those multipliers once. Daily wages
are adjusted as an aggregate estimate from captured settings, not a prediction
of every future employee transaction.

`livingExcludesWholesalePurchases` controls the later City settlement adjustment;
it is separate from the registered catalogue and market/import multipliers.
The store model applies that adjustment once to its daily goods category when
wholesale purchases are included. Factory recipes provide weekly consumption,
not dated purchase bills. When wholesale purchases are included and the City
cost factor differs from 1000, factory raw-material costs, savings and complete
running totals are unavailable. Ingredient quantities and observed catalogue
quotes remain usable. The factory does not invent a daily purchase schedule.

A report requesting carried company debt in site forecasts makes the complete
site forecast unavailable; debt is not silently omitted. Loan estimates are also
unavailable when bank terms require additional credit eligibility or treat
principal as an expense. Recorded debt and statement observations stay separate
from these forecast limits.

## Maintaining both sides

RLO's EconomyCheck generates `ready.json` and `partial.json` using its production
serializer and owner helpers, and asserts their committed bytes. Big Copilot's
`tests/test_rlo.py` reads those fixtures and covers ordinary saves, live captures,
portable exports, malformed records, version changes, unavailable modules and
unchanged base financial totals. The UI tests cover clear limits and missing data.

After intentionally changing the contract, regenerate the RLO fixtures, review
their diff, copy the schema and fixtures here, then run:

```sh
python tools/check_rlo_contract.py <RLO-checkout>
npm run test:python -- tests.test_rlo tests.test_mods tests.test_payload_snapshot
npm test -- tests/mods.test.cjs tests/mods_flag.test.cjs tests/game_link.test.cjs tests/worker_startup.test.cjs
```

Run the SDK checks described in the Link README and RLO's full contribution gate
before opening its PR. That gate currently requires Windows for existing path
assumptions and credential-storage checks; the portable companion tests do not
replace it. Follow with the in-game checks in RLO's contract README before release. Do not release this as full RLO compatibility.
