HMP/RLO compatibility implementation plan — agreed contract
23 October 2026. Opus5.5 and coordinator agreed after three review rounds; final amendments below adopted before implementation.

This replaces conflicting wording in draft 2. Read alongside the source coverage matrix in draft 2 and Opus review 2. Target Copilot2843245f plus PR51463edb6ba; HARTModPack8d8b56a (retired HMP is fallback only); RLO850e2781. Persistent City excluded. The goal covers existing Copilot observations, recommendations, forecasts and live writes; it does not add simulations for unsupported custom businesses or personal-life apps.

Decisions on all seven blockers

1. Manager control is preserved. We will NOT add a handover/confirmation mechanism in this change. RLO OwnershipV1 may return allowed, conditional, refused or unknown. Copilot executes only allowed. Conditional means the mod can react to or supersede the change, and is shown as a refusal with its concrete effect. For Stock, already player-held lines may be allowed; managed/unheld lines are refused because a write can transfer control or be overwritten. For Rota/Hiring, an active manager task is conditional unless its pure owner query can prove the concrete request has no competing effect; absent that proof Copilot refuses. Never call a mutating manager routine to obtain proof. This intentionally favors preserving a player's configured manager over adding new control-transfer UX.
2. The query schema retains conditional/effects for precision and future expansion. There is no new user approval flow now. Refusal affects only the concrete touched targets. Hire/move/reassign/reschedule and undo must check all source and destination sites and all schedule suboperations; a bulk operation does not escape a Rota guard by calling itself hire. Recheck query immediately before mutation, on main thread, using the actual proposed/restored values.
3. Old RLO fallback: no OwnershipV1 means no authority to overwrite unverified competing state. A fresh report that proves managers disabled permits schedule/hire/wholesale. Otherwise those operations are ownership_unknown. Estate disabled must be proven to permit rent; RLO0.50 lacks this feature observation, so rent is ownership_unknown. Imports, uniforms and route writes stay allowed. Marketing remains allowed but optimization requires corrected own/written promotion (otherwise only the affected optimization is unavailable). This is a bounded compatibility implementation choice authorized by the task; it does not require another user policy decision.
4. Ordinary offline saves are in scope. HART adds a separate public on-save publisher for hartmodpack:companion, using GlobalEvents.onSaveGame before serialization. The pure CaptureV1 never changes modData. The publisher assigns/removes only its own key, publishes inactive/blocked states too, and removes stale own output on capture failure. Subscribe/unsubscribe outside GameplayFeatures so legacy stand-down still has a report. Reattach after GlobalEvents.Init clears the event. Same-assembly duplicate mod instances share one effective subscription; ownership takeover must not leave duplicates. Identity is character/day/hour/whole minute, not buildNumberAtLastSave (native game updates that AFTER the callback). Add ordinary save/reload acceptance. Legacy HMP gets no new publisher and retains conservative fallback.
5. Tax rows: use producer-supplied semantic {label,kind:recurring|once} classifications for RLO rows in the current language. Keep the existing verified native classifier for native labels. Never reclassify an unknown RLO/localized row by a fuzzy English guess. Any unclassified mod row that affects the projection makes that projection incomplete; show the known amount/coverage. Recorded native tax balances remain unchanged. The producer also declares hidden-cash rebates/accountant and other RLO tax effects separately; do not silently claim the native yearly forecast includes them.
6. Office IT: HART reports its current daily seat component with basis=included-in-rlo-internet-accrual. RLO internet account.accrued already includes this. Historical/accrued observations never add it again. Future plan costs combine a base RLO internet model with HART seat costs exactly once. No running internet/outage means no seat accrual. Current reported accounting versus future run-rate have different fields and provenance.
7. Prohibited reads: no GameBooks.Refresh, CompanyGame staff mutation/drop helpers, CompanyGame.Offers, NoteHours, UtilitiesRules.AddDay, RloGate.Accepts, OnGameLoaded, ReportAvailability, Ready, Denied, DiplomaHold.Keep/Restore, manager rounds/ManagerLook, or Estate refresh. Producer code lives with its owning feature and reads current state through pure projections. Capture and permission queries must not change money, modData, lists, catalogues, game settings, cache stamps/contents, warning/failure/gate latches. Pure predicates may be factored out of gameplay so behavior and reporting share them. Logging from capture must not latch new state.

