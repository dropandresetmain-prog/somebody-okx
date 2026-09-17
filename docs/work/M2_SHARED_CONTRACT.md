# M2/M3/M4 Frozen Shared Contracts

Status: **FROZEN — do not edit contract shapes in a lane without orchestrator approval**
Base SHA for all lanes: `72321ed8e78c8b366a46df5fe56ddb2e81ef5386`
Updated: 17 September 2026

This file is the cross-lane contract authority for the overnight run. Lanes implement
against these shapes. Conflicts between a lane's local intuition and this file resolve
in favour of this file.

## 0. Non-negotiable architecture rules (apply to every lane)

1. `lib/sourcing/policy.ts::evaluateSourcingPolicy` is the single deterministic
   MAKE/BUY/BLOCKED authority. It is **reused unchanged** and invoked once per bounded
   `ResourceNeed`. Do not rewrite it, do not add a second sourcing rule.
2. Core runtime MUST NOT contain scenario/provider conditionals. The strings
   `launch`, `Newsliquid`, `FlyBeacon`, `xbird`, `canonical`, `BUY1`, `BUY2`,
   `phase1`, `phase2` are FORBIDDEN in:
   - `lib/sourcing/**` (policy + domain),
   - `lib/objective/**` (lifecycle, needs, artifacts),
   - `lib/payment/**` (generic lifecycle),
   - `lib/market/**` (discovery interface + assessment + registry loader),
   - `convex/**`,
   - `app/**` component logic.
   They ARE allowed in: `lib/providers/**` adapters, seed/demo data files, fixtures,
   tests, docs, and the verified service registry DATA (`lib/market/registryData.ts`).
3. Provider/scenario identity must EMERGE from discovery + the verified service
   registry, never be hardcoded in generic logic.
4. The model/worker may PROPOSE a resource need. Only application code may validate,
   persist, decide sourcing, approve a provider, or authorize spend. A worker can never
   mark a resource fulfilled, choose an authoritative provider, or authorize payment.
5. Secrets (wallet keys, X session tokens) never enter persisted state, events,
   evidence or logs.
6. Determinism: same inputs → identical outputs. Sort + dedupe any list that becomes
   persisted truth or a decision input.

## 1. ResourceNeed  (owner: Lane A — `lib/objective/resourceNeed.ts`)

```ts
export type ResourceNeedStatus =
  | "proposed"        // worker proposed it; not yet validated/persisted as active
  | "active"          // validated; awaiting sourcing
  | "sourcing"         // discovery/assessment in progress
  | "buy_pending"      // BUY decided; awaiting external acquisition
  | "fulfilled"        // resource acquired + result verified
  | "rejected";        // need resolved as internally satisfiable / invalid

export type ResourceNeed = {
  id: string;
  objectiveKey: string;
  workItemId: string | null;
  resourceClass: ResourceClass;          // from lib/workforce/types (existing union)
  purpose: string;                        // bounded, ≤ 500 chars
  reasonOwnedInsufficient: string;        // why controlled resources cannot satisfy it, ≤ 500
  status: ResourceNeedStatus;
  proposedByRunId: string | null;         // provenance
  createdAt: number;
  updatedAt: number;
  dedupeKey: string;                      // see below
};
```

`dedupeKey` = `sha256(objectiveKey + "\u0000" + resourceClass + "\u0000" + normalize(purpose))`
hex, where `normalize` lowercases, trims, collapses internal whitespace runs to one space.
Equivalent duplicate requests (same objective + class + normalized purpose) MUST dedupe
to the same `dedupeKey`; the application returns the existing need rather than creating a
second one. Provide a pure `computeNeedDedupeKey(input)` and a pure
`dedupeResourceNeeds(existing, proposed)` helper (no Convex, no IO) so lanes can unit test.

A `ResourceNeed` MUST NOT contain a provider choice as inherent truth. The provider
emerges later via discovery + decision record.

## 2. SourcingDecisionRecord  (owner: Lane A — `lib/objective/resourceNeed.ts`)

Ties exactly one `ResourceNeed` to exactly one invocation of the canonical kernel.

