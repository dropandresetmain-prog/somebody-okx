# ACTIVE TASK — M6.1 manager–execution mini-refactor

Updated: 21 September 2026 (Singapore)
Status: **BLOCKS 1–2 CANDIDATE READY FOR OWNER REVIEW / M6.1 NOT ACCEPTED / GATE 1 NOT RUN**

## Goal

Somebody chooses one bounded MAKE or BUY action, receives its actual result,
reassesses, and continues until it delivers a persisted, evidence-backed
relaunch recommendation.

## Branch / base

- Branch: `refactor/m6-1-manager-execution-loop`
- Started from: `e8de0849e66f15ec8288de669c1dc5ab8187993c`
- Preserved: `stash@{0}` free-model experiments; untracked `scripts/_tmp-*`
- Worktrees left alone

## Shared contracts implemented

- `management.executionProtocol: "m61_serial_v1"` set at `applyInterpretation`
- Absent/legacy keeps HYBRID + old ceremonies readable
- `WorkerResultInput.terminal`: `DELIVERED` | `NEEDS_INPUT` | `EXECUTION_ERROR`
- Serial: no compound HYBRID ground/offer/dispatch; ≤1 current action
- Verified BUY (non input-only) → clear strategy → management redecide
- Artifact mutation required only when proofs demand `company_artifact_version`
  (and `expectedOutput` present when attaching that proof)
- Historical `lastDeliveryFailureClass` / INPUT_BLOCKED = diagnostic only

## Execution checklist

- [x] Verify base/local state and trace the production loop
- [x] Record contract choices; implement shared seams
- [x] Focused production-seam tests green (see below)
- [ ] Owner review of changed authority/completion/concurrency
- [ ] Gate 1 live-model (owner) — NOT run
- [ ] Reconcile ARCHITECTURE/MASTER_PLAN at verified milestone

## Focused checks (this candidate)

- `tests/m61SerialManagerLoop.test.ts` — **12/12 pass**
- `tests/m61DiagnosisToExternalIntent.test.ts` — **4/4 pass**
- `tests/m61PostAcquisitionResume.test.ts` — **7/7 pass**
- `tests/m61ConsistencyRepair.test.ts` — **9/9 pass**
- `tests/m61InputDiagnosis.test.ts` + `m61ZeroProgress` — **26/26 pass**

## Known gaps (do not claim Gate 1)

- Full unseeded interpret→…→BUY→sim→MAKE→artifact→completion is
  **composed from seam tests + thin interpret→MAKE→dispatch**; not yet one
  single unbroken harness matching every Gate 1 sentence.
- Live-model Gate 1 not run. No deployment asserted for this candidate.
- Pre-existing: `managementDecisionPass` I3 provenance expectation mismatch
  (`provider_quote` vs `registry_data`) — Park for Later.

## Next (owner)

Review this candidate; decide whether to proceed to focused review and
physical Gate 1. Implementer must not declare M6.1/Gate 1 PASS.