Contract conventions (frozen)

Existing RLO envelope/schema1 and five modules stay compatible. Additive module version1. Both providers have schemaVersion, provider, modVersion, captured={character,day,hour,minute}, modules. RLO provider=rlo, HART provider=hart-mod-pack. All modules have {version:1,status:ready|disabled|unavailable|failed,data}; optional semantic reason may accompany non-ready status. Non-ready data=null. Ready empty is known zero; absent/failed/unknown never means zero. Unknown module/model fails only declared dependent surfaces. Preserve existing byte/row/depth/integer limits and deterministic order.

Money fields use signed integer cents with explicit basis/period. Ratios use integer thousandths; percentages/rates explicitly name units. Native per-unit float catalogue prices can be carried as invariant round-trip decimal strings (not rounded to cents); parser validates finite nonnegative bounded values and production vectors cover conversion/float rounding. This avoids losing fractional-cent wholesale prices. Dates/hours are integers. Addresses use {street,number}; no consumer guesses internal RLO place-key formats. HART and RLO use the same address vocabulary. Object field names below are frozen domain boundaries; exact nested schema and production-generated fixtures are committed before consumer code, and any semantic adjustment returns for review.

RLO module boundaries and mandatory data

prices: model=rlo-prices-v1. effective levelThousandths, quietBand, costFactorThousandths, takingsFactorThousandths, native Living category applicability/rounding, current per-item wholesale amount and its provenance/factor (itemId,ownAmount,effectiveAmount,kind,factorThousandths or exchange factor), effective default catalogue prices when changed, and native bank terms/eligibility basis in a separate bankTerms module. Persist these in ordinary saved reports, so offline use does not depend on live registry access. Current-city settings held constant, company aggregate carried debt excluded from per-site forecast. Deposit is not city-Living-adjusted. Ordinary statement amounts never multiplied again.

utilities: model=rlo-utilities-v1. Public normalized tariff/use/rounding terms, typeId→kind map owned by UtilitiesGame.KindOf, priceLevel, calendar month length and season resolver/table sufficient for each forecast day, standing/per-unit rates, temporary supply surcharge, rented/bought supply startup semantics, refundable deposits and connection delay. Accounts rows address/service/state/accruedCents/fromDay/lastDay/owedCents/dueDay/lastBillCents/depositCents, internet plan/rate/contract/coverage/install delay/outage window. Supply-cut and no-Internet closure conditions declared. Accrual and bill payment never both subtracted from the same total. Costs of additional factory lines use incremental equipment, and new depot/HQ costs are included or explicitly incomplete if the actual support site is not known.

company: model=rlo-company-v1. Per site: current raises/overtime agreement/sick-pay policy, manager daily allowance, cover tier/premium formula/input/current quote, active campaigns/discounts, hiddenCashShare, licences held/expiry. Global accountant tier/monthly fee. New-site defaults and optional policy choices are distinct from current site commitments. Rates/periods and statement-inclusion category declared, never inferred. New-hire wages use producer factors; current employees use existing employment module ordinaryHourlyCents, with overtime/etc separately included or explicitly scoped. Staffing/hiring/idle-hour cost recommendations use the same normalized wage source.

requirements: model=rlo-opening-requirements-v1. Per business type licence needs/feeCents/termDays, internetNeeds, lateOpeningHours and valid-permit logic. New-site plans include needed permits/connections as prerequisites/costs. Existing staffing/open-all-hours proposals may not recommend unpermitted hours; native write guard independently rechecks. Known current closures/supply/internet missing conditions affect recommendations, not only display.

footfall: model=rlo-footfall-v1. Per site ownPromotion,writtenPromotion,city/company/issue/interior components. Publish portable deterministic price-tolerance function terms with item/district inputs for hypothetical plan prices; current price inputs are not reused blindly for a different plan. Include interior district standards and deterministic decor/price-tolerance/basket effects under interiors model=rlo-interiors-v1 with per-district requiredScore and relevant terms. New-site outfits target the effective district standard. Unknown owner/model affects that forecast specifically. Avoid scaling an already-written live promotion twice; saved own-promotion follows the same normalized calculation.

closures: rows address/source/fromDay/untilDay/untilHour or explicit indefinite/unknown end. Stochastic future events remain risks; observed active effects have stated expiry/current-hold assumptions.