```ts
import type { SourcingDecision, SourcingReasonCode } from "../sourcing/types";

export type SourcingDecisionRecord = {
  id: string;
  resourceNeedId: string;
  objectiveKey: string;
  decision: SourcingDecision;             // MAKE | BUY | BLOCKED (kernel truth)
  reasonCode: SourcingReasonCode;
  satisfied: ResourceClass[];             // sorted, deduped
  missing: ResourceClass[];               // sorted, deduped
  approvedProviderPaths: ApprovedProviderPath[]; // resource-specific, from kernel
  selectedOfferingId: string | null;      // for BUY: the chosen MarketOffering.serviceId
  rejectedOfferingIds: string[];          // sorted; offerings assessed and rejected
  decidedAt: number;
};
```

One Objective may contain MULTIPLE decision records (one per need invocation). Provide a
pure `buildDecisionRecord(...)` that consumes a `SourcingAuthorizingResult` + need +
selected/rejected offering ids and returns the record. It MUST NOT re-derive the decision;
the kernel result is authoritative.

## 3. CompanyArtifact  (owner: Lane C — `lib/objective/artifact.ts`)

Generic owned mutable company state. The canonical launch page/message is only seeded DATA.

```ts
export type CompanyArtifactVersion = {
  version: number;              // monotonic per key, starts at 1
  content: string;              // ≤ 8000 chars
  changedByRunId: string;
  changedAt: number;
  changeNote: string;           // ≤ 500 chars, why this version differs
};

export type CompanyArtifact = {
  key: string;                  // stable artifact identity within an objective/company
  objectiveKey: string;
  label: string;                // ≤ 120
  content: string;              // current content, ≤ 8000
  version: number;              // current version number
  updatedAt: number;
  provenanceRunId: string | null;
  history: CompanyArtifactVersion[]; // append-only, newest last
};
```

Provide pure helpers (no IO):
- `createArtifact({ key, objectiveKey, label, content, runId, at })` → version 1 artifact;
- `applyArtifactChange(artifact, { content, changeNote, runId, at })` → NEW artifact with
  `version + 1`, appended history entry, updated `content`/`updatedAt`/`provenanceRunId`.
  It must reject an unchanged content (no-op) and reject over-length content.

## 4. MarketOffering + MarketDiscovery interface  (owner: Lane B — `lib/market/discovery.ts`)

External market data is UNTRUSTED until validated by the registry + assessment.

```ts
export type OfferingPrice = {
  amount: string;               // decimal string as returned by the source, e.g. "0.002"
  asset: string;                // human asset symbol or address as returned
  unit: string;                 // e.g. "per_use"
};

export type MarketOffering = {
  offeringId: string;           // stable id = `${providerId}:${serviceId}`
  providerId: string;           // e.g. agent id
  serviceId: string;
  name: string;
  description: string;
  price: OfferingPrice | null;
  source: { kind: "okx_cli" | "okx_api" | "snapshot"; retrievedAt: number; raw?: unknown };
  compatibleResourceClasses: ResourceClass[]; // ONLY set after registry validation; else []
};

export type MarketDiscovery = {
  // need-driven: takes the task description / resource need, returns candidate offerings.
  discover(input: {
    resourceClass: ResourceClass;
    taskDescription: string;    // e.g. "current privileged social intelligence about ..."
    limit?: number;             // default 5, hard cap 10 (discovery budget §8)
  }): Promise<MarketOffering[]>;
};
```

Lane B must:
- Determine the exact supported OKX discovery primitive (`agent asp-match`,
  `agent search`, `agent service-list`) — package/CLI/runtime, auth, machine-readability,
  whether it can run from a Convex Node action vs a Next.js server bridge vs a supported
  JS library. Record findings in `docs/work/M2_DISCOVERY_FINDINGS.md`.
- Implement an adapter behind `MarketDiscovery` for the preferred path
  (`lib/market/okxDiscovery.ts`), with a synchronized-snapshot fallback
  (`lib/market/snapshotDiscovery.ts`) reading `lib/market/snapshotData.ts`.
