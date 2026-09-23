# Somebody × OKX — Frontend Contracts

Status: **ACCEPTED V1 PRODUCT CONTRACT — READS + CREATE OBJECTIVE + SPEND APPROVAL WIRED**  
Reconciled: **22 September 2026**  
Frontend proposal reviewed: `docs/frontend-contracts-v1@324f09ec275573bb9a807a12310a22c12ebb60e2`  
Backend truth reviewed: `build/model-portability-milestone-2@a8090f8`  
Visual source of truth: `DESIGN.md` / approved V6 direction

This document is the single product-facing contract SSOT between the current M6.1 engine and the V6 founder UI.

It defines **projection semantics**, not new engine authority.

Product reads (`getObjectiveListV1`, `getObjectiveWorkspaceV1`, `getStartCapabilitiesV1`),
the Create Objective Product Command (`createObjectiveV1`), and Submit Attention Action V1
(`submitAttentionActionV1` — **spend approval only**) are wired.
Other Product Commands remain reserved / unwired.

---

# 1. Boundary

The accepted direction is:

```text
ENGINE / CONVEX / M3 / EXTERNAL TRUTH
        ↓
PRODUCT PROJECTION
        ↓
FRONTEND CONTRACT
        ↓
V6 UI
```

Not:

```text
ENGINE TABLES
        ↓
REACT COMPONENTS INTERPRET LIFECYCLE
```

Backend remains authoritative for:

- Objective lifecycle;
- Outcome Contract and Requirements;
- Worker/assignment/run truth;
- managerial decisions;
- authority and approvals;
- ResourceNeeds;
- ExecutionIntents;
- transaction facts;
- acquisition receipts;
- evidence;
- artifact versions;
- semantic assessment;
- deterministic completion;
- reconciliation.

Frontend remains authoritative for:

- layout;
- visual hierarchy;
- typography;
- labels;
- mascot pose/image selection;
- animation;
- progressive disclosure;
- presentation-only grouping.

React must never manufacture business truth from visual state.

---

# 2. Product language

Founder-facing V6 language:

- **Somebody** — accountable manager.
- **Intern** — presentation label for a bounded internal Worker.
- **External provider/resource** — governed capability outside the company.
- **Objective** — founder-requested outcome.
- **Activity** — meaningful business events.
- **Deliverable** — founder-facing governed artifact/output.
- **Checkpoint** — derived progress marker over current required work.
- **Needs you** — a legal founder action or judgment is currently required.

Backend terminology such as Requirement, Assignment, WorkContract, Worker, ResourceNeed, ExecutionIntent and completion gate remains internal.

**Presentation decision:** V6 may say **Intern**. Backend code continues to use Worker/internal-worker terminology.

---

# 3. Core invariants

The projection layer, not React, owns these distinctions:

- run stopped ≠ assignment complete;
- assignment complete ≠ Requirement satisfied;
- Requirement satisfied ≠ Objective complete;
- transaction submitted ≠ transaction confirmed;
- transaction confirmed ≠ provider result received;
- provider result received ≠ acquisition receipt verified;
- acquisition receipt verified ≠ Requirement satisfied;
- artifact version changed ≠ Deliverable verified;
- positive semantic assessment ≠ Objective completed;
- adjacent timestamps ≠ causality.

No hidden chain-of-thought, raw prompt transcript, graph trace or scratchpad belongs in the product contract.

Missing truth remains missing. Null/absence is preferable to invented theatre.

---

# PART I — TRANSPORT

## 4. Read envelope

```ts
type ProductReadEnvelope<T> =
  | {
      found: true;
      contractVersion: 1;
      viewRevision: string;
      generatedAt: number;
      view: T;
    }
  | {
      found: false;
      contractVersion: 1;
      reason: "not_found";
    };
```

### `viewRevision`

`viewRevision` is an opaque backend-generated projection token.

It may be derived from authoritative source revisions/timestamps used to compose the view, but its internal format is not part of the frontend contract.

It is useful for stale-view protection on commands that explicitly accept it.

Source-specific commands such as attention actions use their own stronger source revision as well.

---

# PART II — OBJECTIVE LIST

## 5. Objective product status

```ts
type ObjectiveProductStatus =
  | "starting"
  | "working"
  | "waiting"
  | "needs_you"
  | "verifying"
  | "completed"
  | "blocked";
```

This is NOT the raw Objective engine enum.

## 6. Status precedence

The backend projection resolves conflicts using this precedence:

1. **completed**  
   Objective row is completed AND the current deterministic completion verdict is accepted.

2. **needs_you**  
   A current legal founder attention/action exists: e.g. approval, clarification/choice, or supervised reconciliation. Merely being blocked does not create `needs_you`.

3. **blocked**  
   Current Objective is failed / blocked / recovery-required, or a current required Requirement is blocked, AND no legal founder action currently resolves the condition.

4. **waiting**  
   The system is quiescent on a real external/time/resource condition, including an authorized external action waiting on the external boundary, with no founder action required.

5. **verifying**  
   Current work/result has been delivered and the system is performing current Requirement/final semantic/completion verification, with no higher-precedence attention/block/wait state.

6. **starting**  
   Objective exists but the current locked Outcome Contract/interpretation is not yet established.

