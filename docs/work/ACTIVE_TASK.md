# ACTIVE TASK — Somebody × OKX Dev Day 2026

Status: ACTIVE
Updated: 17 September 2026

## Goal

Deliver one reliable 2–4 minute end-to-end demo proving:

`founder objective → capability plan → MAKE + BUY → verified result → useful business outcome`

## Authoritative repo

`dropandresetmain-prog/somebody-okx`

## Canonical execution plan

Read `MASTER_PLAN.md` first.

Key dates:

- canonical demo gate: **18 Sep 2026, 12:00 SGT**;
- hard feature freeze: **23 Sep 2026, 18:00 SGT**;
- 24 Sep: debugging/hardening only;
- 25 Sep: video/submission only;
- internal submission target: **25 Sep, 22:00 SGT**.

## Source baselines

- Somebody: `dropandresetmain-prog/somebody-ai@709a169a1a4f71b8dc2d7427438ff514999fb07e`
- Army of Interns: `dropandresetmain-prog/army-of-interns@677166db591465fb6d201fb12db7cfe038557a92`
- Pre-build planning evidence: `dropandresetmain-prog/wip-personal`, branch `planning/somebody-okx`, commit `1ca59ce4aad64b04fc1ed8caadd2301eb33033ab`
- Model guidance source: `dropandresetmain-prog/resume-copilot@78d147716cf314b766aaed91d9fcde23959ea690`

## Canonical operating documents

- `MASTER_PLAN.md` — locked milestone sequence, product surface, cuts and freeze.
- `BUILD_DELTA.md` — hackathon provenance/evidence ledger.
- `PRODUCT_SPEC.md` — locked product scope.
- `ARCHITECTURE.md` — technical boundaries.
- `DECISIONS_LOG.md` — decision history.
- `docs/agents/AGENT_MODEL_SELECTION.md` — default model/harness/effort and subagent routing.
- `docs/agents/MODEL_ARSENAL.md` — deeper model reference.

Architecture, integration decisions, wallet/signing/payment work, security-sensitive code and final verification stay with the primary model.

## Locked constraints

- Somebody remains the product/brand and accountable manager.
- MAKE and BUY must both be real in the final demo.
- Missing worker != missing capability.
- MAKE requires real bounded worker execution, not only a WorkerSpec.
- Do not buy generic cognition merely because another agent sells it.
- BUY must be justified by an externally controlled scarce resource or materially impractical internal reproduction.
- Models may propose capabilities/resources; application policy validates and decides sourcing.
- External payment/result must be verified; submission is not completion.
- Prefer testnet/sandbox for payment development when supported.
- Never silently spend real funds or expose wallet credentials/private keys.
- One external provider on the critical path.
- One canonical demo only.
- Build the Company Mission product surface incrementally from M1.
- Do not generalize into an autonomous-company platform.

## Provenance vocabulary

Use four categories:

- **Inherited** — working pre-OKX capability;
- **Pre-existing R&D** — prior concepts/prototypes outside Somebody;
- **Rebuilt / Adapted during OKX** — prior idea newly reimplemented inside Somebody-OKX after discarding unsuitable architecture;
- **New during OKX** — capability neither prior project had in working product form.

`BUILD_DELTA.md` remains the evidence ledger. Planned work cannot be called built before repo evidence passes.

## Current checkpoint

### M0 — Foundation and provenance — COMPLETE

Completed:

- [x] product/customer thesis locked;
- [x] OKX project thesis locked;
- [x] Make-vs-Buy rule locked;
- [x] Web3/OKX role bounded to external machine commerce;
- [x] pre-build planning/reuse audit ingested;
- [x] X Layer / Onchain OS test environment verified from official docs;
- [x] canonical SSOT established;
- [x] inherited Somebody baseline transferred and verified;
- [x] `BUILD_DELTA.md` created;
- [x] model/subagent selection guidance imported;
- [x] minimal workforce kernel rebuilt from Army-inspired R&D.

Baseline evidence:

- transfer commit: `a47cc93`;
- baseline verification at `093d247`: 78/78 inherited tests, clean root + Convex typechecks;
- workforce implementation checkpoint: `dfae75af9326a8e719033948ede8b2b481b423bd`;
- current pre-plan HEAD: `85b3ef9c9feff7cd165de70cabe195b2edff4f07`;
- workforce evidence: focused 11/11, cumulative 89/89, root typecheck clean.

### Canonical demo selection — PARALLEL / OPEN

Hard deadline: **18 Sep, 12:00 SGT**.

The demo-selection lane is running in parallel with M1. It must produce:

- canonical founder objective;
- MAKE path;
- genuinely scarce BUY path;
- actual provider;
- scarcity justification;
- reliability/environment evidence;
- fallback.

Do not block M1 on the exact scenario; M1 is scenario-independent.

## Immediate next milestone

# M1 — Company Mission spine + active MAKE

Target: **17–18 Sep**

Objective:

> Turn the existing workforce kernel into a real execution capability and render it through the first Company Mission surface.

### M1-A — Inspect inherited blockers first

Before new persisted Company Mission writes:

- inspect `acrobatic-swan-765` usage and current Convex deployment assumptions;
- inspect `HEALTH_PROBE_WRITES_ENABLED` and confirm why it gates writes;
- decide the smallest safe configuration change needed for Company Mission development;
- do not perform broad config cleanup.

Classify findings: Act Now / Investigate Now / Park for Later / Ignore / Accept Risk.

### M1-B — Company Mission spine

Build a sibling path beside procurement; do not refactor procurement into a universal engine.

Represent only what is currently needed:

- objective;
- capability plan;
- resource requirements;
- workers;
- sourcing decision;
- work results/evidence;
- external effects placeholder/boundary where required;
- mission events/status;
- final outcome slot.

### M1-C — Objective → capability planner contract

Model proposes controlled capability keys, bounded responsibility and resource requirements.

Application validates:

- capability exists;
- resource classes are recognized;
- requested permissions stay inside the capability envelope;
- invalid proposals fail closed.

No spend authority in planner output.

### M1-D — Company resource inventory

Introduce the explicit factual inventory needed by later MAKE/BUY policy.

Start with scenario-independent owned classes already represented by the workforce kernel; do not create a giant ontology.

### M1-E — Active internal agent spawning

Core requirement:

`WorkerSpec → model selection → bounded agent instantiation → allowed tools → execution → result/evidence`

Use imported model-selection guidance.

The spawned worker must actually execute; UI-only worker creation is not sufficient.

Persistent cross-mission workforce is not required. Mission-local creation/reuse is acceptable.

### M1-F — First Company Mission product surface

Render the actual mission state from the start.

Minimum visible information:

- founder objective;
- capabilities;
- MAKE reasoning;
- worker creation/reuse;
- worker status;
- worker result.

Product surface may label the internal worker **That Guy**. Engineering types remain neutral.

Do not build giant graphs, permanent org charts or agent-chat theater.

## M1 acceptance criteria

PASS only when one bounded objective can:

1. enter Company Mission;
2. produce an application-validated capability plan;
3. resolve an internal worker through the workforce kernel;
4. select an execution model deliberately;
5. instantiate a bounded real agent;
6. expose only allowed tools;
7. execute useful internal work;
8. return/persist result/evidence;
9. render meaningful Company Mission state;
10. leave inherited procurement behavior intact.

Use focused changed-behavior tests first. Escalate only to affected seams and cumulative checks justified by the changes.

## M1 non-goals

Do not yet implement:

- final canonical scenario-specific worker catalogue;
- full Make-vs-Buy policy;
- marketplace discovery/ranking;
- OKX payment code;
- real provider adapter;
- wallet/signing integration;
- cross-mission persistent workforce;
- multiple simultaneous workers unless M1 genuinely requires them;
- visual polish/animation.

## Next milestones after M1

- **M2 (18–19 Sep):** canonical scenario MAKE path + deterministic Make-vs-Buy policy.
- **M3 (19–20 Sep):** generic safe OKX buyer rail on X Layer Testnet / Mock Merchant.
- **M4 (20–21 Sep):** selected real provider + full backend E2E.
- **M5 (21–22 Sep):** product-surface/story hardening + first complete backup video.
- **M6 (23 Sep):** release candidate + promotion gate.

## Evidence discipline

- Check items only after evidence passes.
- Run focused tests before broader checks.
- Never claim live OKX call/payment/confirmation/deployment/persistence without observing it.
- Keep mock/testnet/mainnet visibly distinct.
- Update `BUILD_DELTA.md` at each accepted milestone with exact SHA and evidence.

## Cut order if schedule slips

1. marketplace discovery/ranking;
2. second provider;
3. cross-mission persistent worker reuse;
4. multiple internal workers;
5. broad capability ontology;
6. fancy worker visualization;
7. UI animation;
8. flexible arbitrary decomposition.

Do NOT cut:

- active MAKE execution;
- justified BUY decision;
- actual OKX integration;
- spend/payment safety;
- external result verification;
- final synthesis;
- understandable working demo.