education: rows keyed courseId, offered, qualified, enrollment/status/paidCents/installments/loan facts, quoteStatus=ok|ineligible|unknown, reason, feeNowCents,grantCents,retakeCents,owedCents, modes/timetable/approximate duration. Quotes are current cash/loan choice observations from RLO careers owner (CanEnrol/Grant/InstalmentDue/RetakeFee/Length/PriceRules), not replayed by Copilot. HART course definitions/map and held records supplement this. Charge once per missing course, no charge for owned machines, no second fee for already-paid enrollment, no promised pass date. Quotes are conditional on captured settings/cash, not guarantees at a future enrollment date.

bankTerms: native bank identities, effective cap/rate/term and explicit debt/wealth eligibility basis, including whether RLO secured-account rules apply. Existing additional credit module remains scoped and excluded from native Loans; don't assume it covers all personal liabilities or add principal to expenses. Native bank profit7 remains native statement-based. EmpireBank own-business rules are not native borrowing rules.

outsideStatements: semantic rows {scope:place|company,address?,category,basis:paid|accrued|owed,fromDay,toDay,cents}, with coverage enum and known omitted categories, plus recurringDeductionLabels[{label,kind}]. Categories utilities.power/water/internet,cover.premium/excess,tax.accountant/penalty/rebate/backtax,racket,repair,other. Category sets must be disjoint from statement categories. New daily run-rate forecasts are separate model outputs; paid/accrued/owed rows never summed indiscriminately. Current recorded profit and its series remain unchanged. Results and payback show their statement coverage and separate known outside costs; incomplete coverage prevents an unqualified total-profit/payback claim. No invented history if game records cannot establish it.

ownership: snapshot per-target operation ownership/effects for UI, plus the live API below. An effective-disabled report authorizes only its own no-conflict fact; missing old modules never authorize unknown conflicts.

OwnershipV1 API (frozen)
public static string RealLifeOverhaul.Companion.OwnershipV1(GameInstance game, string requestJson).
Request {schemaVersion:1,operation:schedule|hire|wholesale|rent,targets:[{street,number, ... operation data}], phase:review|apply|undo}. Schedule target carries proposed full week/open hours; hire carries all affected addresses and whether hiring/moving/scheduling; wholesale targets include contract identity and itemIds; rent targets identify property/address. Query must validate shape, bounds and session, and inspect current owner state rather than snapshot cache. Response {schemaVersion:1,decision:allowed|conditional|refused|unknown,owner,task,reasons:[],effects:[]}. Null/invalid/version-unknown is unknown. Link permits only allowed. Returned effects describe possible manager rewrite, replacement hire or transfer-to-player. If operation mixes targets, one non-allowed result rejects the atomic operation or that row under the existing atomicity policy; never partially mutate before checking all targets.

HART companion (frozen module boundaries)
public static string HARTModPack.Companion.CaptureV1(GameInstance game).
modules runtime,rent,runningCosts,factoryPurchases,retailDemand.
runtime: gameplayActive,blockedByLegacy,rloReview=accepted|refused|undecided|absent, target states; rules keyed existing Rules.All ids with requested,effective(bool|null),state,reason. RloGate.Refused=false alone is not accepted. Pure decided/accepted snapshot required. Same-assembly duplicate instances with one owner are not ambiguous; multiple distinct assembly objects are ambiguous. Legacy-only capabilities observed separately; never treat blocked pack options as proof of legacy behavior.
rent: model=hart-rent-v1, effective new-lease multiplier by native building type. Link captures actual live new-lease quote/deposit and existing signed rent separately. Ordinary-save fallback uses this known multiplier only where native baseline quote is known and no other unmodelled rent provider applies; otherwise unknown.
runningCosts: model=hart-running-costs-v1; equipment/officeIt independent effective states; referenceHours=12,closedShareThousandths=250, seatMonthCentsAtBasePrice=15000,officeTypeIds; items[itemId,openWatts,alwaysWatts,litresPerOpenHour,officeSeat]; currentSites[address,equipmentApplies,inputBasis=billing-cache|current-items,openWatts,alwaysWatts,litresPerOpenHour,officeSeats,itSeatDayCents,itBasis=included-in-rlo-internet-accrual]. Exact formula: power=max(RLO standby,alwaysWatts*24)+RLO open+openWatts*hours; water=RLO standby+max(RLO open,litresPerOpenHour*hours). Reconstruct full use on a zero-hours day before splitting. Preserve integer order/saturation. Cache peek matches next-bill inputs without inserting/resetting caches. RLO owns tariffs/use/season/money conversion. Missing item classification is unknown, not zero.
factoryPurchases: model=hart-factory-purchase-gate-v1,restriction=purchase-only, gate effective conjunction, course/item mapping and definitions, typed heldRecords ready/unavailable. Gate enforced requires activepatch/no failure/intactcatalogue/RLOcareers+study/directorhealthy/studyrecord; disabled/fail-open gate imposes no purchase requirement but stateswhy. Held data malformed is unknown. Never infer actual qualification from CoursesRegistered or count0fallback. RLOeducation owns eligibility/effective fees.
retailDemand: Cafe model=hart-cafe-stations-v1 with sessionsPerStationPerHour=2 and exact usable current station count via shared tree traversal; hypothetical plans need proven usable paired stations, not raw PC count. Ambience model=hart-ambience-demand-v1 only if pure owner score/preset/eligibility available; otherwise reason=ambience-owner-inputs-unavailable on affected retail forecast, offices unchanged. Native registered Bakery and vehicle prices captured by native facts, not multiplied a second time.

