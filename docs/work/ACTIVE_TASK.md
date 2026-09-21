# ACTIVE TASK — M6.1 manager–execution mini-refactor

Updated: 21 September 2026 (Singapore)
Status: **FIXER FINALIZATION/EVIDENCE CLOSURE COMPLETE / NOT GATE 1 PASS**

## Goal

Somebody chooses one bounded MAKE or BUY action, receives its actual result,
reassesses, and continues until it delivers a persisted, evidence-backed
relaunch recommendation.

## Branch / base

- Branch: `refactor/m6-1-manager-execution-loop`
- Pass-3 start SHA: `7d49913`
- Preserved: `stash@{0}`; untracked `scripts/_tmp-*`

## Checkpoint

- Starting SHA: `7d49913990ff3ea8dd8251b62c0b65ecea235e42`
- Final pushed SHA: `0feefcd`

## This pass (finalization-and-evidence)

### Completed implementation

- [x] Serial result-contract alignment: `allowEmptyRisksUnknowns` on serial
      WorkContracts; `evaluateCompletion` accepts empty risks/unknowns arrays
      when permitted; missing/malformed arrays still fail; legacy nonempty kept
- [x] Correction test uses production `executeWorker` + worker-model double;
      no workItems/run replacement after dispatch; no force-delivery bookkeeping
- [x] `executeWorker` seam asserts `completed===true`, empty `unmet`, durable
      run/WI state, matching `worker_result` wake; Objective stays separate
- [x] Convex tsc: assessment return typing + observation provenance narrowing

### Tested seams (behavioral regressions; not physical Gate 1)

- [x] Serial empty risks/unknowns finalize via production WorkContract + finishRun
- [x] Negative → corrective new run → real artifact revision → WI finalize →
      assessment #2 → completed (no post-rejection state repair)
- [x] Old assignment cannot satisfy corrective action
- [x] Second negative → explicit `blocked` stop
- [x] `executeWorker` seam completed + wake evidence
- [x] F/G production whole-chain regressions still pass

### Remaining physical acceptance (do not run in this pass)

- [ ] Physical Gate 1 (live models / deploy / real payments)
- [ ] Gate 2

## Do not

Deploy / physical Gate 1 / live models / live payment / Gate 2 / touch stash@{0}