- NEVER scrape private/undocumented APIs or OKX.AI HTML at runtime.
- Discovery must be need-driven (a task description), not "find <provider name>".

## 5. Verified service registry (DATA)  (owner: Lane B — `lib/market/registryData.ts`)

Small application-owned mapping of stable `serviceId` → `ResourceClass[]`. This is DATA,
not sourcing logic. Expected demo records (provider identities live ONLY here + adapters):

```ts
export type RegistryEntry = {
  serviceId: string;            // matches MarketOffering.serviceId
  providerId: string;
  resourceClasses: ResourceClass[];
  verified: boolean;
  notes?: string;
};
export const VERIFIED_SERVICE_REGISTRY: readonly RegistryEntry[] = [ /* FlyBeacon, Newsliquid, xbird */ ];
```

`lib/market/registry.ts` (owner Lane B) exposes pure
`resolveCompatibleClasses(offering, registry)` → `ResourceClass[]` (intersect/lookup; empty
when the service is not verified). Unverified offerings get `compatibleResourceClasses: []`
and are rejected downstream.

## 6. CandidateAssessment  (owner: Lane B — `lib/market/assessment.ts`)

Pure, generic economic/resource judgment. NO provider-name conditionals.

```ts
export type AssessmentVerdict = "eligible_buy" | "reject_redundant" | "reject_incompatible" | "reject_untrusted";

export type CandidateAssessment = {
  offeringId: string;
  verdict: AssessmentVerdict;
  reasonCode:
    | "supplies_missing_resource"        // eligible_buy
    | "redundant_with_owned_resources"   // reject_redundant
    | "resource_class_mismatch"          // reject_incompatible
    | "unverified_or_invalid";           // reject_untrusted
  resourceClass: ResourceClass;          // the need's class
  rationale: string;
};

export function assessCandidate(input: {
  offering: MarketOffering;
  need: { resourceClass: ResourceClass };
  ownedResourceClasses: readonly ResourceClass[]; // factual inventory
}): CandidateAssessment;
```

Rules (pure):
- offering has no verified compatible class covering `need.resourceClass` → `reject_untrusted`
  (if unverified) or `reject_incompatible` (verified but wrong class).
- offering's compatible classes are ALL already in `ownedResourceClasses` (i.e. it only
  supplies generic reasoning/public-web/company-data the company already controls) →
  `reject_redundant`.
- offering supplies `need.resourceClass` which is NOT in `ownedResourceClasses` →
  `eligible_buy`.
Provide a pure `selectOffering(assessments, offerings)` that returns the single best
`eligible_buy` offering (deterministic tie-break: lowest price amount as decimal, then
offeringId lexicographic) or `null`. It must reject when zero eligible or when the selected
offering's class is not actually missing.

## 7. Objective / WorkItem lifecycle  (owner: PRIMARY — `lib/objective/types.ts`, `convex/**`)

Add explicit waiting semantics. BUY is NOT failure.

```ts
export type ObjectiveState =
  | "received" | "planning" | "ready_to_execute" | "executing"
  | "waiting_for_resource"        // NEW: a required ResourceNeed is buy_pending
  | "completed" | "failed";

export type WorkItemState =
  | "defined" | "assigned" | "running"
  | "waiting_for_resource"        // NEW
  | "completed" | "failed";
```

Flow: `executing → (worker requests resource) → run stops/pauses safely →
work/objective waiting_for_resource → resource later fulfilled → new bounded run resumes`.
Unresolved required resources BLOCK Objective completion. Maintain leases, run fencing,
stale-write protection, application-owned completion, evidence provenance (unchanged from M1).
Do NOT build a generic workflow DSL. PRIMARY owns `convex/schema.ts`, `convex/objectives.ts`,
`convex/objectiveRunner.ts`, `convex/objectiveValidators.ts`, and the `lib/objective/types.ts`
state unions. Lanes A/C add NEW files only and must not edit these Convex files.

## 8. request_resource worker capability  (owner: Lane C — `lib/workforce/**` + `lib/worker/**`)

