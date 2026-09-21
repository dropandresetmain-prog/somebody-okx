# Somebody × OKX — Frontend Contracts

Status: **FRONTEND / BACKEND RECONCILIATION DRAFT — REQUIRED BEFORE V6 PRODUCTION WIRING**  
Updated: **22 September 2026**  
Visual source of truth: `DESIGN.md` / approved V6 direction  
Scope: product-facing read and command contracts between the M6.1 engine and the founder UI

---

## 1. Purpose

The frontend must consume a stable product-facing projection, not raw engine state.

The contract boundary is:

```text
ENGINE / CONVEX / EXTERNAL TRUTH
        ↓
PRODUCT PROJECTION / FRONTEND CONTRACT
        ↓
V6 UI
```

Not:

```text
ENGINE TABLES
        ↓
INDIVIDUAL REACT COMPONENTS INTERPRET BACKEND STATE
```

The projection layer exists so the UI remains understandable and stable even if M6.1 internals continue changing.

Backend remains authoritative for:

- factual state;
- lifecycle;
- authority;
- spend;
- external effects;
- evidence;
- completion;
- reconciliation.

Frontend remains authoritative for:

- layout;
- visual hierarchy;
- labels;
- mascot/pose selection;
- animation;
- progressive disclosure;
- component rendering.

The frontend must never manufacture business truth from visual state.

---

## 2. Product language boundary

Founder-facing language:

- **Somebody** — accountable manager.
- **Intern** — bounded internal worker.
- **External provider/resource** — external capability; "Somebody Else" may be used selectively in copy.
- **Objective** — what the founder asked Somebody to accomplish.
- **Activity** — meaningful business events over time.
- **Deliverable** — founder-facing output.
- **Checkpoint** — founder-facing condition/progress marker.
- **Needs you** — Somebody requires founder authority or judgment.

Backend may continue using implementation terms such as:

- Worker;
- Requirement;
- Assignment;
- WorkContract;
- ManagerialDecision;
- ExecutionIntent;
- ResourceNeed;
- completion gate.

Those terms do not automatically belong in the product contract.

**Executive decision:** founder-facing UI uses **Intern**, not **That Guy**.

---

## 3. Contract principles

### 3.1 Backend projection owns interpretation

React must not infer:

- Objective completion from worker/run state;
- requirement satisfaction from assignment completion;
- acquisition success from transaction submission;
- external usefulness from result arrival;
- verification from artifact existence;
- retry legality from an error message;
- causal relationships from timestamps.

The projection layer resolves those distinctions before data reaches V6.

### 3.2 State simplification is expected

Multiple engine states may collapse into one product-facing state.

For example:

```text
several planning / dispatch / running states
→ working
```

The frontend should not know why an engine state maps to `working`; it should only receive the truthful product state.

### 3.3 No hidden chain-of-thought

Activity, rationale and Somebody updates contain concise product summaries and evidence references only.

Never expose:

- hidden reasoning;
- raw model scratchpads;
- LangGraph node traces;
- internal prompt transcripts;
- raw terminal bookkeeping.

### 3.4 Reads and commands are separate

Read contracts describe what the founder may see.

Command contracts describe what the founder may ask the product to do.

No component directly mutates engine rows.

### 3.5 Missing truth stays missing

If the projection cannot truthfully provide a field, return null/absence or a safe product state.

Do not fabricate a placeholder business fact merely to complete the V6 layout.

---

# PART I — PRODUCT READ CONTRACT

## 4. Read surfaces

The frontend requires two primary read shapes:

1. **ObjectiveListView** — lightweight sidebar navigation.
2. **ObjectiveWorkspaceView** — one selected Objective.

A separate **StartCapabilitiesView** may be required for `/start` if advanced Objective options are not universally supported.

Suggested transport envelope:

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

`viewRevision` is a product-projection revision/token suitable for stale-command protection. It is not a Convex table revision exposed to the UI.

---

## 5. Objective list / sidebar

V6 needs a lightweight list contract rather than full Objective workspaces for every sidebar row.

```ts
type ObjectiveProductStatus =
  | "starting"
  | "working"
  | "waiting"
  | "needs_you"
  | "verifying"
  | "completed"
  | "blocked";

type ObjectiveSummaryView = {
  id: string;
  title: string;
  status: ObjectiveProductStatus;
  updatedAt: number;

  // Optional concise context for the sidebar only.
  statusLabel?: string;

  // Product truth supplied by the projection.
  hasAttention: boolean;
};

type ObjectiveListView = {
  inProgress: ObjectiveSummaryView[];
  needsYou: ObjectiveSummaryView[];
  done: ObjectiveSummaryView[];
};
```

