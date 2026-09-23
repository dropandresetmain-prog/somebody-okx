# Task Ledger — E2E Reliability Corrections (Somebody × OKX)

Updated: 22 Sep 2026 (Singapore)

## Base / acceptance scope

- Authoritative investigated candidate: `integration/demo-replay-v6` @
  `d9ea006d24a77dc20aecb057786fbb26ad1aa62b`
  - parents: `b54a21210d5c1aba2cc57d1f7ba337f2215a8eb5` (chore/dev: local-Convex-first),
    `e170c916b1c6a6b2d9a155d48502ef81f07aca81` (test/frontend: V6 product read contract)
- Working branch (isolated worktree): `qoder/general-session-fyws0q` created from the base.
- Main checkout `origin/main` @ `2bc3e06` is a DIFFERENT line (M5 real-data); not our base.

### Newer-candidate determination

- `origin/build/demo-playback-console` @ `23a6a21` (22 Sep 19:06) is a **child** of the base
  adding a read-only V6 demo playback console. No acceptance/gate record names it as an
  accepted integration candidate; it is a parallel demo lane, not an approved base.
  → Decision: base remains `d9ea006`. Its `app/product/*` + `convex/productWorkspace.ts`
  V6 read surface IS in the base (via `e170c91`), so item J applies.

## Accepted scope of THIS task (bounded)

1. Complete, correctly scoped artifact context for writing workers (M1-A/B/C).
2. Explicit deduplicated continuation for reopened deliverables (M1-D).
3. Fingerprint identity + redecision correctness (M1-E).
4. Deterministic scenario harness over the 7 historical defect families (M1-F).
5. Truthful acquisition boundary: governed resource/purpose inputs (M2-G), financial/result
   truth (M2-H), opt-in verified record/replay (M2-I), V6 + bounded reads (M2-J).

## Explicitly OUT of scope

- No merge, deploy, or cloud Convex consumption. No payments, signing, or merchant calls.
- No model-name branching, no model-specific prompts, no forced BUY/provider,
  no proof relaxation, no expanded financial authority, no budget inflation,
  no canonical-demo choreography.
- No raising of stored artifact-size ceiling or MAX_TURNS.
- Not obtaining a live record (RECORD plumbing + tests only).

## Luna / Nex-mini parity rule

Same runtime + configuration except model identity. Any change that would behave
differently per model is out of scope by construction.

---

## Milestone 1 — status: COMPLETE

Item commits (each pushed at the item boundary):

| Item | Commit | Content |
| --- | --- | --- |
| A | `46aee4d` | Complete supported target view: a tool-required full replacement ≤8,000 is no longer truncated to 1,200 (stored ceiling and MAX_TURNS unchanged); edits bound to exact target + expected version; stale rejections side-effect-free. |
| B | `46aee4d` | Source/accepted-output continuity: immutable baselines; accepted classification only from durable `acceptedTerminal` — a raw terminal is never "accepted" (unconfirmed/rejected classified as such). |
| C | `46aee4d` | Quality handoff: lockedCriteria + correction package in the worker observation; bar unchanged. |
| E (groundwork) | `46aee4d` | Real decision-fingerprint facts begin here. |
| D | `ab70edf` | Negative-review reopen owns a deduped continuation (single `recovery_event` wake, own identity); request-bound expiry + armed watchdogs for decision/assessment reservations. |
| D (cont.) | `3325ea9` | Interpretation reservation gets the same bounded expiry/watchdog; late callbacks can only clear their own requestId. |
| E | `adf508f` | Shared `decisionFingerprintFacts`/`decisionWorkerAvailability` collectors (production + fixtures cannot drift); grounding = latest-decodable-attempt-per-requirement then empty→omit (no revival of an older non-empty attempt); version-true assessment reuse. |
| F | `cd442d7` | Deterministic scenario harness: `tests/reliabilityScenarios.test.ts` (14 named cases over the 7 families below), `tests/fixtures/reliability/world.ts` (production-builder worlds, dual-clock epochs), continuation audits extended to armed `_scheduled_functions` jobs. No scenario may wake a stranded Objective by hand. |

## The seven defect families (historical, enumerated in the harness)

- **DF1 truncation loss** — context/edit truncated below what the tool requires
  (gate runs luna-1..3; `77e2b72`, `410d247`).
- **DF2 stale-write race** — an edit bound to an old view overwrites newer truth
  (`77e2b72` fence).
- **DF3 accepted-context lie** — a rejected/unconfirmed terminal presented as
  accepted output, or baselines mutated/hidden (`c8f197e`).
