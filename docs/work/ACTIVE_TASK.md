# ACTIVE TASK — Somebody × OKX Dev Day 2026

Status: **ACTIVE — overnight run: M2 lanes integrated, PRIMARY wiring Convex lifecycle**  
Updated: **17 September 2026 (overnight sprint)**

## OVERNIGHT RUN LEDGER (authoritative for this run)

Integration branch: `qoder/general-session-fk5qjv`
Base / CHECKPOINT A0 (M2 branch reconciled with origin/main): `72321ed8e78c8b366a46df5fe56ddb2e81ef5386`
Frozen contracts: `docs/work/M2_SHARED_CONTRACT.md` @ `d61bfcf1083f80c8737b4058930f352f82bc00dc`
CHECKPOINT 1 (lanes A+B+C+M3 integrated, 228/228 tests, root+convex tsc clean): `9ed74856b6fd52c6000e392a33cdc60b293b21f8`

Lane branches (all pushed, remote==local verified by PRIMARY):
- Lane A resource-need: `lane/a-resource-need` @ `c8cc432` (13/13) — ResourceNeed + SourcingDecisionRecord primitives.
- Lane B market-discovery: `lane/b-market-discovery` @ `44a9c73` (14/14) — discovery iface, verified registry DATA, candidate assessment. FINDING: no official OKX programmatic discovery primitive confirmed → snapshot is primary behind replaceable MarketDiscovery interface.
- Lane C artifact/growth-worker: `lane/c-artifact-growth-worker` @ `b672e97` (artifact 8/8, worker/workforce regression 24/24) — CompanyArtifact + growth capability + request_resource/update_company_artifact tools. GAP: tests/growthWorker.test.ts not produced (behavior verified by PRIMARY throwaway probe).
- Lane M3 buyer-rail: `lane/m3-buyer-rail` @ `b05e117` (72/72) — 402 dynamic binding, purchase records, retry/reconcile, READY_TO_SIGN, secret boundary. PRIMARY reconstructed lost lib/payment/types.ts (concurrent-checkout casualty) and fixed test fixtures.

INCIDENT: all child agents shared ONE working tree → concurrent `git checkout` contaminated branches (Lane A commit landed on lane/m3, Lane B dup on lane/c, remote lane/m3 held mixed commit 8bd777d). PRIMARY stood children down, salvaged files to /tmp/salvage, reconstructed each lane in isolated worktrees, force-with-lease corrected lane/m3. No remote corruption on integration branch. LESSON: do not spawn multiple writer children into the shared tree; PRIMARY owns all git from now.

Discovery finding (Lane B): no supported official OKX programmatic discovery API confirmed this pass; `agent asp-match/search/service-list` CLI surface not verifiable as a runtime dependency. Snapshot fallback is PRIMARY path; live CLI integration is founder-gated. Registry DATA holds FlyBeacon/Newsliquid/xbird service→ResourceClass mappings.

Next PRIMARY actions (safe order §33): wire ResourceNeed/CompanyArtifact/purchase persistence into Convex schema + objectives.ts + objectiveRunner.ts; add `waiting_for_resource` lifecycle (BUY is not failure); seed canonical launch artifact DATA; wire discovery+assessment seam per need; then read-model/UI (Lane D), provider adapters (Lane M4), invariant review (Lane E). STOP at READY_TO_SIGN / any founder-auth boundary.

Boundaries NOT crossed and will not be: no wallet/signing/tx-submit/spend, no founder X creds, no publish, no paid provider call, no mainnet.

---


## Goal

Deliver one reliable 2–4 minute canonical demo:

> **“Our launch isn’t working. Fix it and relaunch today.”**

Target execution:

`MAKE growth worker → discover resource gap → reject redundant external cognition → BUY Newsliquid → MAKE reacts → BUY xbird → publish → verify → founder outcome`

Maximum two real provider purchases.

## Authoritative repo / accepted base

Repository: `dropandresetmain-prog/somebody-okx`

Accepted main / M1:

`1e2c1a484713792cead51b85e1e1ae36d28b3e77`

M1 is accepted. Do not rebuild it.

## Read order

1. `README.md`
2. `MASTER_PLAN.md`
3. `ARCHITECTURE.md`
4. `PRODUCT_SPEC.md`
5. `DECISIONS_LOG.md`
6. `REUSE_AUDIT.md`
7. `BUILD_DELTA.md`
8. this file

Current code/runtime/schema and newer accepted decisions outrank stale plans.

## Locked constraints

- Somebody remains the accountable manager/product.
- Founder gives an objective, not an agent specification.
- Missing worker != missing capability.
- MAKE requires real bounded execution and controlled-state change.
- Model may propose resource needs; application decides ownership/sourcing/provider/spend authority.
- `lib/sourcing/policy.ts` remains the single deterministic MAKE/BUY/BLOCKED authority.
- Sourcing is **repeated and resource-level**, not one permanent objective-level verdict.
- Marketplace discovery is bounded; no universal marketplace engine.
- If no supported official discovery API exists, use a small synchronized current-market snapshot behind a replaceable interface.
- Real provider invocation/payment remains real.
- Maximum two BUY transactions in the canonical mission.
- No unnecessary A2A negotiation/escrow.
- Submission/payment/provider success != verification/completion.
- Ambiguous payment/effect state reconciles before retry.
- Secrets/private keys/session credentials never enter ordinary Convex state/logs.
- One canonical demo only.

## Canonical providers / resource types

### Rejected option

**FlyBeacon** or equivalent generic growth service.

Decision: `REJECT / MAKE internally` when it merely reproduces generic reasoning, public research, planning or copy work already available internally.

### BUY #1