7. **working**  
   Default active management/execution state.

Network/query failures are infrastructure UI state, never `blocked`.

A reconciliation-required external intent maps to:
- `needs_you` only when the product contract exposes a legal supervised reconciliation action;
- otherwise `blocked`.

## 7. Sidebar contract

```ts
type ObjectiveSummaryView = {
  id: string;
  title: string;
  status: ObjectiveProductStatus;
  updatedAt: number;
  statusLabel?: string;
  hasAttention: boolean;
};

type ObjectiveListView = {
  inProgress: ObjectiveSummaryView[];
  needsYou: ObjectiveSummaryView[];
  done: ObjectiveSummaryView[];
};
```

Grouping is backend-owned:

- `needs_you` → `needsYou`
- `completed` → `done`
- all other product states, including blocked/waiting → `inProgress`

Recommended stable sort: `updatedAt DESC`, then `id`.

The list endpoint must be lightweight; React must not fetch every full workspace merely to categorize Objectives.

---

# PART III — OBJECTIVE WORKSPACE

## 8. Workspace

```ts
type ObjectiveWorkspaceView = {
  objective: ObjectiveView;
  progress: ProgressView;
  somebodyNow: SomebodyNowView;

  currentWork: CurrentWorkView | null;

  activity: ActivityItem[];
  deliverables: DeliverableView[];
  acquisitions: AcquisitionView[];

  attention: AttentionState | null;

  availableActions: ObjectiveActionView[];
};
```

No primary V6 component requires direct raw Requirement, Assignment, Worker, Decision or ExecutionIntent arrays.

They may remain available in debug/X-ray tooling.

## 9. Objective

```ts
type ObjectiveView = {
  id: string;
  title: string;
  request: string;
  summary?: string;
  status: ObjectiveProductStatus;
  createdAt: number;
  updatedAt: number;
};
```

### Projection

- `id` ← Objective key.
- `request` ← persisted founder request.
- `title` ← deterministic concise title derived from request unless a durable product title exists.
- `summary` ← accepted Objective result summary when one exists; otherwise absent or a bounded current product summary.
- `status` ← Section 6.
- timestamps ← Objective durable timestamps.

---

# PART IV — SOMEBODY NOW

## 10. Somebody Now contract

```ts
type SomebodyNowState =
  | "interpreting"
  | "working"
  | "waiting"
  | "needs_you"
  | "verifying"
  | "completed"
  | "blocked";

type SomebodyNowView = {
  state: SomebodyNowState;
  headline: string;
  detail: string;
  updatedAt: number;
};
```

## 11. Semantics

`SomebodyNowView` is backend-projected from the same authoritative facts that produce Objective product status.

Suggested state mapping:

- Objective `starting` → `interpreting`
- `working` → `working`
- `waiting` → `waiting`
- `needs_you` → `needs_you`
- `verifying` → `verifying`
- `completed` → `completed`
- `blocked` → `blocked`

Headline/detail use deterministic product templates plus bounded persisted facts such as:

- current Requirement title;
- current assignment title;
- external provider/resource label;
- legal approval question;
- blocker summary;
- completion summary.

Accepted model-generated rationales may be displayed as secondary content when clearly labelled as a persisted recommendation; they are not used as lifecycle authority.

React does not compose Somebody Now from engine rows.

---

# PART V — PROGRESS / CHECKPOINTS

## 12. Checkpoint types

```ts
type CheckpointState =
  | "pending"
  | "active"
  | "complete"
  | "blocked";

type CheckpointView = {
  id: string;
  label: string;
  state: CheckpointState;
  detail?: string;
};

type ProgressView = {
  checkpoints: CheckpointView[];
  currentPhase?: string;
};
```

No numeric percentage exists in V1.

## 13. V1 checkpoint derivation

Checkpoints are a **read projection over current required Requirements**.

They are not a new persisted progress system.

### Source set

Use Requirements that:

- belong to the current Outcome Contract revision;
- are `priority = required`;
- are not superseded.

Supporting Requirements are omitted from the primary Checkpoint rail. They may appear in Activity or completion disclosure.

### Order

Order current required Requirements deterministically:

1. dependency/topological order using `dependsOnRequirementKeys`;
2. requirement key as stable tie-breaker.

### IDs

For an individual Requirement:

```text
checkpoint:req:<contractRevision>:<requirementKey>
```

A contract revision intentionally creates a new current checkpoint set. Historical Activity remains historical.

### State mapping

- current Requirement state `satisfied` or application-authorized `waived` → `complete`
- current Requirement state `blocked` → `blocked`
- Requirement currently owned by the active decision/assignment/intent, or the first unresolved executable required Requirement in serial management → `active`
- otherwise → `pending`

A stale resolution from an older contract revision never yields `complete`.

### 2–5 visual target

The product must not invent extra checkpoints merely to reach two.

If current required work has 1–5 Requirements, project them directly.

If there are more than 5, project:

- the first 4 deterministic checkpoints;
- one deterministic aggregate checkpoint for the remainder.

Aggregate ID:

```text
checkpoint:remaining:<contractRevision>:<stable-hash-of-remainder-keys>
```

Aggregate label:

```text
Complete remaining required work
```

Aggregate state:

- `blocked` if any member is blocked;
- `active` if any member is active;
- `complete` if every member is complete;
- otherwise `pending`.

`detail` may truthfully state the remaining count and bounded titles.

This compression changes presentation only; it never changes Requirement truth or the completion gate.

### Current phase

`currentPhase` may be the active checkpoint label or a deterministic product label such as `Verifying the required outcome`.

Do not ask an LLM to invent percentage/progress state.

---

# PART VI — CURRENT WORK / INTERN

## 14. Current work

```ts
type ProductApproach =
  | "MAKE"
  | "BUY"
  | "WAIT"
  | "ASK";

type CurrentWorkStatus =
  | "queued"
  | "working"
  | "waiting"
  | "done"
  | "blocked";

type CurrentWorkView = {
  id: string;
  title: string;
  summary?: string;
  status: CurrentWorkStatus;
  approach?: ProductApproach;
  intern?: InternView;
  startedAt?: number;
  updatedAt: number;
};
```

## 15. Current work selection

Prefer the single current serial action for the current contract revision:

1. current live internal assignment/run;
2. current authorized external acquisition/effect;
3. current legitimate wait/ask action;
4. most recent just-verified bounded action when useful for transition rendering.

`id` is source identity:
- assignment ID for MAKE;
- execution intent ID for BUY;
- decision/attention identity for WAIT/ASK.

`approach` comes from the authorized current decision, not from React inference.

`HYBRID` remains internal; current serial M6.1 exposes bounded actions separately after reassessment.

---

## 16. Intern contract

```ts
type InternState =
  | "idle"
  | "assigned"
  | "working"
  | "waiting"
  | "done";

type InternView = {
  id: string;
  label: string;
  specialty?: string;
  state: InternState;
};
```

## 17. Intern state semantics

`Intern` is a presentation projection over Worker + current Assignment/Run.

- **idle** — reusable Worker exists with no current live Assignment for this Objective.
- **assigned** — current Assignment is authorized/dispatched but no active running lease yet.
- **working** — current Assignment has an active, non-stale running run.
- **waiting** — the current bounded Assignment is paused on an application-validated input/resource condition.
- **done** — the current Assignment itself is application-verified/accepted for the current contract revision.

Critical invariant:

```text
Intern done
≠ Requirement satisfied
≠ Objective completed
```

A `result_submitted`, stopped run, refused terminal, expired run, failed Assignment or superseded Assignment is NOT `done`.

Failed/superseded historical work belongs in Activity. The current-work card may omit the Intern after that action is no longer current.

Frontend selects pose/animation from this state only.

---

# PART VII — ACTIVITY

## 18. Activity principle

V6 Activity is a deterministic product projection over durable authoritative records.

V1 does **not** create a second independent Activity truth state machine.

Existing persisted domain rows and immutable histories are primary sources.

The current `objectiveEvents` log may support product copy/debugging, but V1 must not parse free-form event text to grant lifecycle semantics.

Where current durable state does not preserve enough history to truthfully reconstruct an event, that event is omitted rather than invented.

## 19. Activity types

```ts
type ActivityType =
  | "objective_interpreted"
  | "intern_assigned"
  | "work_started"
  | "work_summary"
  | "work_completed"
  | "finding_added"
  | "evidence_gap_identified"
  | "manager_decision"
  | "founder_action_required"
  | "acquisition_started"
  | "acquisition_submitted"
  | "external_result_received"
  | "external_result_verified"
  | "work_resumed"
  | "artifact_changed"
  | "verification_started"
  | "verification_completed"
  | "objective_completed"
  | "objective_blocked";
```

The vocabulary is accepted, but individual events are emitted only where authoritative source facts exist.

## 20. Activity shape

```ts
type ActivityActor =
  | { kind: "somebody"; label: "Somebody" }
  | { kind: "intern"; id: string; label: string }
  | { kind: "founder"; label: string }
  | { kind: "external"; id?: string; label: string };

type ActivityImportance =
  | "major"
  | "standard"
  | "minor";

type ExternalProvenance =
  | "live"
  | "simulation"
  | "recorded_replay";

type ActivityItem = {
  id: string;
  type: ActivityType;
  occurredAt: number;
  actor: ActivityActor;
  title: string;
  detail?: string;
  importance: ActivityImportance;

  related?: {
    internId?: string;
    deliverableId?: string;
    acquisitionId?: string;
    evidenceIds?: string[];
  };

  causedByActivityId?: string;
  provenance?: ExternalProvenance;
  payload?: ActivityPayload;
};
```

If `causedByActivityId` is absent, the UI must not draw a causal connector.

## 21. Authoritative Activity mapping