- **DF4 correction stranding** — a reopen/correction rides old timers instead of
  owning its continuation (`f7ead5e` family + V7-D).
- **DF5 orphaned reservation** — begin wrote a reservation; the action chain
  died; nothing bounded its expiry (V7-D).
- **DF6 invalid assessment target** — verdicts bound to the wrong artifact,
  ambiguous targets, or stale versions (V7-E).
- **DF7 redecision identity** — fingerprint blind to real changes or reacting to
  irrelevant ones; newer-empty grounding masked by an older revival (nex-5
  delivery-failure lineage + V7-E).

## Verification discipline (as of Milestone 1 close)

- Full suite at `cd442d7`: 1007 tests / 996 pass / **11 failures — byte-identical
  name set to the base `d9ea006` baseline** (`/tmp/fails_d.txt` vs run log).
- `tsc --noEmit` error set identical to HEAD; `tsc -p convex/tsconfig.json` clean.
- No new lint script invented; no live model, payment, signing, or merchant call.

## Milestone 2 — G/H/I/J complete (evidence: RELIABILITY_V7_EVIDENCE_MANIFEST.md)

| Item | Commit | Content |
| --- | --- | --- |
| G | `f97adc2` | Governed ResourceClass enum at the model boundary + adapter-owned fulfillment scope. Serial `request_resource`/`submit_result.missingInputs` accept only `GOVERNED_RESOURCE_CLASSES` (derived from the workforce catalog — no second hardcoded list); an off-vocabulary call is a counted structural refusal via a serial boundary `errorFunction` (invalid-input → `refused` + `trackActionOutcome`; anything else stays `transient_error`), preserving the F1 duplicate no-progress semantics. Legacy shape unchanged; owned classes remain schema-valid so the application's `already_owned` refusal is preserved. Fulfillment authority moved to declarations: live writeback requires the adapter-declared class bound into the attested fact (`canonicalM3DriverFact` + `acquisitionDeclaredResourceClass`) and refuses on mismatch/absence against the intent's authorized target class, storing the verified declaration instead of `"unknown"`; the simulated boundary refuses when the verified registry declares the service but disclaims the class; the Node driver carries the declaration through the outbox. Purpose scope is now typed-declaration-first (`purposeKind` accepts without prose scraping) with a negation-aware fail-closed gate — "do not infer causal uplift" no longer false-rejects, affirmative out-of-scope claims still refuse. Tests: `m61GovernedClassBoundary` (+5), `m61LiveAcquisitionBridge` (+4), `m61FirstProductE2E` (+1). Full suite 1016/1005 pass/11 fail — failing set identical to base; typecheck error set identical to HEAD; convex tsconfig clean; no signing/payment/merchant/provider/model invocation. |
| H | `72329bf` | Financial/result truth in the payment seam: no reverted→pending flattening, provider results bound to the exact normalized request. The `SettlementReader` observation is now a typed four-state surface (`settled` / explicit `pending` / observed `reverted` / observed `mismatch`); legacy boolean-only readers keep their exact prior REST semantics. The production composition maps `readAndVerifyXLayerSettlement` states 1:1 (extracted as the pure, tested `mapXLayerVerificationToObservation`) — an observed revert (receipt status 0x0 = proven non-settlement) or mismatch can no longer rest forever at `submitted`; the rail records them through M3's real lifecycle (`report_failure` from submitted → `reconciliation_required`) with the revert block/mismatch reason carried verbatim into the durable detail and a `recovery_event` wake — never a settled success, never blind repayment. `verifyResult` is now `verifyProductionM3Result`: protected-result shape truth AND identity binding of `requestId`/`offeringId`/`serviceId` to THIS intent's exact normalized request (a well-formed result issued for a different purchase refuses with a `m3-result-binding-rejected` proof naming the mismatch). Tests: `m61PaymentResultTruth` (+9). Full suite 1025/1014 pass/11 fail — failing set byte-identical to base; typecheck error set identical to HEAD; convex tsconfig clean; no signing/payment/merchant/provider invocation. |
| I | `4c2408e` | Opt-in verified external acquisition record/replay (`lib/payment/acquisitionRecordReplay.ts`). DISABLED BY DEFAULT: active only when `M3_VERIFIED_ACQUISITION_RECORD_DIR` is an absolute path (relative refused; unset means the production verifier wrapper is a byte-identical passthrough). RECORD plumbing only — no live record was obtained and no provider/merchant/network/wallet call exists in the path. Recording RECOMPUTES verification with the H production verifier (a claimed proof is never trusted): unverified or cross-bound results refuse with no file left behind; records are immutable (re-record of identical content is idempotent; different content for a requestId refuses). Replay is fail-closed at every step — disabled → loud throw; absent → throw ("will not fabricate"); content-hash drift → throw; stored payload must STILL verify bound to the REQUESTING intent/purchase identity (cross-request replay refused); success is labeled `recorded_replay`, never `live`/`simulation`. Composition wires `withAcquisitionRecording(verifyProductionM3Result)` at the rail and supervised-submit seams. Tests: `m61AcquisitionRecordReplay` (+5). Full suite 1030/1019 pass/11 fail — failing set byte-identical to base; typecheck error set identical to HEAD; convex tsconfig clean. |
| J | `cc3a71d` | V6 preserved + bounded reads + control-note retention. `getObjectiveListV1` collected EVERY objectives row (full management state each) to render ≤20 navigation summaries; it now reads the indexed `by_updatedAt` desc window of 20 (`OBJECTIVE_LIST_WINDOW`), the same discipline as `listObjectives`. The V6 envelope/contract is untouched: same grouping (needsYou/done/inProgress), same row keys, `contractVersion: 1`, and a bounded list never restricts a full workspace read (proved for an out-of-window objective). Control-note retention focused tests: same-identity notes replace in place preserving position and advancing only `at` (a recurring state is ONE note), distinct identities append, and the 40-note ceiling evicts oldest-first while the current-state note survives ceiling pressure. Tests: `m61V6BoundedRetention` (+3); existing V6 seam/render/bounded-list suites (60) still green. Full suite 1033/1022 pass/11 fail — failing set byte-identical to base; typecheck error set identical to HEAD; convex tsconfig clean. |