**Newsliquid**.

Resource: proprietary/privileged external X/social intelligence.

Purchased evidence must materially change subsequent internal work.

### BUY #2

**xbird**.

Resource: external social execution infrastructure / privileged execution interface.

The founder/company owns the underlying X account and intent. xbird supplies the bounded paid automation interface.

Provider endpoint/price/payment/credentials/result/verification remain current-market facts to validate immediately before implementation.

## Completed checkpoints

### M0 — COMPLETE

Foundation, provenance and workforce kernel established.

### M1 + R1 — ACCEPTED

Accepted live on fresh Convex.

Evidence includes:

- Objective/WorkItem runtime;
- model-proposed/application-authorized planning;
- factual inventory;
- dynamic internal worker;
- `WorkerSpec → WorkContract`;
- bounded real Agent/Runner;
- application-owned evidence/completion;
- lease/fencing;
- positive live MAKE proof;
- deterministic negative proof;
- Objective Workspace.

Exact evidence: `BUILD_DELTA.md` §3.6.

### Generic M2 sourcing — IMPLEMENTED, REQUIRES ADAPTATION

Branch:

`feat/m2-make-buy-policy`

Observed SHA:

`4a827e891af3dd7e61cf529482a7656ee23bcb34`

Verified there:

- canonical pure `MAKE / BUY / BLOCKED` kernel;
- factual inventory as ownership authority;
- provider paths exact-resource-bound;
- model cannot authorize provider/spend;
- sourcing truth persisted/rendered;
- M1 row compatibility;
- reported 121/121 full suite, clean root/Convex typechecks and Next build.

Do not discard this work.

## Current task — adapt M2 to approved mission

The existing M2 integration currently makes one sourcing decision for the whole plan and treats non-MAKE as terminal. That is incompatible with the approved mission.

Adapt the architecture minimally so the same pure sourcing kernel can be invoked repeatedly for bounded resource needs.

Required M2 work:

- [ ] reconcile `feat/m2-make-buy-policy` with the new canonical SSOT docs;
- [ ] add bounded growth/launch capability using only controlled resources;
- [ ] add the smallest controlled launch artifact/state needed for real MAKE work;
- [ ] internal growth worker changes that artifact — not merely advises;
- [ ] persist a bounded `ResourceNeed` / sourcing-decision record that may occur multiple times in one objective;
- [ ] stop treating BUY as automatic objective failure;
- [ ] add bounded market-discovery seam;
- [ ] use supported official OKX discovery primitive if verified, otherwise synchronized snapshot;
- [ ] snapshot includes FlyBeacon, Newsliquid and xbird current metadata needed for the demo;
- [ ] candidate assessment can reject redundant growth service and select exact-resource provider path;
- [ ] Newsliquid path maps to the genuine external intelligence resource;
- [ ] provider approval remains application-owned;
- [ ] preserve M1 row/read compatibility;
- [ ] update Objective Workspace only enough to show current resource need/candidates/decision;
- [ ] focused sourcing/resource/discovery/MAKE tests;
- [ ] relevant M1 regression only where seams changed;
- [ ] root + Convex typechecks;
- [ ] canonical M2 proof;
- [ ] update `BUILD_DELTA.md` and this ledger;
- [ ] commit + push exact files at meaningful checkpoints.

## M2 acceptance

Accept M2 when this is real and persisted:

`canonical failing-launch objective → internal growth MAKE → controlled artifact changed → proprietary social-intelligence need → market candidates discovered → FlyBeacon-style redundant option rejected → Newsliquid selected as BUY`

No provider payment is required in M2.

The repeated-sourcing machinery should be capable of another later need, but do not fabricate BUY #2 before BUY #1 evidence has actually changed the mission.

## M3 preparation already available

Branch:

`prep/m3-okx-readiness`

Consume its verified payment-readiness research and pure lifecycle kernel. Do not restart payment research from zero.

M3 builds one repeatable buyer rail safe for two sequential purchases in one mission, first proved against the official Mock Merchant / X Layer Testnet.

Run **R2 coding-agent payment-safety review after the complete M3 rail exists**.

## M4 target

Complete backend canonical mission:

`BUY Newsliquid → verify intelligence → MAKE reacts → new execution resource need → BUY xbird → publish → independent verification → final outcome`

Maximum two real BUYs.

Run **R3 coding-agent economic-integration review after M4**.

## Remaining schedule

- 18–19 Sep: M2 canonical adaptation/acceptance.
- 19–20 Sep: M3 buyer rail; R2.
- 20–21 Sep: M4 two-provider full backend; R3.
- 21–22 Sep: M5 surface/story hardening + first backup demo video.
- 23 Sep: M6 release candidate + G1 promotion gate; hard feature freeze 18:00 SGT.
- 24 Sep: debugging/hardening only.
- 25 Sep: video/submission only; internal target 22:00 SGT.

## Findings to carry forward

### Investigate Now

- Confirm whether an official supported marketplace/service-search primitive is available. If not, use the synchronized snapshot fallback; do not scrape private APIs.
- Validate exact Newsliquid endpoint/service, price, payment environment and response schema immediately before provider integration.
- Validate xbird execution path, X credential/session handling, payment environment, publish endpoint and independent read-back before M4 lock.

### Park for Later

- `run.toolCalls` remains dead instrumentation from M1; not required for sourcing/payment correctness.
- General provider ranking/reputation, generic marketplace indexing and general cost optimization are outside the hackathon.

## Next action

**Implement M2 adaptation from `feat/m2-make-buy-policy`, preserving the existing pure sourcing kernel and accepted M1 behavior.**

Do not start M3 payment integration until M2 acceptance evidence passes.
