# Somebody × OKX — Architecture

Status: **CANONICAL — Somebody Management Protocol v1 / LangGraph decision locked; implemented through integrated M5 baseline**  
Date: **19 September 2026**  
Integrated implementation baseline: `main@a9a0b3d31a7125e83fe0771a783ee62cbd96914a`

## 1. Product architecture

Somebody is not a one-shot planner and not an agent-shopping UI.

Somebody is a **persistent accountable managerial identity** operating a control loop over authoritative company state.

```text
OBSERVE
→ INTERPRET OBJECTIVE
→ DEFINE / REVISE OUTCOME CONTRACT
→ IDENTIFY REQUIREMENTS
→ PROPOSE SATISFACTION STRATEGIES
→ GROUND OPTIONS IN REAL COMPANY/MARKET FACTS
→ LLM MANAGERIAL RECOMMENDATION
→ DETERMINISTIC AUTHORIZATION
→ EXECUTE BOUNDED ACTION
→ VERIFY
→ UPDATE AUTHORITATIVE STATE
→ WAKE SOMEBODY
→ REPLAN
↺
```

Execution results are observations. They do not automatically imply the next step or objective completion.

## 2. Runtime ownership

### LangGraph owns

- orchestration position;
- conditional routing;
- bounded continuation state;
- interrupts/waits;
- wake/resume flow;
- execution-local correlation identifiers.

### Convex owns authoritative business truth

- founder Objective;
- persistent Somebody managerial identity/history;
- Outcome Contracts and revisions;
- Outcome Levels;
- Requirements and revisions;
- resource availability;
- Worker identities / WorkerSpecs;
- assignment reservations;
- WorkContracts;
- managerial decisions;
- authorization;
- approvals;
- purchase/effect intents;
- evidence;
- artifacts;
- verified external effects;
- objective resolution.

### @openai/agents owns subordinate worker execution

- bounded That Guy run;
- tool-calling runtime;
- run-local transcript/context;
- model execution attempt.

### External systems own external reality

- blockchain settlement;
- provider state;
- published external effects.

External reality is reconciled into Convex as evidence.

If LangGraph continuation state and Convex disagree, reload/reconcile Convex and external truth. A checkpoint cannot override accepted business history.

## 3. Objective → Outcome Contract

Founder language can be vague.

Default behavior is risk-based:

- Somebody autonomously interprets ordinary low-risk ambiguity;
- material ambiguity involving success criteria, money, external effects, risk or scope may require founder clarification/approval.

An Outcome Contract can contain multiple Outcome Levels.

Example:

```text
L1 — diagnosed launch issue
L2 — evidence-backed relaunch-ready revision prepared + verified  ← minimum completion bar
L3 — revised launch published + verified                         ← higher level
L4 — early response measured                                     ← may remain pending
L5 — conversion improvement established                          ← later business impact
```

Somebody may not call the Objective complete below the minimum completion bar.

Completion may truthfully report higher outcome levels as pending.

## 4. Requirements

Somebody proposes semantic requirements. Application code validates/maps them into governed forms where execution/authority matters.

Minimum priority semantics:

- **required** — gates objective completion;
- **supporting** — does not gate completion, but incomplete supporting work must be communicated clearly.

Requirement resolution must distinguish:

- active;
- satisfied;
- blocked;
- superseded / waived only with an authorized reason.

Provider-candidate rejection is not requirement satisfaction.

A ResourceNeed is one possible consequence of a requirement strategy; it is not the universal outcome model.

## 5. Satisfaction strategies

For each requirement, Somebody may propose:

- MAKE;
- BUY;
- HYBRID;
- WAIT;
- ASK FOUNDER;
- BLOCK / ESCALATE.

Investigation is ordinary bounded MAKE work.

MAKE/BUY are not objective-level labels. One Objective may sequence multiple internal and external decisions.

If both internal and external approaches are feasible, both classes should be considered. This does not require exhaustive marketplace discovery; discovery may be bounded.

## 6. Option generation and grounding

The LLM may propose semantic strategies/options.

Application code grounds proposals against:

- governed capabilities/tools;
- current worker inventory/load;
- factual company resources;
- market/provider inventory;
- provider compatibility;
- real prices/terms where available;
- approvals/budgets;
- verification methods;
- deadlines;
- current objective/requirement revisions.

Impossible or unauthorized candidates are removed before authorization.

Unknown facts stay unknown. Do not turn estimates into authoritative measurements.

## 7. Economic managerial judgment

Do not use a single arbitrary weighted score.

### Stage 1 — hard eligibility

An executable option must satisfy applicable:

- capability/output scope;
- security/privacy/legal/account constraints;
- deadline/mandatory proof;
- provider identity/endpoint compatibility;
- execution authority;
- financial bounds.

### Stage 2 — comparable facts

Track only decision-relevant facts:

- scope and expected quality;
- time/setup/queue/verification;
- incremental internal or external cost;
- reliability/failure risk;
- availability/workload;
- reuse value;
- external advantage;
- provenance/confidence.

### Stage 3 — LLM recommendation

Somebody recommends an eligible option and records:

- selected option;
- strongest relevant alternative;
- why the choice serves the objective;
- material assumptions;
- evidence that would change the decision.

Then deterministic authorization rechecks current truth.

Internal feasibility does not force MAKE.

External listing does not force BUY.

## 8. Staffing: REUSE / CREATE

For the internal component of a MAKE or HYBRID strategy:

1. filter workers by governed capability/permission/assignment compatibility;
2. consider availability, relevant verified history, context/setup cost and expected completion;
3. prefer REUSE unless a supported reason favors CREATE;
4. record the staffing reason.

Worker breadth is the smallest coherent capability bundle supporting a recognizable bounded responsibility.

A worker is persistent. A WorkerRun is ephemeral.

## 9. Dynamic capability/tool definition

Somebody may dynamically define new semantic capabilities and tool contracts.

Example:

```text
Need: competitor pricing analysis
→ define semantic capability
→ compose from governed primitives:
   public-web read + company-record read + evidence write
→ validate
→ attach to reusable WorkerSpec
```

The model cannot invent real-world authority.

A newly proposed executable tool that requires a new API, credential, platform right, professional license, payment permission or destructive authority remains unavailable until an application-controlled integration/authorization path exists.

Dynamic capability ≠ dynamic authority.

## 10. Staffing authority

Workers may emit:

- capability requests;
- resource requests;
- dependency/block reports.

Only Somebody may convert those requests into:

- REUSE;
- CREATE;
- BUY/HYBRID;
- WAIT/ASK;
- BLOCK/ESCALATE.

Workers cannot create real workers directly, expand their own permissions, authorize spend or declare the Objective complete.

For M4, worker-to-worker autonomous recursive creation is zero.

## 11. Planning horizon

Somebody maintains a coarse overall plan but commits/authorizes only the next bounded action.

Reality may invalidate the coarse plan.

Every meaningful observation can cause replanning.

## 12. Wake semantics

Wake Somebody on meaningful state change, including:

- worker result/failure;
- worker capability/resource request;
- approval resolution;
- purchase/submission/settlement/reconciliation result;
- provider result;
- verification result;
- deadline/timeout/recovery event;
- founder input/objective revision.

Do not invoke the model repeatedly while nothing changed.

Waiting/approval/escalation states are quiescent.

## 13. Completion semantics

Completion hierarchy:

`Run stopped ≠ assignment complete ≠ requirement satisfied ≠ Objective complete`

Somebody proposes Objective completion.

Application code accepts completion only when:

- current Outcome Contract version matches;
- minimum completion bar is satisfied;
- all required Requirements are satisfied;
- required verification evidence is present/current;
- no unresolved required effect/resource remains;
- stale runs cannot mutate current truth.

Supporting work may remain incomplete but must be disclosed.

## 14. Control states

The exact schema may evolve, but semantics must support:

- received/planning;
- ready_to_execute;
- executing;
- waiting_for_resource;
- generic waiting;
- approval_required;
- blocked;
- escalated;
- failed/recovery_required;
- completed.

Unsupported objectives become typed blocked/escalated outcomes rather than exceptions.

## 15. Persistent Somebody identity

Somebody itself is a persistent managerial identity.

Persist decision history, objective history, assumptions, outcomes and later-overturned decisions where useful.

Do not depend on an infinitely growing chat transcript for identity.

Each managerial invocation should load fresh authoritative company state and bounded relevant history.

## 16. LangGraph execution rules

Graph state should remain deliberately small: IDs, wake reason, continuation/correlation data and other execution-local fields.

Do not copy the full company into graph memory.

Consequential nodes re-read Convex before authorization/effects.

Graph replay/checkpoint recovery must not directly perform duplicate payments/publications. All external effects route through stable logical business identities and reconciliation-aware application functions.

## 17. External acquisition seam

M4 defines a generic acquisition/effect interface.

M3 remains the financial implementation authority.

Conceptually:

```text
AuthorizedExecutionIntent(BUY)
→ M3 buyer rail
→ attempted/submitted/settled/reconciliation state
→ result
→ verification
→ Convex evidence
→ wake Somebody
```

M4 must not invent an alternate payment state machine.

Until M3/R2 is accepted, M4 may truthfully stop/wait at the external-execution boundary.

## 18. Reliability / no-progress limits

Persist objective-wide finite limits for:

- workers created;
- active assignments;
- management decisions;
- execution attempts;
- retries;
- elapsed time;
- model/runtime cost;
- external spend;
- repeated no-progress cycles.

Limits survive process restarts.

Duplicate wake-ups must be harmless.

Ambiguous external submission/effects reconcile before retry.

## 19. Hackathon Cutoff 2

The engine supports bounded capability/provider catalogs, not universal competence.

For an unsupported objective it may:

- identify missing capabilities/resources;
- propose bounded feasibility investigation;
- ask the founder;
- block;
- escalate.

It must not silently substitute an easier objective and claim success.

External/provider text is untrusted evidence, never instructions.

## 20. Product surface

Default UI exposes high-level managerial truth:

- objective/success criteria;
- current outcome level;
- That Guy reuse/create;
- options considered;
- recommendation reason;
- approval/payment/acquisition;
- internal reaction;
- verified external effect;
- blocker/incomplete supporting work.

An optional deeper trace/graph may show technical orchestration for demo/debugging.

Do not expose private chain-of-thought.

## 21. Historical supersession

Accepted M1/M2 evidence remains valid for its original scope.

Superseded planning assumptions include:

- “all controlled resources ⇒ MAKE” as final economic choice;
- BUY only for scarce resources;
- global rejection of generic external cognition;
- scenario-specific growth/research role routing as target architecture;
- Worker completion implying Objective completion;
- arbitrary-prompt robustness being out of scope;
- persistent workforce being parked for later;
- M4 being a fixed two-provider choreography.

The existing sourcing kernel is an accepted historical/current primitive to evolve into the single deterministic eligibility/authorization authority; do not create a competing second policy authority.