---

## Review corrections (final-review blockers R1–R4) — branch `fix/reliability-v7-review-blockers`

Reviewed base `integration/demo-replay-v6` @ `d9ea006`; reviewed candidate
`qoder/general-session-fyws0q` @ `3ce6e76` (17 ahead / 0 behind; 5990dc8→3ce6e76
docs-only, verified). Repair branch created from exactly `3ce6e76`. The attached
reviewer evidence bundle was not available in this environment; the reviewer's
probes were re-derived from the review text, run against the UNMODIFIED
candidate (all reproduced — see manifest §R), and ported into tests that import
the real modules.

### Plan (executed in this order)

1. Reproduce R1–R4 against `3ce6e76` (probes + R3 Convex tests).
2. Shared identity/scope contract (below), then R2+R4 together, then R1 on that
   boundary, then R3.
3. Focused tests → dependent-seam tests → full suite once on the frozen candidate.

### Shared identity / scope contract (R1, R2, R4 use ONE definition)

| Element | Definition |
| --- | --- |
| Scope vocabulary | `PURPOSE_SCOPES` / `GOVERNED_PURPOSE_KINDS` in `lib/workforce/catalog.ts` — the ONE governed requested-scope vocabulary (currently `founder_messaging_qualitative` → `proprietary_data`). Adapter declarations must be a subset (tested). |
| Proposed need | Worker gap may carry optional `purposeKind` (model tool enum = the governed list; same schema for every model). A proposal only. |
| Validated scope | `validateMissingInputProposal` → `ResourceNeed.requestedScope = {purposeKind, authority:"application"}` only if governed AND applicable to the class; unknown → `unknown_purpose_scope`, inapplicable → `purpose_scope_class_mismatch` (typed refusals, nothing coerced). Absent → need without scope. Scope joins `dedupeKey` and the fingerprint need identity only when present (legacy identities unchanged). Stored rows are re-checked by `validatedRequestedPurposeKind`. |
| Fulfillment declaration | Adapter-owned `M3_PRODUCT_FULFILLMENT_SCOPE` (unchanged). |
| Compatibility | `externalOfferingAcceptsPurpose`: validated kind ∈ declared kinds AND class ∈ declared classes AND prose has no affirmative out-of-scope claim. No kind → incompatible. Keyword acceptance deleted (grounding and merchant). |
| Intent | `ExecutionIntent.requestedPurposeKind` bound at dispatch from the bound need's validated scope (null otherwise). |
| Authorized request | `m3AuthorizedRequestFromIntent` — requestId, provider, service, offering, class, kind, `normalizeM3Purpose(purpose)` (trim → 500 → trim; same function for header, merchant echo, verifier). Incomplete/undeclared authority refuses; no demo-product fallback. |
| Purchase identity | `purchaseIdentityFromIntent` (unchanged; note `resourceNeedId` = `intent.requirementKey` by that mapping's convention). |

### Acceptance criteria and status

| ID | Acceptance | Status |
| --- | --- | --- |
| R1 | One canonical authenticated binding (intent, purchase, authorized request, strict result, contentHash, proof; HMAC-SHA256, domain-separated, dedicated `M3_VERIFIED_ACQUISITION_RECORD_KEY`); returned content = verified result content; strict runtime parse; whole-binding idempotency; exclusive create (`link` EEXIST, no overwrite); disabled default; key-less refuses; legacy v1 refuses; replay non-executing, `recorded_replay`, source provenance preserved; recording failure throws → purchase stays `result_received`, no repay/re-sign. | Done — `tests/v7ReviewR1R2Binding.test.ts` (R1 ×8), `tests/m61AcquisitionRecordReplay.test.ts` (ported ×5) |
| R2 | Purchase ↔ intent identity; complete adapter-declared target authority; strict result shape (provider, evidence, payload, exact limitation); exact provider/service/offering/class/request/scope/normalized-purpose binding; merchant request refused before signing on incomplete authority. | Done — `tests/v7ReviewR1R2Binding.test.ts` (R2 ×9), `tests/m61PaymentResultTruth.test.ts` (H3c inverted: no demo-offering fallback) |
| R3 | Apply only for the current pending reservation (exact accepted idempotency kept); no double count; stored deadline + one bounded re-arm; expiry hands back to `beginInterpretation` → next attempt or explicit `escalated`. | Done — `tests/v7ReviewR3InterpretationFence.test.ts` (×8) |
| R4 | Validated structured scope through the real grounding→authorization→request→verification path; paraphrases stable; signal-word prose not eligible; missing/unknown/conflicting scope fails closed; supported acquisition still works; no forced strategy/provider. | Done — `tests/v7ReviewR4PurposeScope.test.ts` (×8, real Convex path), whole-chain asserts intent scope |

### Current checkpoint

- `31040a1` code + focused tests; `6ea58da` R4 fixture/twin updates; `ff2394d`
  fence-dependent test updates = **frozen corrected code candidate and gate SHA**.
- Gate on `ff2394d`: 1066 tests / 1056 pass / 10 fail (failing names and assertion
  locations identical to `3ce6e76` on this machine: 1033/1023/10); root typecheck 55,
  identical set; Convex typecheck clean; Next build compiles then fails on the identical
  inherited 55-error type-check set. Commits after `ff2394d` are docs-only (manifest §
  "Review corrections" has the diff proof command).
- Status: READY FOR INDEPENDENT RE-REVIEW (not self-approved).

### Findings carried (classified)

| Finding | Class | Blocker | Action / revisit |
| --- | --- | --- | --- |
| Rich correction context loses unknowns/recommended action after reopening (rationale + locked criteria remain) | Park for Later | No | Revisit when correction-quality regressions appear in a gate run. |
| Associated history reads unbounded within the 20-Objective list window | Park for Later | No | Revisit when list latency/IO is measured or history grows. |
| Historical ResourceNeeds entering current-revision decision fingerprints | Investigate Now | No (not required by R1–R4; the R4 change only appends scope to need identity) | Next reliability pass. |
| Recorded-replay ingestion and MAKE-resume integration unproven (replay has no production consumer; only recording is wired) | Investigate Now | No | Before any replay-backed demo. |
| Worker-proposed kind is validated for vocabulary + class applicability and bounded by prose refusal, obligation/evidence validation, spend grant and M3 approval — but its semantic fit to the question is not independently verified | Investigate Now | No for this repair (no new authority; missing scope fails closed) | Revisit before adding a second scope/adapter or any non-test spend. |
| Interpretation apply-REFUSAL (model answered unusably) still has no automatic re-begin (documented as founder-wake driven; no founder re-begin path exists) — expiry now owns its continuation | Investigate Now | No (pre-existing; R3 scope was expiry/late callbacks) | Next reliability pass. |
| Manager-initiated BUY (no validated need) can no longer buy the purpose-scoped product | Accept (intended R4 behavior) | No | Reviewer to confirm. |
| Pre-existing authorized intents without `requestedPurposeKind` are refused before signing | Accept (fail-closed, no fictitious migration) | No | — |
| Inherited root typecheck/test debt | Ignore / Accept Risk | No | Regression-compared, not repaired. |
