# Reliability V7 — Evidence Manifest

Candidate branch: `qoder/general-session-fyws0q`
Base: `integration/demo-replay-v6` @ `d9ea006d24a77dc20aecb057786fbb26ad1aa62b`
Manifest SHA: recorded in the commit that adds this file; the gate ran on the exact
frozen candidate SHA named at the end of this document.

Every claim below is backed by a named commit and a named test/log artifact.
Nothing here claims a live payment, a verified replay record in production, a
model run result, or a deployment.

## 1. Item → commit → focused test map

| Item | Scope | Code commit | Ledger row | Focused tests |
| --- | --- | --- | --- | --- |
| A | Complete, correctly-scoped edit context for writing workers | `46aee4d` | `894c669` | `tests/m61SerialManagerLoop.test.ts`, `tests/m61ProductionWholeChain.test.ts` (spine asserts full-replacement view) |
| B | Source/accepted-output continuity; raw terminal is never "accepted" | `46aee4d` | `894c669` | `tests/m61ActNowTerminalAndChain.test.ts`, `tests/reliabilityScenarios.test.ts` (DF3/case-4 + case-4b) |
| C | Quality handoff: lockedCriteria + correction package in observation | `46aee4d` | `894c669` | `tests/reliabilityScenarios.test.ts` (DF1/case-1 asserts `lockedCriteria` in the worker observation), `tests/m61ProductionWholeChain.test.ts` |
| D | Deduped reopen continuation + request-bound reservation expiry (decision/assessment/interpretation) | `ab70edf`, `3325ea9` | `894c669` | `tests/managementWorkerContinuation.test.ts`, `tests/reliabilityScenarios.test.ts` (DF5 scenarios + armed `_scheduled_functions` audits) |
| E | Real decision-fingerprint facts; latest-attempt grounding; version-true assessment reuse | `adf508f` | `894c669` | `tests/m61StopBRedecide.test.ts`, `tests/m61PostAcquisitionResume.test.ts`, `tests/helpers/fingerprintOracle.ts` |
| F | Deterministic scenario harness over the 7 historical defect families | `cd442d7` | `894c669` | `tests/reliabilityScenarios.test.ts` (14 named cases), `tests/fixtures/reliability/world.ts` |
| G | Governed ResourceClass enum at the model boundary + adapter-owned fulfillment scope | `f97adc2` | `170c8b2` | `tests/m61GovernedClassBoundary.test.ts` (+5), `tests/m61LiveAcquisitionBridge.test.ts` (+4), `tests/m61FirstProductE2E.test.ts` (+1) |
| H | Settlement truth (no reverted→pending flattening) + result bound to exact request | `72329bf` | `81a7630` | `tests/m61PaymentResultTruth.test.ts` (+9) |
| I | Opt-in verified acquisition record/replay (disabled by default, fail-closed, RECORD plumbing only) | `4c2408e` | `613ccdd` | `tests/m61AcquisitionRecordReplay.test.ts` (+5) |
| J | V6 preserved + bounded product list read + control-note retention | `cc3a71d` | `5990dc8` | `tests/m61V6BoundedRetention.test.ts` (+3) |

## 2. Verification discipline per item (what was actually observed)

For every item commit above, the following were run and recorded:

- Full suite: `npx tsx --test "tests/**/*.test.ts"` — 1033 tests / 1022 pass /
  11 fail at the final candidate. The 11 failing names are byte-identical to the
  base `d9ea006` baseline (`/tmp/fails_d.txt`; per-item diffs `FAIL_SET_IDENTICAL_TO_BASE`).
- Typecheck parity: `npx tsc --noEmit -p tsconfig.json` error set identical to HEAD
  baseline (38 lines, compared with `diff <(sort -k2 …) <(sort -k2 …)`).
- Convex typecheck: `npx tsc -p convex/tsconfig.json --noEmit` — clean (0 errors).
- No new lint script was invented; none exists in `package.json`.
- No model, payment, signing, wallet, merchant, or provider network call was made
  by any focused test named above.

## 3. Item-I evidence truthfulness (explicit non-claims)

- `lib/payment/acquisitionRecordReplay.ts` provides RECORD and REPLAY *plumbing*
  only. It is DISABLED BY DEFAULT: active only when `M3_VERIFIED_ACQUISITION_RECORD_DIR`
  is an absolute path.
