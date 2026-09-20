# Somebody

**Somebody has to do it. Now Somebody can.**

> **Somebody is the accountable AI manager for the One Person Company. Give it an objective; it builds or reuses the company capability it needs, decides what should be made versus bought, and stays accountable until the outcome is verified.**

**OKX Dev Day 2026 — Build a Company**

> **DRAFT NOTE — REMOVE BEFORE SUBMISSION:** This judge README is prepared against main@2bc3e06a60e32fe5e987b1dced35627f7dae2827. Final M6 end-to-end and acquisition evidence is intentionally not claimed yet.

---

## The problem

AI can already research, write, code and call tools. That creates a new bottleneck for a one-person company:

**someone still has to manage the workers.**

The founder still has to decide:

- what success means;
- what work is actually required;
- which internal worker should own it;
- whether to build capability internally or buy it externally;
- what the company is authorized to spend or change;
- how to react when new evidence changes the plan;
- whether an API call merely returned success or the business outcome really happened.

Somebody turns that coordination problem into a product.

## What Somebody does

The founder gives Somebody an **objective**, not an agent specification.

~~~text
Founder objective
      ↓
Outcome Contract + minimum completion bar
      ↓
Requirements
      ↓
candidate strategies
MAKE / BUY / HYBRID / WAIT / ASK / BLOCK
      ↓
grounded internal + external options
      ↓
LLM managerial recommendation
      ↓
deterministic authorization
      ↓
bounded internal work / external acquisition
      ↓
verification
      ↓
new company truth
      ↓
wake Somebody and replan
      ↺
~~~

Somebody owns the management loop. **That Guy** is the reusable bounded internal worker. **Somebody Else** is an external provider/resource.

## The demo

The canonical objective is deliberately founder-shaped rather than workflow-shaped:

> **"Our launch messaging isn't working. Figure out what's wrong and get a better relaunch ready. You can spend within the approved limit if it's justified."**

The intended end-to-end flow is:

1. Somebody interprets the objective and defines the minimum completion bar.
2. It identifies the work required and reuses or creates a bounded internal worker.
3. That Guy performs real internal work.
4. The worker encounters a real evidence/resource gap.
5. Somebody re-evaluates the requirement instead of blindly retrying.
6. Internal and external options are compared on grounded facts.
7. When BUY/HYBRID is economically justified, application policy rechecks provider, spend and effect identity.
8. The OKX-backed external acquisition boundary executes.
9. The **useful provider result**, not merely a transaction ID, enters authoritative company state.
10. The dependent worker resumes with that result.
11. The launch artifact materially changes because of the acquired evidence.
12. Somebody independently verifies requirement satisfaction and the Objective's minimum completion bar.

Final canonical run evidence: FINAL E2E / VIDEO LINK

## Why this is not just an agent that calls tools

Tool use is execution. Somebody is building the layer above execution: **accountable management over time**.

Key differences:

- **Outcome Contracts:** the system makes success explicit and can distinguish "relaunch-ready" from "published" from "business performance improved."
- **Persistent Requirements:** work is tracked against current revisions and proof, rather than inferred from chat history.
- **MAKE / BUY / HYBRID:** internal feasibility does not automatically force internal execution.
- **Persistent workforce:** reusable workers have governed capability envelopes and assignment history.
- **Dynamic capability, not dynamic authority:** the model can define new semantic work but cannot invent credentials, payment rights or destructive permissions.
- **Model proposes; application authorizes:** spend, provider identity, effects and completion are application-owned.
- **Payment truth is separate from business truth:** signed/submitted/settled/acquired/consumed/verified are not collapsed into one state.
- **Results cause replanning:** external evidence can change downstream work.
- **Completion is independently accepted:** a run finishing is not the same as a requirement being satisfied or an Objective being complete.

## What OKX enables

Somebody is the management layer. OKX is part of the external economic/service layer.

Without an economic boundary, the manager can only recommend:

> "Buying this external capability is faster/cheaper/better."

The OKX integration is intended to make that decision executable while preserving governed authority and provenance:

~~~text
eligible external option
→ managerial recommendation
→ deterministic spend/provider recheck
→ purchase/effect intent
→ signing / submission / reconciliation boundary
→ external provider result
→ authoritative company evidence
→ worker continuation
~~~

Build a Company submission integration:

- OKX AI service/listing/integration: FINAL OKX AI URL
- final external provider/service: FINAL PROVIDER
- X Layer/payment evidence where applicable: FINAL EVIDENCE

> **DRAFT NOTE — REMOVE BEFORE SUBMISSION:** Do not replace these placeholders until the exact release candidate has proved them. A wallet signature or submitted request is not automatically a settled payment or successful acquisition.

## Architecture

~~~text
Founder
  ↓
Somebody — persistent managerial identity
  ↓
LangGraph — bounded management continuation
  ↓
Convex — authoritative company/business truth
  ├─ Objective / Outcome Contract / Requirements
  ├─ workforce / WorkContracts
  ├─ managerial decisions / approvals
  ├─ intents / evidence / artifacts
  └─ verification / completion state
  ↓
@openai/agents — bounded That Guy execution
  ↓
M3 buyer rail / external-provider boundary
  ↓
OKX / X Layer / provider reality
  ↓
reconciliation back into Convex
~~~

### Responsibility boundaries

- **LangGraph** owns orchestration position and wake/resume continuation, not business truth.
- **Convex** owns durable company state.
- **@openai/agents** owns bounded worker execution.
- **Application policy** owns authority, hard eligibility and completion acceptance.
- **External providers / chain** own external reality; the application reconciles that reality into evidence.

## Built during OKX Dev Day

Somebody is an existing project, and the submission does not present inherited work as new.

The accepted pre-OKX baseline was:

- repo: dropandresetmain-prog/somebody-ai
- SHA: 709a169a1a4f71b8dc2d7427438ff514999fb07e
- date: 13 September 2026

The OKX build period is **17–25 September 2026**.

During the OKX build, the project has added/rebuilt the management and economic layers required for the One Person Company, including:

- generalized workforce capability and REUSE/CREATE semantics;
- explicit Objective → Outcome Contract → Requirement semantics;
- application-owned requirement satisfaction and completion gates;
- economic MAKE / BUY / HYBRID decision machinery;
- persistent Somebody managerial identity and LangGraph management loop;
- wake/replan behavior across changing worker/resource/provider facts;
- governed external acquisition/payment boundary integrated with the management engine;
- a new normalized product surface for the management state;
- current M6 work to prove the full causal flow from external acquisition back into dependent worker output.

Concise provenance: docs/submission/HACKATHON_DELTA_DRAFT.md  
Full canonical ledger: BUILD_DELTA.md

## Current submission evidence

Accepted integrated product baseline before M6 convergence:

- M3 + M4 application/payment integration accepted and frozen;
- M5 frontend accepted and integrated;
- accepted M5 integration baseline: a9a0b3d31a7125e83fe0771a783ee62cbd96914a;
- current accepted-main documentation head used for this draft: 2bc3e06a60e32fe5e987b1dced35627f7dae2827.

Final submission candidate: FINAL SHA

Final canonical end-to-end proof: FINAL EVIDENCE

## Repository guide

If you want to inspect the system rather than only the demo:

- PRODUCT_SPEC.md — current product behavior.
- ARCHITECTURE.md — management protocol and authority boundaries.
- BUILD_DELTA.md — detailed inherited-vs-new provenance.
- DECISIONS_LOG.md — accepted decisions and supersessions.
- docs/work/ — milestone evidence and review artifacts.
- tests/ — focused behavioral and contract evidence.

## Links

- Repository: https://github.com/dropandresetmain-prog/somebody-okx
- Working product/test environment: FINAL PRODUCT URL
- 3-minute demo: FINAL VIDEO URL
- OKX AI service/listing/integration: FINAL OKX AI URL
- X Layer/payment evidence: FINAL EVIDENCE URL

---

## Somebody

**Somebody has to do it. Now Somebody can.**
