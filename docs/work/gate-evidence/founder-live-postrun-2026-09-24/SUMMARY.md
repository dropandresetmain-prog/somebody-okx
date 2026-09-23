# Final candidate gate — fix/founder-live-postrun

Candidate SHA: `f4d9542ca41c891ec58464ece84ebe625c322d2f`
Base (founder-E2E readiness): `2d3aef24105ffac4e432e6fc903c870a9be64cc9`
Base's own baseline: `3608e2ccec875b2dfdd61e0233a27145bcc79208` (main, J4 promoted)

Commits in this branch beyond the readiness base (`2d3aef2..HEAD`):

```
5024658 docs(evidence): preserve first successful founder live run
d0825dc fix(management): make accepted completion terminal and monotonic
5db5df3 fix(ui): make the final deliverable unmistakable on objective completion
7b275a7 fix(product): hide internal/gate/eval/demo Objectives from product sidebar
3363828 fix(ui): make founder-live liveness animation clearly visible
6ac8b9e Merge Incident #4 fix: product sidebar Objective visibility
a65ddaa Merge Incident #2 fix: make the final deliverable unmistakable
6cab9dc fix(test): give the FinalDeliverable workspace fixture a liveness field
8526f21 Merge Incident #3 fix: make the liveness animation clearly visible
f4d9542 fix(test): repair post-merge regression and document a pre-existing tsc quirk
```

## Test gate (excl. hanging `tests/m3GateInterpretationCeilingEscalates.test.ts`, same exclusion as the readiness base)

| | tests | pass | fail |
| --- | --- | --- | --- |
| readiness base `2d3aef2`/`c18b1e9` (recorded) | 1216 | 1206 | 10 |
| this candidate `f4d9542` | 1242 | 1232 | 10 |

Tests added: **26** (9 `terminalCompletionFence`, 5 `objectiveProductVisibility`, 8 `finalDeliverable`, 4 `objectiveHeaderLivenessIndicator`) — matches 1242 - 1216 exactly.

Failing-file set: **identical to the readiness base**, verified by name against
`docs/work/gate-evidence/founder-e2e-readiness/candidate-suite.txt`:

- `tests/m2LegacyObligations.test.ts` (4 cases: A6 growth/M4-managed exemption cases)
- `tests/m61CausalPipelineCp4.test.ts` (CP4 BUY eligibility case)
- `tests/m61DiagnosisToExternalIntent.test.ts` (F4 integration case)
- `tests/managementDecision.test.ts` (2 cases: fully-eligible internal path, hybrid option grounding)
- `tests/managementFinishGate.test.ts` (2 cases: M2-legacy / M4-managed spine completion)

No new candidate failure. Full run log: `candidate-suite.txt` in this directory.

One regression surfaced and was fixed during this gate: `tests/m61V6BoundedRetention.test.ts`'s
J1 bounded-window test seeded rows with no `productVisibility` field, so after merging the sidebar
visibility filter (Incident #4) it read 0 rows instead of 20 — unrelated to what J1 actually tests
(the bounded/indexed read window), so its seed helper now marks rows `"visible"`. Fixed in
`f4d9542`; not present in the final run above.

## Typecheck

- **Convex tsc** (`npx tsc --noEmit -p convex/tsconfig.json`): **clean**, same as the readiness base.
  See `candidate-convex-tsc.txt` (empty).
- **Root tsc** (`npx tsc --noEmit`): inherited error set, same class of pre-existing failures as the
  readiness base (Jev eval scripts, `scripts/gate/preflight.ts`, several `tests/m61*`/`m2*` files
  with unrelated pre-existing type gaps). One addition: `tests/terminalCompletionFence.test.ts` now
  also hits the same pre-existing convex-test ctx/schema type-inference limitation already present
  in `tests/v7ReviewR4ScopeOrigin.test.ts` (factoring a `t.run(...)` Convex query into a helper
  function loses the schema generic). This is a `tsc`-only cosmetic gap with zero runtime effect —
  all 9 tests in that file pass — and is documented inline at the helper functions. See
  `candidate-root-tsc.txt` for the full list.
- Next build was not re-run for this gate (no build-affecting dependency or config change was made;
  all changes are within already-building `app/product/*` and `convex/*` modules already covered by
  the tsc checks above).

## Scope confirmation

- `objectiveRunner.ts`: untouched.
- `JEV_OPTION_SELECTION_ENABLED`: untouched, remains `false` (verified: no edits to any
  `lib/management/jevStage3.ts`/Jev file in this branch's own diff).
- No BUY/M3/payment file touched.
- No model prompt or `AI_MODEL` change.
- No new Founder E2E was run; all verification used the existing test harness and the one
  already-running local Convex deployment's preserved historical data (read-only).