Freshness and scale

Reuse PR514 private one-copy composition and exact raw-report hash marker per provider; add HART marker symmetrically. Raw marker binds exact UTF8 report to save bytes; report captured clock equals copied save clock. No fallback to previous saved report if a live provider fails. Additionally compare canonical provider identity/version/modules before vs after asynchronous save walking, excluding only captured timestamps; retry on changed modules as facts already do. Keep clock/session safety checks. Capture once per snapshot, parse/normalize once per Save, indexed joins not cross products, no per-frame work. Add bounded load/performance fixture for large company/catalogue.

Implementation sequence and ownership
A reconcile PR514 on current main, fix current/legacy discovery and provenance; no parallel report envelope. B RLO and HART producer branches in separate worktrees, production-generated schemas/fixtures/vectors first; C Link and Python/JS consumers on frozen contracts; D UI/closure/staffing/finance/tax coverage and all entrypoint checks. Native ownership is not considered complete at UI-only enforcement. Each worker owns disjoint files/repo; no edits to canonical/pending worktrees. Return contract semantic changes for Opus review before relying on them.

Acceptance/release
Pure models match owner-generated vectors to the specified rounding, including awkward fractions, price quiet boundaries, season/month changes, zero/partial/24h, stock flags and missing items. Tests cover statuses, toggles, failed hooks, legacy load orders, duplicates, stale saved reports, midwalk mutation, apply/undo after owner changes, malformed report, unknown model, and nonmutation including failure paths. Vanilla payload invariance; private save/profit comparison; browser and bundled Pyodide; SDK compile/reflection; RLO full documented build/checkers; pack build/API/check-all. Opus implementation review plus usual independent round, CI green before merge/deploy.
Adding RLO producer changes DLL hash. Review exact candidate patched-target bodies and add that reviewed candidate hash to HART Targets only after build/inspection; never bypass the RloGate. Upstream rebuild/release changes may require another hash review. Code merging is not proof upstream shipped or native gameplay/Workshop acceptance happened. Track those dependencies truthfully.

Opus 5.5 agreed to these decisions after three plan review rounds. The contract
amendments below were reviewed before consumer implementation.


Final amendments adopted 23 October 2026 (normative over earlier wording)