### Rules

- Sidebar grouping is projection truth, not client-side inspection of engine states.
- `blocked` may remain in `inProgress` with blocked treatment unless product design later adds a separate group.
- No raw Requirement/Assignment counts in the sidebar.
- No fake completion percentages.

---

## 6. Objective workspace

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

This is the default V6 product read contract.

The UI should not require direct access to raw Requirements, Workers, Assignments, Decisions, ExecutionIntents or completion-gate rows.

---

## 7. ObjectiveView

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

### Required meaning

`status` is the founder-facing Objective truth.

It is **not** a pass-through of the engine's Objective enum.

### Product state intent

| Product state | Founder meaning |
| --- | --- |
| `starting` | Objective accepted; Somebody is interpreting/setting up the work. |
| `working` | Somebody is actively managing or executing the Objective. |
| `waiting` | Progress is legitimately waiting on an external/resource/time condition; founder action is not currently required. |
| `needs_you` | Founder authority, judgment or input is required. |
| `verifying` | Work may be delivered, but Somebody is still checking the required outcome. |
| `completed` | Required outcome has been truthfully accepted/verified. |
| `blocked` | Objective cannot currently progress without a material change; reason must be available in product state/activity. |

A worker finishing must never cause `completed` by itself.

---

## 8. SomebodyNowView

This drives the high-emphasis Somebody card at the top of V6.

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

### Rules

- This must be projection-owned copy/state.
- The frontend must not build this headline by inspecting worker/intent rows.
- Keep it concise enough for the V6 Somebody card.
- Internal engine IDs do not belong here.

Examples:

- "Somebody is checking why the launch message is not landing."
- "Somebody is comparing internal research with an external data source."
- "Somebody needs your approval before spending $18."
- "Somebody is verifying the final relaunch recommendation."

---

## 9. ProgressView / Checkpoints

V6 intentionally uses **Checkpoints**, not fake percentage completion.

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

  // Optional founder-facing phase label.
  currentPhase?: string;
};
```

### Rules

- Target 2–5 checkpoints.
- Checkpoints are product projections, not raw Requirement rows.
- The backend/projection layer determines how current outcome/requirements map into checkpoints.
- A checkpoint checkmark must be backed by authoritative truth.
- No percentage should be synthesized from checkpoint count.

### Current gap

V6 currently demonstrates checkpoints such as:

- Diagnose what isn't working.
- Ground the direction in evidence.
- Produce and verify the recommendation.

The backend projection rule for deriving stable founder-facing checkpoints from the current Outcome Contract / Requirements is **not yet formally agreed**.

**Do not hard-code the canonical demo checkpoint labels into reusable production components.**

---

## 10. CurrentWorkView

The UI may show one current bounded piece of work where useful, but it should receive a product abstraction.

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

  // Present only when this distinction helps the founder.
  approach?: ProductApproach;

  intern?: InternView;

  startedAt?: number;
  updatedAt: number;
};
```

### Rules

- `HYBRID` is not required in the founder-facing contract for the current V6 path; a hybrid managerial plan may appear as separate bounded actions after reassessment.
- The frontend must not infer `done` from a run stopping.
- The frontend chooses the Intern mascot pose from `InternView.state`.

---

## 11. InternView

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

### Presentation mapping

Frontend-only:

| Intern state | V6 visual |
| --- | --- |
| `idle` | eager neutral |
| `assigned` | receiving assignment |
| `working` | laptop / active work |
| `waiting` | needs-input pose |
| `done` | proud/done pose |

Backend does not need to know image filenames or animation details.

---

# PART II — ACTIVITY CONTRACT

## 12. Activity principles

Activity is the key V6 differentiator.

It must show **meaningful moves, not machine noise**.

Do not generate Activity by passing through arbitrary persisted rows.

Activity items are authored/projected product events.

### Activity must be able to answer

- What meaningful thing happened?
- Who did it?
- Why does it matter?
- What changed?
- What caused a later change, where causality is actually known?
- Does the founder need to act?
- Is an external result only received, or actually verified?

---

## 13. Activity vocabulary

Initial V1 vocabulary:

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

