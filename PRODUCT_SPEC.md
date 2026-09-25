# Somebody × OKX — Product Spec

## Product

Somebody is the AI manager for the One Person Company.

The founder gives Somebody an objective, not a workflow. Somebody decides what must be true, assembles the capability needed to move the objective forward, chooses between internal work and external acquisition, requests founder authority when required and stays accountable until the final deliverable is verified.

## Core user flow

```text
Founder objective
→ Somebody defines success
→ Somebody breaks success into requirements
→ Somebody staffs internal work
→ MAKE / BUY / WAIT / ASK decisions
→ execution and evidence
→ replanning as new facts arrive
→ verified final deliverable
```

The same objective can contain multiple MAKE and BUY decisions.

## Outcome model

Each objective becomes an **Outcome Contract** containing:

- the intended outcome;
- ordered outcome levels;
- a minimum completion bar;
- material assumptions or ambiguities.

Somebody then builds a requirement graph for the work.

A requirement can depend on earlier requirements, so research, acquisition and final-output work can form a causal sequence rather than a flat checklist.

## Internal workforce

Somebody can create or reuse internal workers.

Each worker has:

- a responsibility;
- governed capabilities;
- allowed tools;
- an assignment;
- evidence and result requirements.

Workers execute bounded work and return results to Somebody. Somebody remains responsible for staffing, economic decisions and objective completion.

## MAKE / BUY engine

For each requirement, Somebody can consider:

- **MAKE** — use company-controlled capability;
- **BUY** — acquire an external resource or service;
- **HYBRID** — combine internal and external work;
- **WAIT** — pause for a dependency;
- **ASK** — request founder input or authority;
- **BLOCK** — report that the requirement cannot currently proceed.

The choice is grounded in current company resources, worker capability, provider compatibility, cost, evidence, availability and authority.

Internal feasibility does not automatically force MAKE, and a listed provider does not automatically force BUY.

## JEV

JEV is part of the sourcing decision layer.

After the application filters out ineligible options, JEV can evaluate the remaining grounded choices and return a structured selection. If only one eligible option remains, the engine can select it directly.

The selected option is then rechecked by deterministic authorization before execution.

## External market

External offerings are represented as structured economic options.

An offering can declare:

- provider and service identity;
- resource class;
- supported purpose;
- price;
- execution route;
- compatibility with the current requirement.

This lets Somebody buy a resource rather than merely call a named agent.

## Founder approval

Paid external actions can surface in **Needs You**.

The founder sees the bounded amount and approves the economic action in the product. The approval is persisted against the exact objective and decision so the authorized purchase can resume without changing the objective's meaning.

## OKX payment flow

Approved purchases are executed through the OKX payment stack.

The product tracks distinct states for:

```text
authorized
→ prepared
→ submitted
→ settled
→ result received
→ verified
```

The recorded demo executes this flow on **OKX Testnet** using x402 and X Layer.

## Acquired capability feeds back into work

Verified external results become inputs to later internal work.

That allows a requirement chain such as:

```text
internal research
→ missing benchmark identified
→ external benchmark acquired
→ benchmark verified
→ internal planning resumes
→ final report changes because of the new evidence
```

A purchase is therefore a means to move the objective forward, not the objective itself.

## Final deliverable

Somebody identifies the terminal founder-facing deliverable in the requirement graph and evaluates it against the minimum completion bar.

When revision is needed, Somebody can reopen that final deliverable, run a bounded corrective pass and assess the new version again.

A verified artifact can be exported as PDF.

## Product surface

The current workspace is organized around the founder's objective.

It shows:

- Objectives;
- Somebody's current state;
- Activity;
- internal workers and assignments;
- MAKE / BUY decisions;
- Needs You approvals;
- OKX transaction activity;
- Deliverables;
- Checkpoints;
- final verified output.

The interface is designed to show meaningful company movement rather than raw agent transcripts.

## Demo configuration

The recorded demo is based on a completed run configured to exercise both MAKE and BUY paths in one objective.

The scenario uses a simulated cross-platform research benchmark so the full loop can be demonstrated compactly. Strategy selection itself remains generic and comes from the same runtime used for other objectives.

The payment path runs on **OKX Testnet**.

## Tech stack

| Layer | Technology |
| --- | --- |
| Web application | Next.js 16, React 19, TypeScript |
| Product state / backend | Convex |
| Manager orchestration | LangGraph |
| Worker execution | OpenAI Agents SDK |
| Model access | OpenRouter |
| Current GPT-family model | GPT-6 Luna |
| Structured sourcing selection | JEV |
| JEV transport | Vercel AI Gateway |
| Payments | OKX x402 packages |
| Settlement network | X Layer Testnet |
| Merchant service | Express |
| Validation / contracts | Zod |
| PDF export | pdf-lib |

## Product principle

**The objective creates demand. Somebody assembles the company around it.**
