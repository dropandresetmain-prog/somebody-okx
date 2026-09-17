# Somebody

**Somebody has to do it. Now Somebody can.**

Somebody is an autonomous AI coworker for the messy operational jobs that fall between roles: gather context, chase people, reconcile changing information, ask for authority when it matters, take the approved action, and verify that the job actually got done.

**Demo video:** https://youtu.be/ciKirevDVpI

---

## What we built

For this hackathon, Somebody owns one end-to-end procurement job across multiple real systems.

You give it the outcome, not a hand-built workflow:

```text
Request
  ↓
Gather context
  ↓
Work across apps
  ↓
Contact people
  ↓
Reconcile changing evidence
  ↓
Ask for authority when required
  ↓
Act
  ↓
Read back and verify
```

Procurement is the first demonstrated job, not the product category. The broader idea is operational job ownership: hand Somebody the work nobody owns and let it carry that job across systems and people until a real human decision is required.

## The demo

The demo starts with one deliberately vague request:

> “Sponsor finally approved $500 for gifts for Thursday. About 25 people. Can you sort out something useful and branded? Maybe tumblers?”

Somebody then:

1. reads the relevant Calendar and Drive context;
2. checks a real public supplier catalogue;
3. contacts configured suppliers over Gmail, WhatsApp, and Instagram;
4. preserves unknown fields instead of inventing answers;
5. follows up on incomplete quotes;
6. keeps evidence history when a supplier changes an earlier claim;
7. re-evaluates hard constraints and reranks current options;
8. recommends the best current eligible option;
9. stops for explicit human approval before committing the company;
10. after approval, confirms the winner, closes out the other suppliers, updates Google Sheets, and creates a QuickBooks Online Sandbox Purchase Order;
11. reads external state back before treating those actions as verified;
12. only marks the job complete when the required effects are verified.

The point is not “an LLM can call several APIs.” The point is that Somebody owns a job whose truth changes over time without silently guessing, committing without authority, or confusing an API response with real-world completion.

## External apps and systems

| System | Role in the demo |
| --- | --- |
| **Google Calendar** | Reads event timing, location, and logistics context. |
| **Google Drive** | Reads bounded event, sponsor, and branding context. |
| **Gmail** | Sends RFQs and clarifications, retrieves supplier replies, and preserves message/thread identity. |
| **Google Sheets** | Projects the current comparison into a human-readable sheet and reads it back. Convex remains the operational source of truth. |
| **Public web** | Uses real catalogue evidence with source provenance. Missing public fields remain unknown. |
| **WhatsApp via Unipile** | Sends and receives supplier messages through configured account/chat bindings. |
| **Instagram via Unipile** | Supports the same bounded supplier workflow over Instagram messaging. |
| **QuickBooks Online Sandbox** | Creates/reconciles the approved Purchase Order and independently reads it back before verification. |
| **Convex** | Holds durable mission, evidence, approval, and effect state. |
| **OpenAI Agents SDK + OpenRouter** | Provides the agent runtime that decides how to progress the bounded job through the available tools. |

Supplier replies do not need machine-readable JSON. Ordinary free-text messages can be normalized into procurement evidence while preserving the original text and source identity.

# System and reliability brief

## Architecture

```text
Somebody UI
    ↓
Procurement Agent
    ↓
Procurement policy + reliability core
    ↓
Convex operational state
    ↓
Provider adapters
    ├─ Google Workspace
    ├─ Unipile → WhatsApp / Instagram
    ├─ Public Web
    └─ QuickBooks Online Sandbox
    ↓
External read-back
    ↓
Verified state
```

Important boundaries:

- **Convex is the operational source of truth.** Google Sheets is a user-visible projection.
- **The model does not choose arbitrary recipients.** Application configuration resolves stable vendor IDs to bounded provider endpoints.
- **The model proposes; application policy enforces.** Deterministic logic owns hard constraints, ranking legality, authority, and completion gates.
- **Approval is application state.** The agent cannot approve its own recommendation.
- **Verification is separate from execution.** A provider returning success does not by itself make an effect verified.
- **External evidence has provenance and chronology.** New authoritative observations can supersede older claims without deleting history.

