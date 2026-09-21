# ACTIVE TASK — M6.1 manager–execution mini-refactor

Updated: 21 September 2026 (Singapore)
Status: **GATE 1 CANDIDATE DEPLOYED / PHYSICAL GATE 1 NOT RUN**

## Goal

Somebody chooses one bounded MAKE or BUY action, receives its actual result,
reassesses, and continues until it delivers a persisted, evidence-backed
relaunch recommendation.

## Branch / base

- Branch: `refactor/m6-1-manager-execution-loop`
- Astra-approved Gate 1 candidate SHA: `a0ee4fe18febda01cd049513e08f9bd7e196b50d`
- Implementation closure SHA (code under candidate): `0feefcd`
- Preserved: `stash@{0}`; untracked `scripts/_tmp-*`

## Deployment checkpoint (Gate 1 preflight)

- **Deployed SHA:** `a0ee4fe18febda01cd049513e08f9bd7e196b50d`
- **Environment:** Convex development `clean-tapir-151` (`dropandreset-main` /
  `somebody-okx`, dev deployment `somebody-okx-m1`)
- **URL host:** `clean-tapir-151.convex.cloud` (from local `NEXT_PUBLIC_CONVEX_URL`)
- **Command:** `npx convex dev --once` (21 Sep 2026 ~19:43 +08)
- **Result:** success — Convex functions ready (~14.7s)
- **Convex CLI / package:** `1.45.0`
- **Gate 1 physical run:** **NOT RUN** (no fresh canonical Objective created in
  this pass)
- **Next action:** fresh execution chat for **physical Gate 1 Run #1** on this
  deployment and pinned runtime configuration

### Sanitized runtime configuration (deployment env)

| Variable | Present | Notes |
| --- | --- | --- |
| `AI_PROVIDER` | yes | `openrouter` |
| `AI_MODEL` | yes | `deepseek/deepseek-v4.1-flash` (founder-approved paid pin) |
| `LIVE_AI_ENABLED` | yes | `true` |
| `SOMEBODY_DEMO_OPERATOR_TOKEN` | yes | operator gate configured |
| `OPENROUTER_API_KEY` | yes | not logged |
| `M4_M3_EXECUTION_ENABLED` | **absent** | live M3/payment execution disabled |

Local `.env.local` still lists a free-tier `AI_MODEL` for probes; **server-side**
model selection for Gate 1 follows Convex deployment env above.

### Post-deploy smoke (minimal)

- `scripts/_tmp-m61-conn-preflight.mjs`: 8/8 `listObjectives` reads OK; operator
  path OK; IPv4 TCP/TLS OK
- `objectives.listObjectives` reachable; `m3Driver.simulationCandidate` operator
  gate refuses bad token; read path OK on historical objective
- No fresh Objective created; no physical loop attempted

### Prior accepted evidence (not re-run this pass)

- Pass-3 fixer finalization / focused closure tests and clean `typecheck:convex`
  recorded at `0feefcd` / `a0ee4fe` docs checkpoint

## Checkpoint (finalization pass — complete)

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

### Remaining physical acceptance

- [ ] Physical Gate 1 Run #1 (live models on deployed candidate; acquisition
      boundary simulated only)
- [ ] Gate 2

## Do not

Resume historical failed Objectives / live payment / Gate 2 / M6.2 / merge to
main / touch `stash@{0}` without explicit instruction
