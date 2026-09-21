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
- Started act-now from: `b5e6d52c2a21aeadb35062de978a37be6b0be0d0`
- Preserved: `stash@{0}` free-model experiments; untracked `scripts/_tmp-*`
- Worktrees left alone

## Checkpoint

- Pushed SHA: _(pending this commit)_
- Next: worker input package + action-scoped acquisition + artifact target

## Shared contracts (act-now progress)

- [x] `requirementKind: "deliverable" | "input"` — explicit semantic discriminator
- [x] Serial deliverable + BUY keeps deliverable proofs (receipt ≠ output)
- [x] `isSerialInputRequirement` replaces proof-derived input-only on serial path
- [x] Production seam: DELIVERABLE + verified BUY → clear strategy, stay active
- [ ] Worker input package (application-loaded)
- [ ] Action-scoped `inputEvidenceIds` + `targetArtifactKey`
- [ ] Terminal lifecycle / typed tool status
- [ ] Semantic evidence-gap (no NOT_AVAILABLE required)
- [ ] Serial spend bound as factual context (no keyword demotion)
- [ ] Final semantic assessment + whole-chain harness

## Do not

- Deploy or run physical Gate 1
- Live model / live M3 / Gate 2
- Pop `stash@{0}` or touch unrelated untracked files

## Next (implementer)

Continue same branch/chat: worker package + acquisition scope + artifact target,
then terminal hardening, semantic gap/spend, final assessment + chain harness.