Add capability `growth_launch_operations` and tool permission `request_resource` and
`update_company_artifact` to the EXISTING unions in `lib/workforce/types.ts` (append-only;
do not remove or reorder existing members — M1 compatibility). The growth worker may:
read a controlled artifact/context, research public web, update a controlled artifact,
request a missing resource. It may NOT: invoke a provider, pay, authorize spend, access
arbitrary DB, or make arbitrary HTTP. `authorize_external_spend` still materializes no tool.

`request_resource` tool Zod input (worker proposal, untrusted):
```ts
z.object({
  resourceClass: z.enum([/* the ResourceClass union values */]),
  purpose: z.string().min(1).max(500),
  reasonOwnedInsufficient: z.string().min(1).max(500),
})
```
Application validates + persists (dedupe via §1). Worker cannot set status/provider/fulfilled.

`update_company_artifact` tool Zod input:
```ts
z.object({ content: z.string().min(1).max(8000), changeNote: z.string().min(1).max(500) })
```
Application applies via `applyArtifactChange` (§3), persisting version + provenance.
Role-specific completion for the growth worker REQUIRES an actual artifact version change
(not merely advice). Lane C provides the capability/permission definitions, the two tools'
pure builders, and the artifact-change completion rule; PRIMARY wires Convex persistence.

## 9. Payment lifecycle  (owner: Lane M3 — consume `prep/m3-okx-readiness`)

Reuse `lib/payment/types.ts` + `lib/payment/lifecycle.ts` from `prep/m3-okx-readiness`
(already pure). States: `prepared → awaiting_approval → approved → payment_attempted →
submitted → settled → result_received → verified` plus `failed`, `uncertain`,
`reconciliation_required`. Invariants: approval explicit; submission ≠ settlement;
settlement ≠ result verification; ambiguous state cannot blindly retry; idempotency per
economic action; duplicate payment prevented; terms bound before signing.

### 9a. Dynamic 402 terms binding  (owner: Lane M3 — `lib/payment/challenge.ts`)

Parse the LIVE 402 challenge (Mock Merchant returns terms in the JSON **body**, field
`maxAmountRequired`, schemes `exact` + `aggr_deferred`, network `eip155:1952`, EIP-712 name
`USDC_TEST` — see `docs/work/M3_PROBE_RESULTS.md`). Do NOT hardcode asset/address/amount.

```ts
export type NormalizedChallengeTerms = {
  scheme: string;
  network: string;            // e.g. "eip155:1952"
  asset: string;              // parsed from response
  maxAmountRequired: string;  // decimal string
  payTo: string;
  resource: string;
  eip712: { name: string; version: string };
  maxTimeoutSeconds: number;
};
export function parse402Challenge(body: unknown): NormalizedChallengeTerms[]; // fail-closed
export function bindTermsToApproval(terms: NormalizedChallengeTerms, approval: PaymentApproval): BoundPaymentIntent;
```

### 9b. Purchase record (two-purchase support)  (owner: Lane M3 — `lib/payment/purchase.ts`)

Model multiple INDEPENDENT purchases under one Objective. Do NOT hardcode BUY1/BUY2.
```ts
export type PurchaseRecord = {
  id: string;
  objectiveKey: string;
  resourceNeedId: string;
  offeringId: string;
  idempotencyKey: string;     // unique per purchase; two purchases never share it
  state: PaymentState;
  boundTerms: NormalizedChallengeTerms | null;
  approval: PaymentApproval | null;
  receipt: { transactionHash?: string; settledAt?: number } | null;
  result: unknown | null;
  verified: boolean;
  createdAt: number;
  updatedAt: number;
};
```
Each purchase has its own need/provider/approved terms/idempotency identity/lifecycle/
receipt/result/verification. First purchase state can NEVER authorize the second.

### 9c. READY_TO_SIGN boundary  (owner: Lane M3 — `lib/payment/buyerRail.ts`)