For the deeper technical design, see [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Reliability rules

Somebody is built around concrete failure modes rather than a generic “be reliable” prompt:

- **Unknown stays unknown.** An incomplete catalogue page is not promoted into a complete quote.
- **Price alone is not enough.** Required commercial and delivery facts must be sufficient for the decision being made.
- **Hard constraints win.** A cheaper supplier that misses Thursday is ruled out.
- **New evidence supersedes stale evidence.** Older claims remain in history while the newest authoritative observation becomes current.
- **Changed facts force re-evaluation.** Eligibility and ranking are recomputed when a supplier changes an earlier promise.
- **Post-approval change fails closed.** New evidence after approval freezes remaining commitment for human review rather than silently continuing on stale authority.
- **Human authority is explicit.** No vendor commitment or Purchase Order can happen before persisted approval.
- **Retries are idempotent.** Stable logical effect identities reduce accidental duplicate RFQs, confirmations, and Purchase Orders.
- **API success is not completion.** External writes remain unverified until intended state is independently read back.
- **The job completes only after required effects are verified.**

The UI shows evidence, state changes, concise rationale, approvals, and verification state — not chain-of-thought.

## Evaluation evidence

Verified integrated runtime commit:

`22c3e19743f5f8db99af058de759608ca81fbf68`

| Check | Result |
| --- | --- |
| Root TypeScript typecheck | **PASS** |
| Convex TypeScript typecheck | **PASS** |
| Production build | **PASS** |
| Full automated test suite | **78/78 PASS** |
| Local Somebody UI → `/api/mission` → Convex Development smoke | **PASS** |
| Integrated Convex Development deployment | **PASS** |
| Integrated provider function catalog | **PASS** |
| Unipile HTTP webhook route deployed | **PASS** |
| Local-only write boundary | **PASS** — cross-origin `/api/mission` requests remain rejected |

Real provider proofs completed during integration:

| Provider path | Evidence established |
| --- | --- |
| Google Calendar | Real configured event read |
| Google Drive | Real bounded folder read |
| Gmail | Real send, read-back, and supplier reply retrieval |
| Google Sheets | Real write and read-back |
| WhatsApp via Unipile | Real outbound messaging and provider read-back |
| Instagram via Unipile | Real outbound messaging and provider read-back |
| Public web | Real catalogue retrieval with source provenance |
| QuickBooks Online Sandbox | Real PO create, independent read-back, and idempotent reconcile behavior |

The test suite in [`tests/`](tests/) covers procurement invariants plus Google Workspace, web sourcing/ranking, Unipile messaging, presentation state, and QuickBooks PO behavior.

## QuickBooks Sandbox note

The available QuickBooks Sandbox company uses **USD** as its home currency and has multicurrency disabled, while the demo procurement mission is denominated in **SGD**.

For the hackathon, the Sandbox amount is used as a proxy to demonstrate the real approval → PO creation/reconciliation → provider ID persistence → independent read-back → verified-effect flow. No FX conversion is implied.

## Run locally

Requirements:

- Node.js **>= 22.6.0**
- npm
- a Convex project for persistent operational state

Install dependencies:

```bash
npm install
```

Copy `.env.example` to `.env.local` and supply your own values. The repository contains variable names only; credentials and tokens must remain outside Git.

Push the Convex functions to the Development deployment you intend to use:

```bash
npx convex dev --once
```

Then start the app:

```bash
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run typecheck:convex
npm test
npm run build
```

Reproducing every real external integration requires your own Google Workspace, Unipile, QuickBooks Sandbox, and model-provider credentials/accounts. `.env.example` lists the expected configuration names.

The interactive control surface is intentionally operated locally for the hackathon demo and talks to the configured Convex Development backend.

## Repository guide for judges

If you want to go deeper than the README:

- [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) — product thesis and demo scope.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — runtime design, evidence, approvals, idempotency, and verification.
- [`tests/`](tests/) — reliability and provider-focused verification.
- [`.env.example`](.env.example) — integration configuration surface, without secrets.

## Demo boundaries

Somebody is a bounded hackathon implementation, not a production procurement or payment system.

- Procurement is the demonstrated job; the product thesis is broader operational job ownership.
- There is **no payment automation**.
- Controlled supplier accounts and configured endpoint bindings are used for safe, repeatable external messaging.
- The model is not allowed to invent arbitrary external recipients.
- The frontend write route is deliberately local-only for this Development demo; no public hosted UI is claimed.

---

## Somebody

**Somebody has to do it. Now Somebody can.**
