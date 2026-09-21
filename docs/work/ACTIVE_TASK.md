# ACTIVE TASK — M6.1 manager–execution mini-refactor

Updated: 21 September 2026 (Singapore)
Status: **ACT-NOW FIXES IN PROGRESS / NOT READY FOR LIVE GATE 1**

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

- Pushed SHA: _(pending this commit)_
- Next: terminal lifecycle + typed tool status; then semantic gap/spend;
  final assessment + whole-chain harness

## Done

- [x] `requirementKind` + BUY does not satisfy deliverable (prod seam)
- [x] Worker `loadedInputPackage` (company records, artifact, prior, linked)
- [x] Action-scoped `inputEvidenceIds` + `targetArtifactKey` on WorkContract
- [x] `update_company_artifact` mutates bound key; cites only linked IDs

## Remaining act-now

- [ ] Terminal idempotency / NEEDS_INPUT ≠ auto INPUT_BLOCKED / post-terminal refuse
- [ ] Typed tool status (no string-based failure class on serial)
- [ ] Semantic evidence-gap (no NOT_AVAILABLE required)
- [ ] Serial spend bound as factual context (no keyword demotion)
- [ ] Final semantic assessment + unbroken chain harness

## Do not

Deploy / physical Gate 1 / live model / live M3 / Gate 2 / touch stash@{0}
