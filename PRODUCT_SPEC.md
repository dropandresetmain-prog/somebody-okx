# Somebody × OKX — Product Spec

Status: **CANONICAL PRODUCT BEHAVIOR — management protocol locked 19 September 2026**

## 1. Vision

> **One person should be able to operate with the functional reach of a much larger company.**

Somebody is the accountable AI manager.

The founder says what outcome is wanted. Somebody decides what company capability is needed, assembles/reuses internal workers, compares internal/external ways to satisfy the work, acquires external capability when justified, and remains accountable for verified progress.

Product language:

- **Somebody** — accountable manager.
- **That Guy** — persistent internal worker.
- **Somebody Else** — external provider/resource.

## 2. Founder experience

The founder should not need to specify:

- which agent to create;
- which marketplace provider to call;
- whether work should be made or bought;
- which worker should resume after new evidence.

Somebody owns those decisions within granted authority.

## 3. Success is explicit

Somebody interprets the founder objective into an Outcome Contract.

Outcome Contracts may contain multiple levels, including a minimum completion bar.

Example:

```text
diagnosed
→ revised
→ relaunched + verified      [minimum bar]
→ response measured          [pending]
→ conversion improved        [later]
```

The UI must not collapse “published” into “business performance improved”.

Supporting work may remain incomplete at completion, but must be stated clearly.

## 4. Requirements and strategies

Somebody decomposes the Outcome Contract into required/supporting Requirements.

For a Requirement it may consider:

- MAKE;
- BUY;
- HYBRID;
- WAIT;
- ASK FOUNDER;
- BLOCK / ESCALATE.

A requirement may be satisfied by internal work, external acquisition, or a combination.

## 5. MAKE / BUY economics

Somebody should compare plausible internal and external options even when internal work is technically possible.

Example:

- internal: 500 compute-hours / ~$130 / ~11 hours;
- external: $7 / 8 minutes / credible equal-or-better quality.

BUY may be the better managerial recommendation.

External services do not win merely because they are listed. Generic cognition can still lose when the internal option is adequate, cheap, fast, private and reusable.

The product is not “buy only scarce resources”. It is “make or buy based on grounded objective economics and authority”.

## 6. Internal workforce

That Guys persist across assignments.

Somebody prefers REUSE when an existing eligible worker fits, unless supported factors favor CREATE.

That Guys have bounded coherent responsibilities, not one giant all-purpose employee and not one micro-agent per tiny action.

Workers can request capabilities/resources back from Somebody.

They cannot independently hire, buy, spend or declare the objective complete.

## 7. Dynamic capability creation

Somebody may define new semantic capabilities/tool contracts from governed primitives.

This enables unrelated founder objectives without requiring every role name to be hardcoded.

A model cannot create new real-world authority. New integrations/credentials/destructive permissions/payment rights require governed onboarding/authorization.

## 8. Management loop

Somebody maintains a coarse plan but authorizes only the next bounded action.

Every meaningful result is new evidence and can change the plan.

```text
act
→ observe
→ reconsider
→ act
↺
```

Meaningful events wake Somebody. No state change means no pointless model loop.

## 9. Canonical demo

Founder objective:

> **“Our launch isn’t working. Fix it and relaunch today.”**

The expected story is emergent rather than hardcoded:

- define operational success;
- create/reuse internal growth capability;
- perform real internal work;
- discover an evidence/resource gap;
- compare internal/external alternatives;
- recommend and authorize an external acquisition when justified;
- execute a real sandbox/testnet payment once M3 is integrated;
- use the acquired result internally;
- determine the next need;
- perform/verify an external relaunch effect;
- resolve the objective truthfully.

FlyBeacon, Newsliquid and xbird are preferred current demo data/adapters only. They do not define state transitions.

## 10. Hackathon Cutoff 2

The founder should be able to try unrelated objectives without crashing the runtime.

The system may produce:

- useful work;
- unsupported capability;
- waiting;
- approval required;
- blocked;
- escalated;
- failed/recovery-required.

It does not need expert-quality execution everywhere.

It must remain structurally safe.

## 11. Product surface

Main UI should show:

- founder objective;
- success criteria / minimum completion bar;
- current plan/state;
- That Guy created/reused;
- requirements;
- options considered;
- recommendation rationale;
- approvals/payments/resources;
- verified effects;
- completed/pending outcome levels;
- blockers;
- supporting work not done.

An optional deep trace/graph is appropriate for demo/debugging.

Do not make the default surface a raw LangGraph diagram, agent transcript or wallet console.

## 12. OKX role

Somebody is the management layer.

OKX/market providers are the external economic/resource layer.

X Layer / payment rails make external machine services economically executable.

Internal application truth remains ordinary software/Convex state.

## 13. Hard boundaries for the hackathon

Do not build unnecessary breadth:

- universal marketplace indexing;
- auctions/reputation platform;
- generalized negotiation/escrow;
- giant recursive org structures;
- unbounded autonomous tool/code installation;
- three-plus-provider spectacle;
- second polished scenario;
- blockchain as application database.

Safe arbitrary-prompt handling **is** in scope. Universal competence is not.
