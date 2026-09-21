# ACTIVE TASK — M6.1 manager–execution mini-refactor

Updated: 21 September 2026 (Singapore)
Status: **ACT-NOW CANDIDATE READY FOR OWNER REVIEW / NOT GATE 1 PASS**

## Goal

Somebody chooses one bounded MAKE or BUY action, receives its actual result,
reassesses, and continues until it delivers a persisted, evidence-backed
relaunch recommendation.

## Branch / base

- Branch: `refactor/m6-1-manager-execution-loop`
- Recovery: `recovery/m61-b5e6d52-pre-actnow` @ `b5e6d52`
- Act-now start: `b5e6d52`
- Preserved: `stash@{0}`; untracked `scripts/_tmp-*`

## Checkpoint

- Pushed SHA: `83f4d1fabb4cd638e83bce36ed42d27578b732e0`
- Prior act-now: `4177916` (requirementKind), `a01e6d2` (worker/acq/artifact)
- Next: **OWNER REVIEW** of act-now candidate. Do not deploy / physical Gate 1.

## Done (act-now)

- [x] `requirementKind` + BUY does not satisfy deliverable (prod seam)
- [x] Worker `loadedInputPackage` (company records, artifact, prior, linked)
- [x] Action-scoped `inputEvidenceIds` + `targetArtifactKey` on WorkContract
- [x] `update_company_artifact` mutates bound key; cites only linked IDs
- [x] Terminal idempotency / NEEDS_INPUT ≠ auto INPUT_BLOCKED / post-terminal refuse
- [x] Typed tool status on serial (no prose failure class)
- [x] Semantic evidence-gap (no NOT_AVAILABLE required)
- [x] Serial spend bound as factual context (no keyword demotion)
- [x] Final semantic assessment + unbroken chain harness + concurrent-wake fence

## Do not

Deploy / physical Gate 1 / live model / live M3 / Gate 2 / touch stash@{0}