| Activity type | Authoritative V1 source | Stable event identity |
| --- | --- | --- |
| `objective_interpreted` | current contract + durable interpretation/control record | contract ID + revision |
| `intern_assigned` | Assignment creation + Worker | assignment ID |
| `work_started` | persisted WorkerRun `startedAt` + Assignment | run ID |
| `work_summary` | accepted bounded worker output / verified assignment summary | assignment ID + accepted result/run identity |
| `work_completed` | Assignment verified/accepted for current revision | assignment ID + verified state |
| `finding_added` | product-safe Evidence record | evidence ID |
| `evidence_gap_identified` | application-validated ResourceNeed | ResourceNeed ID/dedupe key |
| `manager_decision` | persisted ManagerialDecision, excluding completion-proposal rows | decision ID |
| `founder_action_required` | selected Attention source | attention ID + revision |
| `acquisition_started` | authorized external ExecutionIntent creation | intent ID |
| `acquisition_submitted` | durable M3 transaction submission fact | transaction/payment identity |
| `external_result_received` | durable external result/driver receipt fact | intent/result identity |
| `external_result_verified` | verified intent + matching AcquisitionResult/resultEvidenceId | resultEvidenceId |
| `work_resumed` | new run whose WorkContract explicitly links prior acquisition evidence | run ID |
| `artifact_changed` | immutable CompanyArtifact history version | artifact key + version |
| `verification_started` | durable pending final-assessment reservation if currently/historically supportable | assessment reservation identity |
| `verification_completed` | persisted final semantic assessment bound to exact artifact/revision | contract revision + assessed artifact version + assessedAt |
| `objective_completed` | accepted deterministic completion + Objective completion timestamp | Objective key + accepted completion revision |
| `objective_blocked` | durable control-state/block/recovery/failed fact | source state identity + timestamp |

### Current limitations

- Do NOT infer `acquisition_submitted` merely from M4 intent `handed_off`. M3 owns transaction submission.
- If the current read seam cannot access the M3 submission record, omit that event until the product projection reads it.
- Earlier overwritten semantic-assessment history cannot be recreated. V1 may show the current/latest durable assessment only.
- `verification_started` is emitted only when its pending assessment reservation is durably available. Otherwise omit it.
- `work_summary.actionCount` and `durationMs` are optional and require authoritative counters/timestamps.

## 22. Causality

Causality is supplied only from persisted relationships.

Examples:

- acquisition evidence → resumed work, only when WorkContract `inputEvidenceIds` explicitly links that evidence;
- acquisition evidence → artifact version, only when artifact history `usedAcquisitionEvidenceIds` cites it.

For `artifact_changed`:
- if exactly one product Activity item is the explicit causal source, populate `causedByActivityId`;
- with multiple independent evidence causes, omit the single causal line and use `related.evidenceIds`.

Never infer from temporal adjacency.

---

# PART VIII — ACTIVITY PAYLOADS

## 23. Payloads

The frontend proposal payloads are accepted:

```ts
type InternAssignedPayload = {
  intern: InternView;
  assignmentTitle: string;
  scope?: string;
  authorityNote?: string;
};

type FindingPayload = {
  finding: string;
  evidenceRefs?: { id: string; label: string }[];
};

type ManagerDecisionPayload = {
  selected: {
    approach: ProductApproach;
    label: string;
  };
  alternative?: {
    approach: ProductApproach;
    label: string;
  };
  reason?: string;
};

type WorkSummaryPayload = {
  summary: string;
  actionCount?: number;
  durationMs?: number;
};

type ArtifactChangedPayload = {
  deliverableId: string;
  before?: string;
  after?: string;
  changeSummary: string;
  evidenceRefs?: { id: string; label: string }[];
};

type VerificationPayload = {
  checks: {
    label: string;
    status: "passed" | "pending" | "failed";
  }[];
  remainingUnknowns?: string[];
};
```

`before`/ `after` content must come from real artifact versions. If prior full content is not durably retained, omit `before` rather than synthesize it.

---

# PART IX — DELIVERABLES

## 24. Contract

```ts
type DeliverableStatus =
  | "draft"
  | "current"
  | "verified"
  | "superseded";

type DeliverableView = {
  id: string;
  title: string;
  type: string;
  version: number | string;
  status: DeliverableStatus;
  summary?: string;
  content?: string;
  assumptions?: string[];
  unknowns?: string[];
  recommendedNextMove?: string;
  evidenceRefs?: { id: string; label: string }[];
  updatedAt: number;
};
```

## 25. Deliverable identity

A CompanyArtifact becomes a founder-facing Deliverable when it is governed as an output, specifically when its artifact key is:

- the `targetArtifactKey` of a current-revision bounded WorkContract for deliverable work; or
- the artifact key bound by the current final semantic assessment.

Arbitrary internal CompanyArtifacts do not automatically enter the Deliverables rail.

ID:

```text
deliverable:<objectiveKey>:<artifactKey>
```

## 26. Current selection

The backend projection, not React, determines current Deliverables.

For each governed artifact:

- exact current artifact version comes from CompanyArtifact `version`;
- primary current artifact is the exact key/version bound by a current final assessment when present;
- otherwise current target keys from current-revision WorkContracts are current.

If multiple current governed artifacts legitimately exist, return multiple Deliverables in deterministic order. React must not invent "latest wins".

## 27. Status semantics

### draft

Governed artifact exists but is not the current active target and is not verified/superseded.

### current

Artifact is a current governed target/output but has not met the strong `verified` definition below.

### verified

Use this deliberately strong meaning:

> The exact current artifact key/version received a positive final semantic assessment for the current contract revision AND the deterministic Objective completion gate accepted the current minimum bar.

Therefore:

- artifact mutation alone is not verified;
- worker delivery alone is not verified;
- Assignment verification alone is not verified;
- positive final semantic assessment alone is not verified.

This keeps founder-facing `verified` aligned with the product's "done means proved" promise.

### superseded

Artifact was a governed deliverable target for an older/superseded contract/output path and is no longer a current governed target.

## 28. Deliverable metadata

For an assessment bound to the exact current artifact version:

- `assumptions` / `unknowns` ← persisted final assessment assumptions/unknowns;
- `recommendedNextMove` ← persisted final assessment recommended next action;
- `evidenceRefs` ← validated final-assessment evidence refs plus explicit artifact revision evidence provenance where appropriate.

If the assessment is stale relative to current artifact version or contract revision, do not project its metadata as current.

`summary` may use latest artifact change note.
`content` is the actual current persisted artifact content, bounded only for transport/display with explicit truncation if required.

---

# PART X — ATTENTION / NEEDS YOU

## 29. Attention contract

```ts
type AttentionType =
  | "approval"
  | "clarification"
  | "choice"
  | "reconciliation";

type AttentionState = {
  id: string;
  revision: string;
  type: AttentionType;
  title: string;
  detail: string;
  context?: {
    reason?: string;
    amount?: MoneyView;
  };
  actions: AttentionActionView[];
};

type AttentionActionType =
  | "approve"
  | "decline"
  | "choose"
  | "provide_input"
  | "acknowledge";

type AttentionActionView = {
  id: string;
  type: AttentionActionType;
  label: string;
  requiresText?: boolean;
  destructive?: boolean;
  confirmText?: string;
};
```

## 30. Dominant attention priority

V1 returns at most one dominant AttentionState.

Priority:

1. financial/external `reconciliation_required`;
2. explicit pending approval tied to a current decision/authority request;
3. explicit ASK_FOUNDER / escalation clarification or choice;
4. other recovery/block condition only when a legal founder command exists.

A blocker with no founder-remediable command is `Objective.status = blocked`, not fake attention.

## 31. Identity and revision

Attention IDs come from source identity, never text:

- reconciliation → intent/driver identity;
- approval → decision/approval identity;
- clarification/choice → persisted request/decision identity.

`revision` is an opaque source revision token tied to the exact authority request.

Commands revalidate that source identity/revision at execution time.

## 32. Legal actions only

V6 renders only actions returned by the backend projection.

If no safe product command adapter exists yet:

```ts
actions: []
```

is correct.

The UI must never invent Retry / Approve / Reconcile from labels or error text.

---

# PART XI — ACQUISITIONS / TRANSACTIONS

## 33. Money

```ts
type MoneyView = {
  amount: string;
  currency: string;
};
```

Backend supplies display-safe decimals.

Frontend does not perform financial arithmetic or authority checks.

## 34. Acquisition

```ts
type AcquisitionProductStatus =
  | "proposed"
  | "needs_approval"
  | "in_progress"
  | "result_received"
  | "verified"
  | "failed"
  | "reconciliation_required";

type TransactionFactView = {
  status:
    | "not_started"
    | "submitted"
    | "confirmed"
    | "failed"
    | "reconciliation_required";
  label: string;
  txHash?: string;
  explorerUrl?: string;
};

type AcquisitionView = {
  id: string;
  resourceLabel: string;
  providerLabel?: string;
  amount?: MoneyView;
  status: AcquisitionProductStatus;
  transaction?: TransactionFactView;
  resultSummary?: string;
  provenance?: ExternalProvenance;
  updatedAt: number;
};
```

## 35. Acquisition status mapping

- **proposed** — authorized/selected BUY proposal exists but no external intent has yet become the active acquisition.
- **needs_approval** — current acquisition authority explicitly requires founder approval and it has not been granted.
- **in_progress** — external acquisition intent is authorized/at boundary/submitted and no provider result has yet been accepted as received.
- **result_received** — durable provider/driver result exists but the acquisition result has not yet passed application verification.
- **verified** — ExecutionIntent is `verified` AND a matching AcquisitionResult with the same `resultEvidenceId` is persisted/verified.
- **failed** — governing acquisition/effect failed.
- **reconciliation_required** — external/financial state is ambiguous and must be reconciled.

### Meaning of `verified`

`Acquisition.status = verified` means:

> the external acquisition result/receipt is verified as the authoritative result of that governed acquisition and may be used as acquired input subject to scope.

It does NOT mean:

- the evidence is semantically sufficient;
- the Requirement is satisfied;
- the artifact is verified;
- the Objective is complete.

## 36. Transaction truth

TransactionFactView must come from the authoritative M3/payment ledger or equivalent durable financial record.

Do NOT infer:

- `submitted` merely from M4 `handed_off`;
- `confirmed` from provider result;
- `confirmed` from ExecutionIntent verification.

If the V6 read projection cannot currently read the authoritative M3 transaction fact, omit `transaction`.

For `simulation`:
- no live transaction fact is shown.

For `recorded_replay`:
- do not represent the replay run as a new transaction;
- any historical original transaction receipt must be clearly identified as historical/original if surfaced later.

---

# PART XII — AVAILABLE ACTIONS

## 37. Objective actions