This vocabulary is product-facing and may be refined during backend reconciliation, but raw graph-wake / terminal-bookkeeping event types must not leak into it.

---

## 14. ActivityItem

```ts
type ActivityActor =
  | {
      kind: "somebody";
      label: "Somebody";
    }
  | {
      kind: "intern";
      id: string;
      label: string;
    }
  | {
      kind: "founder";
      label: string;
    }
  | {
      kind: "external";
      id?: string;
      label: string;
    };

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

  // Explicit supplied product causality only.
  // Never infer from timestamps.
  causedByActivityId?: string;

  // Relevant only to simulated/replayed/live external-boundary events.
  provenance?: ExternalProvenance;

  payload?: ActivityPayload;
};
```

### Important rule

If `causedByActivityId` is absent, the renderer must not invent a causal connector merely because events are adjacent.

---

## 15. Activity payloads

Payloads should be bounded and semantic.

### Intern assignment

```ts
type InternAssignedPayload = {
  intern: InternView;
  assignmentTitle: string;
  scope?: string;
  authorityNote?: string;
};
```

Supports the V6 visual:

```text
Somebody → Intern → bounded assignment
```

### Finding

```ts
type FindingPayload = {
  finding: string;

  evidenceRefs?: {
    id: string;
    label: string;
  }[];
};
```

### Managerial decision

```ts
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
```

This powers the compact MAKE vs BUY fork.

The frontend does not re-score or re-decide options.

### Work summary

```ts
type WorkSummaryPayload = {
  summary: string;

  // Include only when backed by actual data.
  actionCount?: number;
  durationMs?: number;
};
```

V6 may compress low-level work into one product event.

If action count or duration is not authoritative, omit it. Do not invent "12 actions" or "8 minutes" for theatre.

### Artifact change

```ts
type ArtifactChangedPayload = {
  deliverableId: string;

  before?: string;
  after?: string;

  changeSummary: string;

  evidenceRefs?: {
    id: string;
    label: string;
  }[];
};
```

The projection should provide the exact before/after content when the product can truthfully show it.

### Verification

```ts
type VerificationPayload = {
  checks: {
    label: string;
    status: "passed" | "pending" | "failed";
  }[];

  remainingUnknowns?: string[];
};
```

---

# PART III — DELIVERABLE CONTRACT

## 16. DeliverableView

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

  evidenceRefs?: {
    id: string;
    label: string;
  }[];

  updatedAt: number;
};
```

### Rules

- Projection identifies which deliverable/version is current.
- The frontend must not select "latest" by sorting arbitrary artifact rows.
- `verified` comes from authoritative product truth.
- A version bump alone does not imply material completion.
- Supporting incomplete work/unknowns must remain visible where product truth requires disclosure.

### Current gap

The current M5 `ArtifactView` exposes version summaries but not a stable founder-facing deliverable with current content/status.

The V6 Deliverables rail therefore requires a stronger projection.

---

# PART IV — ATTENTION / FOUNDER ACTION

## 17. AttentionState

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
```

Only one dominant founder-attention interrupt is required by the current V6 experience. If multiple internal attention items exist, the projection must decide how to present/prioritize them rather than forcing React to resolve conflicts.

---

## 18. AttentionActionView

```ts
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

  // Optional confirmation copy for higher-risk actions.
  confirmText?: string;
};
```

### Critical rule

V6 renders **only actions returned by the contract**.

The UI must not decide:

- retry is allowed;
- approval can be raised;
- an effect can be resumed;
- reconciliation can be bypassed.

---

# PART V — ACQUISITION / SPEND CONTRACT

## 19. MoneyView

```ts
type MoneyView = {
  amount: string;
  currency: string;
};
```

Use display-safe decimal strings rather than asking the UI to perform financial arithmetic.

---

## 20. AcquisitionView

