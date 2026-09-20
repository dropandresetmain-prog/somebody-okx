# OKX Dev Day 2026 — Submission Pack Draft

Status: **DRAFT — reconcile again against the final release candidate before submission**  
Drafted: **21 September 2026**  
Draft basis: **main@2bc3e06a60e32fe5e987b1dced35627f7dae2827**  
Primary track: **Build a Company**  
Official build period: **17–25 September 2026**  
Submission deadline: **25 September 2026, 23:59 UTC**

> This is a working submission document, not release evidence. Any item marked FINAL, CONFIRM, or PLACEHOLDER must be reconciled against the exact submission candidate before the form is sent.

Official builder kit: https://www.okx.com/en-us/learn/okx-dev-day-builder-kit

---

## 1. Submission requirements and current status

| Requirement | Official expectation | Draft status |
| --- | --- | --- |
| Team + track | Team name, members, project name, primary track, participation route | **PARTIAL** — Build a Company locked; final roster/route CONFIRM |
| Project summary | Product, intended user, core integration | **DRAFTED BELOW** |
| Repository | Public repo or reviewer access with a clear README | **YES** — dropandresetmain-prog/somebody-okx; judge README draft prepared separately |
| Demo video | 2–4 minute working-product/integration video | **PENDING** — target 3:00; script/shot plan handled separately |
| Product link | Live deployment or test environment where available | **PENDING** — FINAL PRODUCT URL |
| Build a Company integration | Working service published/integrated through OKX AI + end-to-end workflow + service/listing/integration URL | **MUST VERIFY BEFORE SUBMISSION** — FINAL OKX AI INTEGRATION URL |
| Existing-project disclosure | Clear list of work added in the official build period + commit evidence + demo of the new work | **YES, DRAFTED** — see HACKATHON_DELTA_DRAFT.md and canonical BUILD_DELTA.md |
| Declaration | Accuracy + event-guideline acceptance | **PENDING FINAL FORM** |

### Submission blocker to resolve before finalization

Because the selected track is **Build a Company**, the official minimum requirement is not satisfied by a repository or X Layer payment flow alone. The final package must include a **working service/listing/integration through OKX AI and its URL**.

Current accepted main does not yet contain final submission evidence for that URL. Do not convert this placeholder into a pass without a real accessible integration.

---

## 2. Canonical form copy

### Project name

**Somebody**

Optional display subtitle where space permits:

**Somebody — the AI manager for the One Person Company**

### One-line description

**Somebody is the accountable AI manager for the One Person Company: give it an objective, and it builds or reuses internal capability, decides when to make or buy, acquires external services when justified, and stays accountable until the outcome is verified.**

### Short project summary

**Somebody lets one person operate with the functional reach of a much larger company. Instead of asking the founder to design agents or workflows, the founder states the outcome they want. Somebody converts that objective into governed requirements, creates or reuses internal workers, compares MAKE, BUY and HYBRID strategies using current company and market facts, authorizes bounded execution, and keeps replanning as reality changes. When external capability is economically justified, Somebody can cross an OKX-backed acquisition/payment boundary, bring the useful result back into company state, resume the internal worker with that result, and verify that the objective was actually achieved.**

### Intended user

**Solo founders and very small teams who need more operational reach without manually coordinating a growing collection of agents, apps and external service providers.**

### Problem

Small teams increasingly have access to AI workers and external machine services, but the founder still has to act as the manager:

- decide what success actually means;
- decide which work should be done internally versus bought externally;
- create and coordinate workers;
- preserve authority over money and consequential actions;
- react when evidence, availability or provider results change;
- determine whether a task merely ran or the business outcome was genuinely achieved.

The bottleneck moves from **doing every task** to **managing an increasingly capable software workforce**.

### Solution

Somebody is the persistent management layer.

The founder supplies an objective, not an agent specification. Somebody:

1. interprets the objective into an Outcome Contract and Requirements;
2. decides which internal capabilities are needed;
3. reuses or creates bounded That Guy workers;
4. compares MAKE / BUY / HYBRID / WAIT / ASK / BLOCK strategies;
5. grounds economic decisions in current facts rather than forcing internal work merely because it is technically possible;
6. authorizes bounded work and external acquisition within application-owned policy;
7. feeds new evidence/results back into the company;
8. replans when the facts change;
9. independently verifies requirement satisfaction and objective completion.

### What is differentiated

The project is not primarily "an LLM that calls tools."

The differentiating layer is **managerial accountability over time**:

- persistent objectives, workers, evidence and economic decisions;
- outcome contracts with an explicit minimum completion bar;
- internal MAKE versus external BUY/HYBRID decisions based on grounded facts;
- model recommendation separated from deterministic authorization;
- payment/acquisition truth separated from business truth;
- workers can request resources but cannot grant themselves authority or spend;
- execution results are observations, not automatic completion;
- external acquisition can causally change downstream internal work;
- completion is accepted only against current requirements and verified proof.

### Why OKX matters

Draft wording — reconcile against final integration evidence:

**Somebody provides the management layer; OKX provides the economic/external-service layer. Internal company state remains ordinary application state, but external machine services need an executable economic boundary. The OKX integration lets Somebody move from "this capability would be better bought" to a governed acquisition flow with explicit identity, authorization, signing/submission/reconciliation boundaries and external-result provenance. That useful result can then re-enter company state and change the worker's next action.**

Final submission must add:

- OKX AI service/listing/integration: FINAL OKX AI INTEGRATION URL
- final external provider/service used in the canonical run: FINAL PROVIDER / SERVICE
- X Layer / payment evidence where relevant: FINAL TX / RECEIPT / PAYMENT EVIDENCE
- final acquisition provenance: FINAL EVIDENCE

Do not claim settlement, provider success or a live acquisition unless the final recorded run proves it.

---

## 3. Canonical demo story — written submission version

Founder objective:

> "Our launch messaging isn't working. Figure out what's wrong and get a better relaunch ready. You can spend within the approved limit if it's justified."

The product story is:

~~~text
Founder objective
→ Somebody defines what success means
→ Somebody identifies required work
→ internal That Guy capability is reused/created
→ real bounded internal work begins
→ the worker encounters an evidence/resource gap
→ Somebody re-evaluates MAKE vs BUY/HYBRID
→ an eligible external service is economically justified
→ deterministic authority rechecks spend/provider/effect identity
→ OKX-backed acquisition boundary executes
→ the useful external result enters authoritative company state
→ the dependent worker resumes with that result
→ the relaunch artifact materially changes because of the acquired evidence
→ Somebody verifies the minimum completion bar
→ objective resolves truthfully
~~~

Final package must show this causally. A transaction identifier with no useful result consumed downstream is insufficient.

---

## 4. Existing-project disclosure

Somebody existed before OKX Dev Day. The inherited baseline is explicitly separated from hackathon work.

Inherited baseline:

- source repo: dropandresetmain-prog/somebody-ai
- accepted pre-OKX SHA: 709a169a1a4f71b8dc2d7427438ff514999fb07e
- date: 13 September 2026
- included brand/UI foundations, the earlier procurement vertical, generic reliability primitives, evidence/provenance patterns, effect verification/idempotency patterns and several provider adapters.

The OKX project does **not** claim those inherited capabilities as hackathon work.

The concise judge-facing delta is in:

- docs/submission/HACKATHON_DELTA_DRAFT.md

The canonical detailed provenance ledger remains:

- BUILD_DELTA.md

---

## 5. Judging-criteria alignment

This section is descriptive, not a claim about judging outcomes.

### Innovation

The project treats the management of software workers and external machine services as the product, rather than exposing a collection of agents for the user to orchestrate manually.

### Product completeness

The intended submission proves one complete causal objective through interpretation, staffing, internal work, economic decision, governed external acquisition, result consumption, artifact revision and verification.

Final evidence: FINAL E2E RESULT

### User value

A solo founder delegates an outcome instead of specifying workers, tools and workflows. The system owns coordination while preserving human/business authority where it matters.

### Technical execution

Current accepted architecture separates:

- LangGraph continuation/orchestration;
- Convex authoritative business state;
- bounded @openai/agents worker execution;
- deterministic authorization/completion policy;
- external provider/blockchain reality;
- M3 payment/acquisition state.

### Meaningful OKX integration

Final submission must show that OKX is causally required to cross the external economic/service boundary, not merely displayed as a wallet or transaction after the product decision.

Final OKX AI integration/service URL: FINAL LINK

### Growth potential / OKX ecosystem contribution

The generalized model is that agents can discover, evaluate and economically consume external machine services rather than requiring every capability to be built inside one company. Somebody acts as the accountable buyer/manager for those services.

---

## 6. Links to finalize

- Repository: https://github.com/dropandresetmain-prog/somebody-okx
- Demo video: FINAL VIDEO URL
- Product/test environment: FINAL PRODUCT URL
- OKX AI service/listing/integration: FINAL OKX AI URL
- X Layer explorer / payment evidence: FINAL EVIDENCE URL
- Final candidate SHA: FINAL SHA
- Submission receipt: AFTER SUBMISSION

---

## 7. Final reconciliation checklist

Before submission:

- [ ] confirm final team roster;
- [ ] confirm participation route;
- [ ] verify Build a Company OKX AI service/listing/integration URL is accessible logged out;
- [ ] replace root README with / reconcile against judge-facing README;
- [ ] update concise hackathon delta through the exact final SHA;
- [ ] confirm inherited-vs-new classifications against BUILD_DELTA.md;
- [ ] insert final product/test URL;
- [ ] insert final 3-minute video URL;
- [ ] insert final OKX/X Layer evidence without secrets;
- [ ] remove every FINAL / CONFIRM placeholder;
- [ ] verify all links in a logged-out/private browser;
- [ ] verify no document claims unproven settlement, confirmation, deployment or completion;
- [ ] submit by 25 September 2026 23:59 UTC;
- [ ] retain the email submission receipt.