1. Old RLO authorization uses a fresh CaptureV1 at the exact same main-thread dry-run/apply/undo, not a stored report. Only managers.enabled=false proves schedule/hire/wholesale has no manager conflict. Schedule and hire also require company.enabled=false or a complete seven-day proposed week whose open intervals stay within 05:00–22:00; otherwise the late-hour permit is unverified. enabled=true/running=false is ownership_unknown because directors may start after load or recover. Estate disabled likewise requires current owner proof.
2. Every footfall row also carries registrationPromotionAtCapture. Consumer requires equality with corresponding registration promotion in the paired save bytes; mismatch makes that site's model unavailable. writtenPromotion remains the value applied during play even after normal-save put-back. Use own/written exactly once.
3. Do not assume deposits are unaffected. prices declares depositAdjustment=none|rentCostFactor based on actual native deposit transaction categories. Until proven, affected investment completeness is unknown. Test charge and refund separately; RLO adjusts negative rent-category transactions even if not Living.
4. Explicit prohibited HART capture calls include RunningCostsPatch.Refresh/LoadOf/Forget and RealLifeOverhaulPatch.WarnOnce/Fail.
5. Offline reports are clock-validated captured facts, not proof the provider is still installed. A same-clock retained report after removal may be indistinguishable; only bound Link capture establishes stronger live freshness.
6. Licence/connection/education startup charges and subsequent renewal run-rates must not be double-counted between investment and break-even cash flows. Preserve per-period payment timing or state explicitly the modelled accrual basis.

Implementation boundaries

The implementation uses public owner snapshots and separate pure models, rather
than reading private serialized mod state. Future updates can change a module
version and its producer vectors without changing unrelated adapters. Unknown
versions stay unavailable only where that module is required.

Supported calculations include registered catalogue prices, ordinary wages,
current own/written promotion, scoped retail basket and office client effects,
interior targets, utilities, licences, education prerequisites, incremental
factory/support equipment, and captured native bank terms. Native observed
statements remain unchanged. Outside-statement paid/accrued/owed costs are shown
separately; native tax projections are incomplete when owner effects or mixed
deductions cannot be represented.

This does not establish complete economic simulation for every mod setting.
Retail basket estimates require proof that the native capacity limits cannot
bind; other cases are explicitly unavailable. Shop expansion estimates require
a verified changed-site demand context. Current employee raises/campaigns or
unknown leases can make a particular projection incomplete. Office staffing
uses measured hours as recorded, but cannot use native default demand for unread
hours while an interior client boost may apply. Ordinary wage estimates exclude
overtime, sickness and unobserved future absence. Company-wide City rounding is
represented as a standalone site/category estimate; captured City settings are
held constant and company carried debt is excluded.

New custom businesses and personal-life apps are outside this task. Persistent
City is excluded. Offline reports are observations at the saved clock; only
bound live capture proves current provider presence. No manager handover is
implemented: live writes require an allowed decision for every affected target,
including undo.

Producer validation (23 October 2026)

- RLO candidate `0b911e4c`: native build with zero warnings/errors; 314 companion
  checks and 99,286 Standard checks pass. Final DLL SHA256:
  `14aa86b20dd354bc0784e0d482a3a2c8ed28dd8235b5224685ac8c0175d8f422`.
- HART candidate `6b13fc4` reviewed that exact RLO binary: all 698 existing audited
  entries unchanged, three pure helpers added. Its build, executable check-all
  stages and refreshed import/package pins pass,
  including both Windows/Mac API checks, legacy load order, duplicate ownership,
  unknown-hash refusal, save publication and package pins.
- Opus's producer review found and prompted fixes for legacy late-hour permit
  authorization, rent request shape, home equipment classification, malformed
  transaction rows, a changed gameplay cache path, abandoned utility state,
  deterministic interior ordering and owned-property lease provenance.
- Game Link SDK harness: 119 synthetic assertions pass. This is not in-game
  save/load or Workshop acceptance.
- RLO's complete gate is not green on macOS. Isolated unchanged base `850e2781`
  reproduces the Windows DPAPI/Steamworks, locale/path and inventory failures.
  Windows validation is still required; RLO currently has no GitHub CI workflow.

These are candidate integration results, not evidence of an upstream RLO release
or a deployed HART build. HART is based on the pending modpack integration branch;
merging that entire base requires its own release readiness. Any rebuilt upstream
RLO binary must undergo the same hash/body review. Actual game acceptance and
release status must be recorded separately from code review and CI.

Local consumer evidence: vanilla synthetic payload snapshots pass. The private
420-save comparison has 230 matching extraction errors and 190 readable saves;
only 30 RLO payloads change, in compatibility/planning metadata. Profit calibration
output matches the previous code exactly, and the marketing check reports 958
comparable sites with no mismatches. Private saves and comparison outputs are not
committed. Browser scenarios pass; the stale mod-support wording assertion was
updated and its focused suite passes. Final reviewer and CI status is recorded
on the pull request.