Build the full buyer rail EXCEPT actual signing: provider request → 402 detection →
challenge parse → term normalization → policy + spend-limit validation → approval state →
payment intent creation → idempotency → retry/reconciliation mechanics → settlement
readback abstraction → provider retry-with-payment-header abstraction → receipt/result
persistence abstraction → mock/fake signer interface for tests. The rail reaches a clearly
defined `READY_TO_SIGN` state and STOPS. Provide a `Signer` interface +
`FakeSigner` for tests. DO NOT create wallet secrets, sign with founder credentials,
submit a chain transaction, or spend assets. X Layer Testnet read-only probes and Mock
Merchant challenge retrieval are allowed (no signing).

## 10. Provider adapters  (owner: Lane M4 — `lib/providers/**`)

Generic contract; provider-specific code MAY contain provider identities.
```ts
export type ExternalResourceResult = {
  offeringId: string;
  resourceClass: ResourceClass;
  payload: unknown;              // normalized provider response
  evidence: { label: string; text: string; url?: string; observedAt: number }[];
  retrievedAt: number;
  provenance: { providerId: string; serviceId: string; idempotencyKey: string };
};
export type ProviderAdapter = {
  providerId: string;
  requestShape(input: { offering: MarketOffering; need: ResourceNeed }): unknown;
  normalizeResponse(raw: unknown): ExternalResourceResult;
  verificationStrategy: string;  // how to independently verify the effect/result
};
```
Prepare adapters + fixture-driven tests for:
- **Newsliquid** (`lib/providers/newsliquid.ts`): normalize purchased social evidence into
  `ExternalResourceResult`. Do NOT hardcode a marketing conclusion — the growth worker
  consumes actual returned evidence. Verification rules based on what the provider returns.
- **xbird** (`lib/providers/xbird.ts`): publish/search/read-back. Determine credentials,
  remote vs local MCP mode, publish receipt shape, independent read-back verification,
  duplicate-post/idempotency risks. Fixture-driven tests only.
NO paid calls, NO founder X credentials, NO publishing overnight.
FlyBeacon generic growth remains a rejected marketplace option (data only); its live-X
offering may be retained as a same-resource BUY#1 fallback in registry data.

## 11. Read model for UI  (owner: PRIMARY, consumed by Lane D)

`app/ObjectiveWorkspace.tsx` + a read selector render PERSISTED GENERIC state:
one Objective; multiple WorkItems/runs; multiple ResourceNeeds; marketplace candidate
assessments (incl. the rejected offering); BUY waiting state; multiple purchase/payment
states; artifact history/version/change; external result; resumed MAKE; final verified
effect. UI component logic MUST NOT branch on provider/scenario strings. Lane D may only
touch `app/**` and `tests/ui.test.ts` AFTER PRIMARY publishes the read contract here.

## 12. Lane ownership map (file-disjoint)

| Lane | Owns (may create/edit) | Must NOT touch |
|------|------------------------|----------------|
| A | `lib/objective/resourceNeed.ts`, `tests/resourceNeed.test.ts` | Convex, policy.ts, types.ts state unions |
| B | `lib/market/**`, `tests/market.test.ts`, `docs/work/M2_DISCOVERY_FINDINGS.md` | Convex, policy.ts, objective lifecycle |
| C | `lib/objective/artifact.ts`, `lib/workforce/catalog.ts`+`types.ts`+`workers.ts`+`permissions.ts` (append-only), `lib/worker/runtime.ts`+`port.ts` (add tools), `tests/artifact.test.ts`, `tests/growthWorker.test.ts` | Convex, policy.ts, types.ts state unions |
| M3 | `lib/payment/**`, `tests/payment-*.test.ts` | everything else |
| M4 | `lib/providers/**`, `tests/provider-*.test.ts` | everything else |
| D | `app/**`, `tests/ui.test.ts` | lib/**, convex/** (until read contract published) |
| E | read-only review; writes only `docs/work/INVARIANT_REVIEW.md` | all source |

PRIMARY owns: `lib/objective/types.ts` state unions, `lib/objective/sourcing.ts`,
`convex/**`, integration, codegen, docs (`BUILD_DELTA.md`, `ACTIVE_TASK.md`), final verify.

Every lane: branch from `72321ed`, modify only owned files, run focused tests, stage exact
files, commit, PUSH immediately, report exact SHA + files + checks + findings.
