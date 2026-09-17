# Invariant Review & Scenario-Coupling Audit — Overnight Run

Status: COMPLETE
Reviewed integration SHA: `281a8a9b6ea1a29a5bb6196ffdd08c603029b0f7`
Reviewer: PRIMARY (Lane E responsibilities absorbed — children were stood down after the shared-worktree git-contamination incident; see ACTIVE_TASK.md ledger).

## 1. Scenario-coupling audit (§34)

Searched generic runtime for: `Newsliquid`, `FlyBeacon`, `xbird`, `launch`, `canonical`, `BUY1`, `BUY2`, `phase1`, `phase2`.

### Occurrences and classification

| Location | Strings | Classification | Verdict |
|---|---|---|---|
| `lib/market/registryData.ts` | Newsliquid/FlyBeacon/xbird service ids | verified service registry DATA | ACCEPTABLE (§14, §34) |
| `lib/market/snapshotData.ts` | provider offerings | synchronized snapshot DATA | ACCEPTABLE |
| `lib/providers/newsliquid.ts` | Newsliquid | provider adapter | ACCEPTABLE (§10, §26) |
| `lib/providers/xbird.ts` | xbird | provider adapter | ACCEPTABLE |
| `lib/providers/registry.ts` | newsliquid/xbird adapter map | adapter composition (provider layer) | ACCEPTABLE |
| `lib/objective/seedData.ts` | launch scenario text | seed/demo DATA | ACCEPTABLE (§32) |
| `lib/workforce/catalog.ts` | `growth_launch_operations` | generic reusable capability key (not demo-specific; "launch" = growth/launch operation class per §9) | ACCEPTABLE |
| `tests/*.test.ts` (canonicalM2, market, provider-adapters, resourceNeed) | provider names | fixtures/tests | ACCEPTABLE (§34) |
| `docs/work/*.md` | all | docs | ACCEPTABLE |
| `app/readModel.ts`, `lib/objective/artifact.ts`, `lib/objective/orchestration.ts` | "launch"/"Newsliquid" in COMMENTS only | comments asserting the names must NOT appear as logic | ACCEPTABLE (no code branch) |

### FORBIDDEN locations — verified CLEAN (zero code occurrences)

- `lib/sourcing/**` (policy + domain): CLEAN
- `lib/objective/orchestration.ts`, `resourceNeed.ts`, `sourcing.ts`, `types.ts` (logic): CLEAN
- `lib/payment/**` (generic lifecycle/challenge/purchase/buyerRail): CLEAN
- `lib/market/discovery.ts`, `registry.ts`, `assessment.ts` (generic logic): CLEAN
- `lib/providers/types.ts` (generic adapter contract): CLEAN
- `convex/**`: CLEAN
- `app/ObjectiveWorkspace.tsx` component logic: CLEAN (no provider/scenario branching)
- `app/readModel.ts` selectors: CLEAN (branch only on generic status/verdict/state unions)

Conclusion: **no improper scenario coupling in generic runtime.** All provider/scenario identity lives in adapters, registry/snapshot DATA, seed data, fixtures and docs.

## 2. Invariant review

### Duplicate sourcing authority — PASS
`lib/sourcing/policy.ts::evaluateSourcingPolicy` is the single MAKE/BUY/BLOCKED rule. `lib/objective/orchestration.ts::sourceResourceNeed` and `lib/objective/sourcing.ts::decideObjectiveSourcing` both ADAPT to it; neither re-derives a decision. `objectiveStateForSourcing` is a pure state-mapping helper, not a second sourcing rule. `sourcingSeam.test.ts` guards that no second `decision:"BLOCKED"` literal reappears in planner.ts.

### Provider self-approval — PASS
The worker's `request_resource` tool only proposes {resourceClass, purpose, reasonOwnedInsufficient}. It cannot set provider, status, approval, spend or fulfilled. Provider selection emerges from discovery + registry validation + generic assessment + the kernel. The approved provider path is constructed by application code (`approvedPathFor`) keyed by exact resource class, never by the model.

### Completion bypass — PASS
`evaluateCompletion` still requires application-observation evidence, distinct-source proofs, the structured result, and any `requiredVerifiedEffectKeys` to be independently `verified`. A `buy_pending` need is an unresolved required resource; the objective sits in `waiting_for_resource` and is not "completed". Growth-role completion requires an actual artifact version bump (`hasArtifactChanged`), not advice.

### M1 compatibility — PASS
Union members were appended, never removed/reordered (`ObjectiveState`, `WorkItemState`, `CapabilityKey`, `ToolPermissionId`). `sourcingReason`/`workItem`/`objectiveRecord` validators keep prior optional fields. Existing M1 rows still load. Full suite (M1 tests: objective, planner, runLifecycle, worker, workforce, ui, sourcing, sourcingSeam) green at 255/255.

### Stale run / resource resume — PASS (design) 
Leases/fencing/stale-write protection unchanged from M1 (`runGuards.ts`, `expireRun`, `fenceRunWrite`). The waiting→resume flow is modelled: a need in `buy_pending` holds the objective in `waiting_for_resource`; on fulfillment the application can start a new bounded run (the `executing → waiting_for_resource → fulfilled → new run resumes` shape). Live Convex resume execution is founder-gated (requires deployment + creds), so it is IMPLEMENTATION-READY, not live-proven.

### Payment safety (M3) — PASS
Lane M3 tests (72) enforce: no sign/pay without approval; dynamic 402 term binding (network/asset/payTo/amount from the live challenge, never hardcoded); wrong-network/over-amount/asset-or-recipient-mutation rejected; submitted≠settled≠verified; ambiguous state requires reconciliation; retry cannot double-pay; two purchases never share an idempotency key; first purchase cannot authorize the second; secrets never serialized; testnet/mainnet fail-closed separation. The rail STOPS at `READY_TO_SIGN`. `FakeSigner` uses only a dummy address — no real secret.

### Secret boundary — PASS
`lib/payment/**` never stores a private key. `lib/providers/xbird.ts` keeps BYOA `authToken`/`ct0` local and excludes them from `ExternalResourceResult`/provenance (asserted by a fixture test). No env credentials are read into persisted shapes.

## 3. Boundaries respected (no unattended external effects)

No wallet creation, no signing, no transaction submission, no spend, no founder X credentials, no publishing, no paid provider call, no mainnet action. All provider/payment behaviour is proven with offline fixtures and read-only recorded probe data.

## 4. Residual gaps (honest)

- `tests/growthWorker.test.ts` was not produced by Lane C; PRIMARY verified tool materialization + no-spend-grant with a throwaway probe and the growth capability definition is covered indirectly. LOW risk; recommend a dedicated test before M5.
- Full live Convex resume (waiting→fulfilled→resumed run) is not exercised end-to-end because no deployment/credentials are present in this environment. It is IMPLEMENTATION-READY; live acceptance is founder-gated.
- Discovery uses the synchronized snapshot as primary; no supported official OKX programmatic discovery primitive was confirmed (Lane B finding). The `MarketDiscovery` interface is replaceable when one is available.