```ts
type ObjectiveActionType =
  | "resume"
  | "retry";

type ObjectiveActionView = {
  id: string;
  type: ObjectiveActionType;
  label: string;
  confirmText?: string;
};
```

Current V1 rule:

> If there is no explicitly implemented and backend-validated product command for a case, do not return an action.

The current M6.1 runtime does not expose a generic founder "retry engine" primitive.

Therefore `availableActions` may legitimately be empty for all current Objectives until a specific safe product adapter is implemented.

---

# PART XIII — START / CREATE OBJECTIVE

## 38. Capabilities

```ts
type StartCapabilitiesView = {
  canCreateObjective: boolean;
  supportsContextRefs: boolean;
  supportsAttachments: boolean;
  advanced: {
    spendLimit: boolean;
    deadline: boolean;
    externalEffectPolicy: boolean;
  };
};
```

## 39. Current backend capability

**Implementation status (Create Objective):** wired.

V6 `/start` creates Objectives through the Product Command adapter
`productCommands.createObjectiveV1`, which reuses the authoritative
`createReceivedObjective` / legacy `submitObjective` semantics.

Advertised StartCapabilities:

- `canCreateObjective`: **true** (Create Objective Product Command is wired);
- `supportsContextRefs`: **false**;
- `supportsAttachments`: **false**;
- `advanced.spendLimit`: **false** (create-time spend limit remains unwired; runtime spend approval is a separate Attention command);
- `advanced.deadline`: **false**;
- `advanced.externalEffectPolicy`: **false**.

Unsupported optional Create Objective fields (contextRefs / advanced options)
are rejected as `not_allowed` if supplied — they are not silently accepted.

Submit Attention Action V1 is wired for **spend approval only** (`approve_spend` /
`spend_authority_required`). Other Attention action families and founder free text /
resume/retry remain unwired.

The older controlled setup route remains operator-protected/demo-bounded and is
not the V6 Product Command API.

No fake persistence.

---

# PART XIV — COMMAND CONTRACT

## 40. Create Objective

```ts
type CreateObjectiveCommand = {
  request: string;
  contextRefs?: string[];
  advanced?: {
    spendLimit?: MoneyView;
    deadline?: string;
    externalEffectPolicy?: string;
  };
};
```

Current support:

| Field | Current V1 backend truth |
| --- | --- |
| `request` | **wired** via `productCommands.createObjectiveV1` |
| `contextRefs` | unsupported — rejected as `not_allowed` |
| `advanced.spendLimit` | unsupported on the product command — rejected as `not_allowed` |
| `advanced.deadline` | unsupported — rejected as `not_allowed` |
| `advanced.externalEffectPolicy` | unsupported — rejected as `not_allowed` |

V6 React must call the Product Command adapter only — never
`api.objectives.submitObjective` or internal/demo setup mutations.

## 41. Attention action

```ts
type SubmitAttentionActionCommand = {
  objectiveId: string;
  attentionId: string;
  attentionRevision: string;
  actionId: string;
  text?: string;
};
```

Contract accepted.

Implementation status: **wired for spend approval only** via
`productCommands.submitAttentionActionV1`.

Current legal action:

| Field | Current V1 backend truth |
| --- | --- |
| `actionId = approve_spend` | **wired** — persists bounded `FounderSpendGrant`, resolves the exact `pending_approval`, writes `approval_resolved` wake, schedules normal management pass |
| other action ids | unsupported — rejected as `not_allowed` |
| `text` | unsupported — rejected as `not_allowed` |

Needs You (`objective.status = needs_you`) is emitted only when this legal
spend-approval action is actually available. Other `approval_required` reasons
(`material_ambiguity`, `waiver_requires_authorization`,
`external_effect_requires_approval`) remain non-actionable and project as
waiting/blocked without buttons.

This command grants bounded M4 spend authority. It does **not** equal M3 payment,
does not submit a transaction, and does not mark a Requirement satisfied.

Specific internal approval/reconciliation mechanics must not be exposed directly to React.

Until an adapter maps a specific AttentionAction to existing backend authority safely, that attention item returns no clickable action.

## 42. Founder input

```ts
type AddFounderInputCommand = {
  objectiveId: string;
  text: string;
  contextRefs?: string[];
};
```

Contract shape is reserved, but generic free-form founder input is **not currently supported** by the accepted M6.1 product command seam.

V1 projection must not advertise it as a capability.

Park implementation until a governed ingestion rule is explicitly approved.

## 43. Objective action

```ts
type InvokeObjectiveActionCommand = {
  objectiveId: string;
  actionId: string;
  expectedViewRevision: string;
};
```

Contract accepted for future legal actions.

Current V1 backend exposes no generic resume/retry product action.

Return `availableActions=[]` unless a later implementation adds an explicit safe case.

## 44. Result envelope

```ts
type ProductCommandResult =
  | {
      accepted: true;
      commandId: string;
      objectiveId: string;
    }
  | {
      accepted: false;
      error: ProductCommandError;
    };

type ProductCommandError = {
  code:
    | "validation_error"
    | "not_allowed"
    | "stale_view"
    | "conflict"
    | "temporarily_unavailable"
    | "reconciliation_required";
  message: string;
};
```

Accepted.

Normal product flows must not require raw exception text.

---

# PART XV — UI / INFRASTRUCTURE STATES