The UI should understand user-relevant acquisition truth without understanding the M3/M4 transaction machinery.

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

  provenance: ExternalProvenance;

  updatedAt: number;
};
```

### Truthfulness rules

- `submitted` must never render as confirmed.
- payment confirmation must never imply provider result received.
- result received must never imply semantic usefulness.
- `verified` requires whatever authoritative acceptance the backend contract defines.
- `simulation` and `recorded_replay` must remain explicit.
- UI must not label a replay/simulation as a new live payment.

The contract may omit transaction detail entirely when it is not relevant to the founder-facing event.

---

# PART VI — AVAILABLE PRODUCT ACTIONS

## 21. ObjectiveActionView

For non-attention commands such as a genuinely supported resume/retry action:

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

### Rule

If the backend does not return an action, the frontend does not invent one.

---

# PART VII — START / CREATE OBJECTIVE

## 22. StartCapabilitiesView

V6 visually demonstrates optional advanced Objective inputs, but the frontend must not promise unsupported behavior.

Suggested read capability:

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

The `/start` renderer hides unsupported controls.

### Current gap

Current backend support for all V6 illustrative advanced controls has not been reconciled.

Until then:
- `request` is the only unquestionably required create field;
- unsupported advanced controls must not be wired as fake persistence.

---

# PART VIII — PRODUCT COMMAND CONTRACT

## 23. General command principles

Commands express founder intent.

They do not expose internal state mutation primitives.

Every state-changing command:
- is backend-validated;
- is authorization-aware;
- is idempotent where appropriate;
- fails safely on stale attention/revision;
- returns a product-level result/error;
- does not ask React to repair engine state.

---

## 24. Create Objective

```ts
type CreateObjectiveCommand = {
  request: string;

  contextRefs?: string[];

  // Only include when advertised by StartCapabilitiesView.
  advanced?: {
    spendLimit?: MoneyView;
    deadline?: string;
    externalEffectPolicy?: string;
  };
};
```

Backend returns the created Objective identifier / accepted product response.

Frontend does not choose Workers, Requirements, MAKE/BUY strategy, provider or workflow.

---

## 25. Submit attention action

```ts
type SubmitAttentionActionCommand = {
  objectiveId: string;

  attentionId: string;
  attentionRevision: string;

  actionId: string;

  text?: string;
};
```

This is the primary command behind V6 **Needs you**.

The backend rechecks legality/authority at execution time.

---

## 26. Add founder input

Free text may be permitted without turning the whole application into chat.

```ts
type AddFounderInputCommand = {
  objectiveId: string;
  text: string;

  contextRefs?: string[];
};
```

The backend decides how/if this input affects the current Objective.

Frontend does not directly patch the plan or Requirements.

---

## 27. Invoke available Objective action

Only for actions explicitly returned by `availableActions`.

```ts
type InvokeObjectiveActionCommand = {
  objectiveId: string;
  actionId: string;
  expectedViewRevision: string;
};
```

Use for supported `resume` / `retry` semantics only after backend reconciliation.

No generic "retry engine" button.

---

## 28. Command result envelope

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

No raw exception text should be required for normal founder UX.

---

# PART IX — UI STATE MATRIX

## 29. Product lifecycle states

| State | Somebody card | Activity | Right rail | Founder input |
| --- | --- | --- | --- | --- |
| `/start` | start hero/composer | tasteful empty | tasteful empty | composer |
| `starting` | interpreting | may be empty / first event | checkpoints pending | none unless requested |
| `working` | current managerial update | active | deliverable/checkpoints | optional founder input |
| `waiting` | calm waiting state | last meaningful event retained | checkpoints current | no forced action |
| `needs_you` | Somebody needs your say | founder-action event | dominant attention card | legal actions only |
| `verifying` | verification update | verification event | deliverable visible | normally none |
| `completed` | done / verified | completion history | verified deliverable/checkpoints | optional follow-up later |
| `blocked` | clear blocked reason | blocker event | affected checkpoint | only returned legal action(s) |

---

## 30. Infrastructure UI states

These are separate from Objective lifecycle:

- initial query loading;
- reconnecting / stale projection;
- Objective not found;
- product projection unavailable;
- command submitting;
- command rejected;
- transient network error.

Do not translate a network error into `ObjectiveStatus = "blocked"`.

### Loading

Preserve stable shell where possible:
- sidebar skeleton;
- Objective header skeleton;
- Activity skeleton.

Do not show fake business state while loading.

### Stale/reconnecting

Retain the last accepted projection with a small stale/reconnecting indication.

Do not let stale attention actions silently submit; command revision checks must fail closed.

### Projection unavailable

Show product-level technical failure state and retry the read as appropriate.

Do not dump Convex/model stack traces into founder UI.

---

# PART X — FIELD-BY-SURFACE REQUIREMENTS

## 31. V6 surface matrix

| V6 surface | Required contract data |
| --- | --- |
| Objective rail | `ObjectiveListView` |
| Objective header | `ObjectiveView.title/request/status` |
| Somebody update card | `SomebodyNowView` |
| Activity | `ActivityItem[]` |
| Delegation event | `intern_assigned` payload |
| Finding card | `finding_added` payload |
| MAKE/BUY fork | `manager_decision` payload |
| Acquisition receipt | `AcquisitionView` and/or acquisition Activity payload |
| Evidence → artifact causal line | explicit `causedByActivityId` |
| Before/after diff | `artifact_changed` payload |
| Deliverables rail | `DeliverableView[]` |
| Checkpoints rail | `ProgressView.checkpoints` |
| Needs You card | `AttentionState` |
| /start advanced controls | `StartCapabilitiesView` |
| Completed verification card | `verification_completed` payload + completed Objective truth |

---

# PART XI — CURRENT M5/M6.1 MAPPING AUDIT

## 32. Existing useful seams

Current repo already has important precursor work:

### `lib/m5/workspaceModel.ts`

Good principles already present:
- backend-composed normalized read model;
- React is not intended to be the join layer;
- missing facts degrade to truthful empty states;
- worker result ≠ assignment verified ≠ Requirement satisfied ≠ Objective completed;
- payment submission/result/verification are not collapsed;
- persisted relationships are preferred over timestamp inference.

These principles should remain.

### Existing `SomebodyNow`

The current M5 view already normalizes a current Somebody state.

This is a useful precursor to `SomebodyNowView`, but V6 does not require:
- `ball`;
- raw `currentRequirementKey`.

Those may remain in a deeper/debug view if useful.

### Existing `MissionStoryEvent`

Current M5 already has:
- stable id;
- timestamp;
- title/detail;
- coarse product kind;
- explicit `relatedIds`.

This is a strong starting point.

V6 requires a more explicit Activity vocabulary and typed payloads for:
- delegation;
- decisions;
- acquisition;
- before/after artifact changes;
- verification;
- founder attention.

### Existing `AttentionItem`

Useful precursor, but insufficient for production V6.

Missing product command semantics:
- stable attention revision;
- explicit allowed action IDs;
- action types;
- text requirements;
- confirmation semantics.

### Existing artifact projection

Artifact version history exists.

V6 still needs:
- current founder-facing deliverable identity;
- current content/result;
- draft/current/verified/superseded status;
- evidence/unknowns/next-move projection.

### Existing external/payment projection

Current M5 correctly attempts to preserve:
- submitted ≠ settled/result/verified;
- reconciliation state;
- simulation/live/replay provenance in acquisition results.

V6 should receive a smaller `AcquisitionView`; React should not understand M3/M4 machinery.

---

## 33. Engine-shaped fields V6 should stop depending on directly

Current `ObjectiveWorkspaceView` exposes arrays such as:

- requirements;
- workers;
- assignments;
- decisions;
- external;
- evidence;
- outcome levels.

These may continue to exist for:
- internal adapters;
- tests;
- developer/debug/X-ray views.

The approved V6 primary UI should not require them directly.

The new product projection should derive:
- Checkpoints;
- Intern state;
- Activity;
- Deliverables;
- Attention;
- Acquisition status;
- Objective status.

---

# PART XII — OPEN GAPS REQUIRING BACKEND RECONCILIATION

## 34. Gap: Checkpoint derivation

**Need:** 2–5 stable founder-facing checkpoints.

**Known truth:** Outcome Contract + Requirements + completion gate exist.

**Gap:** deterministic/product rule translating those internals into V6 checkpoint labels/states is not yet agreed.

**Frontend action:** do not hard-code demo checkpoints into reusable production logic.

---

## 35. Gap: Somebody Now projection

**Need:** reliable product summary of what Somebody is currently doing.

**Known truth:** current M5 `SomebodyNow` is a precursor.

**Gap:** M6.1 current-action/verification/attention semantics need reconciliation with the final V6 states.

**Frontend action:** no component-specific reconstruction.

---

## 36. Gap: Activity event production

**Need:** typed, meaningful Activity events.

**Known truth:** MissionStory events and persisted rows already exist.

**Gap:** exact backend projection rules for the V1 Activity vocabulary.

**Frontend action:** do not stream raw durable rows as Activity.

---

## 37. Gap: Causal links

**Need:** V6 may draw:
- evidence arrived → artifact changed.

**Known truth:** some persisted relationships/evidence references exist.

**Gap:** one normalized product causality field is not final.

**Frontend action:** only draw causal connectors when the projection explicitly supplies causality.

---

## 38. Gap: Compressed Intern work

**Need:** one product event for low-level internal activity.

**Known truth:** runs/tool calls may exist.

**Gap:** authoritative duration/action count may not always exist or be meaningful.

**Frontend action:** `actionCount` / `durationMs` are optional. Never invent them.

---

## 39. Gap: Deliverable identity/content

**Need:** one current founder-facing deliverable.

**Known truth:** artifacts/version history exist.

**Gap:** projection rule for:
- current deliverable;
- full founder-facing content;
- verification status;
- assumptions/unknowns;
- recommended next move.

**Frontend action:** no "latest version wins" heuristic.

---

## 40. Gap: /start advanced controls

V6 illustrates:
- spend authority;
- deadline;
- external-effect policy;
- context/files.

Backend support is not yet confirmed for every field.

**Frontend action:** use `StartCapabilitiesView`; hide unsupported options.

---

## 41. Gap: Multiple Objective summaries

V6 sidebar needs lightweight categorized Objectives.

**Gap:** a formal product-level summary/list contract is not currently documented.

**Frontend action:** do not load every full workspace and categorize locally.

---

## 42. Gap: legal resume/retry actions

The product may eventually expose resume/retry.

**Gap:** exact founder-permitted cases are not final.

**Frontend action:** render only `availableActions` supplied by the backend projection. No generic Retry button.

---

# PART XIII — PROHIBITED FRONTEND BEHAVIOUR

## 43. Do not

- wire V6 components directly to raw Convex table shapes;
- expose raw Objective engine enums as the product lifecycle;
- expose Requirement state as Checkpoint state without projection;
- call a Worker/Intern done and therefore mark Objective done;
- infer acquisition success from payment submission;
- infer verification from provider result arrival;
- infer causality from timestamps;
- build Activity from arbitrary backend logs;
- let separate components duplicate state-machine interpretation;
- expose raw model/provider errors to founders by default;
- create Retry/Resume/Approve buttons not returned by the command contract;
- claim replay/simulation is a live transaction;
- fabricate Activity counts/durations for demo theatre;
- make the frontend responsible for financial arithmetic/authorization;
- expose chain-of-thought;
- use this contract as an excuse to redesign backend architecture.

---

# PART XIV — INTEGRATION ORDER

## 44. Production wiring order after contract reconciliation

Once this file is reconciled and accepted by both lanes:

1. Objective list / sidebar;
2. Objective + Somebody Now;
3. Activity projection;
4. Deliverables;
5. Checkpoints;
6. Attention commands;
7. Acquisition/spend product projection;
8. /start create Objective;
9. completed/verification state;
10. assets/motion;
11. optional debug/X-ray separately.

Do not implement V6 by first reproducing current raw M5 arrays inside new React components.

---

# PART XV — ACCEPTANCE BAR

## 45. Frontend Contract acceptance

Before V6 production wiring begins, backend + frontend should agree that:

- [ ] one Objective product status is authoritative;
- [ ] Somebody Now is projection-owned;
- [ ] sidebar summaries are projection-owned;
- [ ] checkpoints are projection-owned;
- [ ] Activity vocabulary is explicit;
- [ ] Activity causality is explicit or absent;
- [ ] deliverable current/verified truth is projection-owned;
- [ ] attention exposes allowed actions;
- [ ] attention commands protect against stale state;
- [ ] acquisition/payment/result/verification truth remains distinct;
- [ ] simulation/replay/live provenance is preserved;
- [ ] /start supported fields are advertised rather than assumed;
- [ ] React does not inspect engine rows to decide completion;
- [ ] no primary V6 component requires raw Requirement/Assignment/Intent rows.

Once those are true, the contract can move from **reconciliation draft** to **accepted integration contract**.

---

## 46. Relationship to other docs

Visual/product presentation:
- `DESIGN.md`

Current approved visual checkpoint:
- `docs/design/prototypes/SOMEBODY_OKX_V6_APPROVED.md`

Existing M5 normalization seam:
- `lib/m5/workspaceModel.ts`
- `convex/m5Workspace.ts`
- `app/m5/workspace.ts`

Engine truth:
- `ARCHITECTURE.md`
- M6.1 implementation/current work docs

This document defines the deliberate seam between those two worlds.