- The 5 focused tests create records only from locally BUILT fixture payloads
  (`buildM3ProtectedSuccess`). They prove: a disabled gate is a passthrough; unverified /
  cross-bound results refuse to record; records are immutable and identity-bound;
  tampered content fails its hash; absent records fail closed; success is labeled
  `recorded_replay` — never `live`, never `simulation`.
- There is NO verified external acquisition record in this repository. No replay
  against a genuine provider payload was performed. Claims of "verified replay"
  would be false and are not made.

## 4. Canonical promotion gate (run ONCE on the frozen candidate)

Per `docs/work/M6_1_MANAGER_EXECUTION_REFACTOR_PLAN.md` §7: the repository exposes
`npm test`, `npm run typecheck`, `npm run typecheck:convex`, `npm run build` as
the release gate. It was inspected, then run once against the frozen candidate.

Results: see §5. A single risk-specific extra check beyond the gate is not needed:
each item already shipped focused tests, and the full-suite failure set is proven
identical to base.

## 5. Gate results and base-failure classification (as observed)

Frozen candidate: `cc3a71d` (code) / `5990dc8` (branch tip incl. its ledger row);
the gate ran on `5990dc8` with only this manifest untracked.

| Gate step | Observed result | Base comparison |
| --- | --- | --- |
| `npm test` | exit 1 — 1033 tests / 1022 pass / 11 fail | failing-name set byte-identical to base (`GATE_NPM_FAILSET_IDENTICAL_TO_BASE`) |
| `npm run typecheck` | exit 1 — 38 errors | error set identical to base: `tsc --noEmit` run at `d9ea006` in a temporary worktree produced the SAME 38-line set (`BASE_AND_HEAD_TSC_IDENTICAL`) |
| `npm run typecheck:convex` | exit 0 — clean | same at base |
| `npm run build` | exit 1 — `✓ Compiled successfully in 4.0s`, then `Failed to type check.` | the failure is the same 38-error project typecheck; since that set reproduces byte-identically at base, `next build` fails at base for the same reason (the base build itself could not run in this sandbox: the temp worktree's node_modules symlink is rejected by Turbopack — classification therefore rests on the reproduced identical tsc set, not on a base build log) |

Gate verdict: **PARTIAL** — every V7-introduced behavior is green and the
failure sets are proven pre-existing, but the canonical gate is not fully green
because the candidate inherits the base's 38 project-typecheck errors (test-file
index/type expectations stale against generated Convex types). Fixing those is
base-line debt outside this task's bounded scope (they are concentrated in the
same files as the 11 failing tests below) and is recorded here as the top
follow-up, not silently absorbed.

The 11 failing test names (byte-identical at base `d9ea006`, verified by running
that file at base in a temporary worktree for the bundle case) classify as:

| Family | Failing tests | Classification | Basis |
| --- | --- | --- | --- |
| M2 legacy obligations (A6 growth/contract rows) | 4 in `tests/m2LegacyObligations.test.ts` | Investigate Now (base) | Pre-existing at `d9ea006`; A6-era expectation drift, unrelated to V7 scope |
| Decision eligibility (CP4 / F4 / hybrid grounding) | 4 in `m61CausalPipelineCp4`, `m61DiagnosisToExternalIntent`, `managementDecision` ×2 | Investigate Now (base) | Pre-existing at base; grounded-option eligibility drift, no V7 file touched |
| Finish-gate controlNote spine (M2-legacy vs M4-managed) | 2 in `tests/managementFinishGate.test.ts` | Park for Later (base) | Pre-existing at base; legacy/M4-managed classification drift in spine expectations |
| Convex browser-bundle | 1 in `tests/managementRuntime.test.ts` ("bundles without node:crypto") | Accept Risk (environmental) | Fails identically at base: the sandbox `esbuild` binary is not executable here (`ELF` exec error), so the test cannot bundle at all. Not a code defect; CI with a working esbuild is required to clear it. |

None of the 11 failures was introduced by this task: the failing-name set is
byte-identical to the base at every item checkpoint (G, H, I, J logs).

## 6. Explicit non-claims (unchanged through the end)

- No claim of Luna 5/5 or Nex-mini 5/5, and no model-countered completion claim:
  no model was invoked by this work.
- No payment, settlement, signing, wallet, or merchant call was performed or
  claimed; item H changed only how observed facts are carried.
- No verified external acquisition record exists or was replayed; item I is
  plumbing + tests only.
- No merge to the integration branch, no deploy, no cloud Convex consumption.
- No model-name branching, forced BUY, proof relaxation, financial/budget
  inflation, or canonical-demo choreography was added.