## 45. Lifecycle matrix

| Product state | Somebody card | Activity | Right rail | Founder action |
| --- | --- | --- | --- | --- |
| start | composer | tasteful empty | capability-gated | create only |
| starting | interpreting | interpretation when durable | checkpoints pending | none |
| working | current management/work | active events | current deliverable/checkpoints | only advertised input/action |
| waiting | calm wait | last meaningful event retained | current truth | none unless Attention exists |
| needs_you | explicit ask | attention event | dominant Attention | returned actions only |
| verifying | verification | assessment/verification event | current deliverable | normally none |
| completed | done/proved | completion event | verified deliverable/checkpoints | none by default |
| blocked | blocker | blocker event | affected checkpoint | only returned legal action |

## 46. Infrastructure states

Separate from Objective lifecycle:

- query loading;
- stale/reconnecting;
- Objective not found;
- product projection unavailable;
- command submitting;
- command rejected;
- transient network failure.

Stale projection may remain visually rendered, but stale attention actions fail closed.

---

# PART XVI — SOURCE-OF-TRUTH MATRIX

## 47. Mapping

| Product field | Authoritative backend source | Projection rule | Nullable? | Stability |
| --- | --- | --- | --- | --- |
| Objective status | Objective row + latest durable management/control state + completion verdict + current Attention/external state | Section 6 precedence | no | recomputed from current truth |
| Objective title/request | Objective request | deterministic bounded title + exact request | no | stable request |
| Somebody Now | same current facts driving status/current work/attention | deterministic templates | no | changes only when driving fact changes |
| Checkpoints | current-revision required Requirements + dependency graph + resolutions | Section 13 | array may be empty while starting | stable within contract revision |
| Current Work | current decision/assignment/run/intent | Section 15 | yes | source identity |
| Intern | Worker + current Assignment + current Run | Section 17 | yes | source identity |
| Activity | durable domain rows/histories; typed financial result sources | Section 21 | may omit unsupported event types | deterministic IDs |
| Deliverables | governed CompanyArtifacts + WorkContract target + final assessment + completion verdict | Sections 25–28 | array may be empty | artifact key/version |
| Attention | approval/ASK/reconciliation source facts | Sections 29–32 | yes | source ID + revision |
| Acquisition | ManagerialDecision + ExecutionIntent + AcquisitionResult + M3 transaction fact | Sections 34–36 | array may be empty | intent/result identity |
| availableActions | explicit implemented Product Command capabilities | no inference | may be empty | action source revision |
| StartCapabilities | actual wired Product Command adapter | advertise only real fields | no | deployment capability |

---

# PART XVII — FRONTEND SURFACE MATRIX

## 48. V6 needs

| V6 surface | Contract |
| --- | --- |
| Objective rail | `ObjectiveListView` |
| Objective header | `ObjectiveView` |
| Somebody update card | `SomebodyNowView` |
| Checkpoints | `ProgressView` |
| Current bounded work | `CurrentWorkView` |
| Intern visual | `InternView` |
| Activity | `ActivityItem[]` |
| Delegation | `intern_assigned` payload |
| Finding | `finding_added` payload |
| MAKE/BUY fork | `manager_decision` payload |
| Acquisition receipt | `AcquisitionView` + Activity |
| causal line | explicit `causedByActivityId` only |
| artifact change | `artifact_changed` |
| Deliverables rail | `DeliverableView[]` |
| Needs You | `AttentionState` |
| start controls | `StartCapabilitiesView` |
| completed verification | accepted completion + verified Deliverable |

---

# PART XVIII — RECONCILIATION DECISIONS

## 49. Five previously open semantic decisions

### Checkpoints — ACCEPT WITH BACKEND-DEFINED SEMANTICS

Resolved by Section 13.

They are current required Requirement projections, compressed to at most five without changing authoritative Requirement truth.

### Activity — ACCEPT WITH BACKEND-DEFINED SEMANTICS

Resolved by Sections 18–22.

V1 is deterministic projection over durable records, not a second event-sourced business state machine. Unsupported historical transitions are omitted.

### Intern done — ACCEPT WITH BACKEND-DEFINED SEMANTICS

Resolved by Section 17.

`done` means the bounded Assignment itself is application-verified for the current revision. Nothing stronger.

### Deliverable verified — MODIFY / STRONG DEFINITION

Resolved by Section 27.

`verified` requires exact-version positive semantic assessment plus accepted deterministic Objective completion gate.

### Acquisition verified — ACCEPT WITH BACKEND-DEFINED SEMANTICS

Resolved by Section 35.

It means the acquisition result/receipt itself is verified, not Requirement satisfaction.

---

# PART XIX — GAP TRIAGE

## 50. Current gaps

| Finding | Classification | Why / evidence | Smallest action | Blocks initial V6 read wiring? |
| --- | --- | --- | --- | --- |
| V6 product projection query does not yet exist | **Act Now** | M5 composer is precursor but exposes raw arrays and older shapes | implement one V6 projection/read adapter against this contract | yes |
| Objective lightweight list query does not yet exist | **Act Now** | current M5 seam is one full workspace | add lightweight backend list projection | yes for sidebar |
| Full current artifact content/current deliverable projection absent from M5 | **Act Now** | M5 ArtifactView exposes version summaries only | project governed current artifact content/status | yes for Deliverables |
| M3 transaction truth is not currently joined into M5 workspace | **Act Now** only if V6 displays transaction status | M5 explicitly says payment view is derived from M4 and M3 is separate authority | join authoritative M3 read fact or omit transaction | only for transaction UI |
| Typed V6 Activity payload projection does not yet exist | **Act Now** | MissionStory is useful precursor but coarser | implement deterministic V6 mapper | yes for Activity |
| Generic Attention command adapter absent | **Investigate Now** | internal authority paths exist but not one product command | implement only required demo-safe actions; otherwise actions=[] | no for read-only card |
| Generic create-objective product adapter absent | **Resolved** | `productCommands.createObjectiveV1` reuses authoritative create semantics; `canCreateObjective=true` | keep other command flags false until wired | yes for /start |
| Generic founder free-text input absent | **Park for Later** | no accepted ingestion semantics | do not advertise | no |
| Generic resume/retry action absent | **Park for Later** | no safe generic product primitive | availableActions=[] | no |
| Historical multiple final-assessment events are not durably reconstructable | **Ignore / Accept Risk for V1** | current record retains current/latest assessment, not full history | show current/latest truth; persist history later only if product needs it | no |
| More than five required Requirements need visual compression | **Ignore / Accept Risk** | V1 deterministic aggregate preserves truth without exposing every Requirement | use Section 13 aggregate | no |
| Before-content for old artifact versions may be unavailable | **Ignore / Accept Risk** | current artifact history stores notes/provenance, not necessarily full previous content | omit `before` when unavailable | no |

No backend architecture redesign is required.

---

# PART XX — PROHIBITED BEHAVIOR

## 51. Do not

- wire primary V6 components to raw Convex tables;
- expose raw Objective engine states as product status;
- equate Requirement state with Checkpoint without the projection rules above;
- infer Objective completion from Worker/Assignment state;
- call an Intern done because a run stopped or submitted a result;
- infer transaction submission from M4 handoff;
- infer transaction confirmation from result arrival;
- infer acquisition usefulness from acquisition verification;
- infer Deliverable verification from an artifact version bump;
- infer causality from timestamps;
- parse arbitrary event prose into authority;
- invent Retry/Resume/Approve/Reconcile buttons;
- portray simulation/replay as a new live payment;
- synthesize Activity counts/durations;
- expose hidden chain-of-thought;
- make React responsible for financial arithmetic;
- use this contract to change M6.1 lifecycle semantics.

---

# PART XXI — IMPLEMENTATION ORDER

## 52. Recommended wiring sequence

1. create V6 product contract TypeScript types;
2. implement pure backend projection helpers with focused truth-table tests;
3. implement lightweight Objective list query;
4. implement Objective + Somebody Now + Checkpoints projection;
5. implement Current Work / Intern;
6. implement typed Activity projection;
7. implement Deliverables;
8. implement Acquisition projection, joining M3 facts only if V6 needs transaction display;
9. implement Attention read projection;
10. implement narrow /start Product Command adapter;
11. implement only the founder actions genuinely required by the accepted demo;
12. wire React exclusively to these contracts;
13. keep X-ray/debug surfaces separate.

Do not begin by copying M5 raw arrays into V6 React components.

---

# PART XXII — ACCEPTANCE BAR FOR PRODUCTION WIRING

## 53. Contract acceptance

Backend/frontend reconciliation is complete for V1.

The following are now settled:

- [x] one Objective product status and precedence;
- [x] Somebody Now is projection-owned;
- [x] sidebar summaries are projection-owned;
- [x] Checkpoints are projection-owned and not a second progress authority;
- [x] Activity vocabulary is explicit and source-mapped;
- [x] Activity causality is explicit or absent;
- [x] Intern state does not leak Worker lifecycle semantics into React;
- [x] current Deliverable selection is backend-owned;
- [x] Deliverable `verified` has a strong exact definition;
- [x] Attention exposes only backend-advertised actions;
- [x] stale attention commands use source revision;
- [x] acquisition/payment/result/verification remain distinct;
- [x] simulation/replay/live provenance remains explicit;
- [x] /start fields are capability-gated;
- [x] React does not inspect engine rows to decide completion;
- [x] no primary V6 component requires raw Requirement/Assignment/Intent rows.

**V6 production read-model wiring may begin against this contract.**

Command wiring remains capability-gated exactly as documented; unsupported commands must remain absent rather than mocked.

---

# 54. Relationship to existing code/docs

Visual/product presentation:

- `DESIGN.md`
- `docs/design/prototypes/SOMEBODY_OKX_V6_APPROVED.md`

Existing precursor normalization seam:

- `lib/m5/workspaceModel.ts`
- `convex/m5Workspace.ts`
- `app/m5/workspace.ts`

Current backend truth used for reconciliation:

- `build/model-portability-milestone-2@a8090f8`
- `ARCHITECTURE.md`
- `PRODUCT_SPEC.md`
- `DECISIONS_LOG.md`
- M6.1 Objective/management/workforce/transaction implementation

The M5 composer remains useful precedent, but this document is the accepted V6 product-contract SSOT.
