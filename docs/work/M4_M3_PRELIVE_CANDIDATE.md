# M4 × M3 pre-live candidate packet

Date: 20 September 2026  
Exact code candidate: `fe56db17e9275a7967778c091b5599b0d41d570d`  
Branch: `fix/m4-m3-production-driver`

## Lineage and boundary

- M4 CP8 source: `99df92d3eb7900bf951bf02800d58a1c67c8684c`.
- Frozen M3 source: `37afaa5a7cd0aa82a30c63ce6795c48d34f04d07`.
- Integrated application base: `integration/m4-m3@75ac30b`.
- The Node-only driver is deliberately outside Convex/browser bundles. Convex
  remains the M4 transition and wake authority; M3 remains financial truth.

## Production entrypoints and durable state

- `scripts/m4-m3-production-driver.ts` requires one `--intent-id` and supports
  `inspect`, `prepare`, `preview`, `confirm`, `execute`, `observe`, and
  `reconcile`. `inspect` and `reconcile` are read-only. `prepare` only creates
  or reloads a stable purchase identity. `preview` only fetches a 402 challenge
  and binds approved terms. `confirm` requires an explicit confirmation ID.
- `lib/payment/purchaseLedger.ts` owns M3 `PurchaseRecord` persistence,
  identity/idempotency uniqueness, exclusive local locking, and atomic writes.
  State survives prepare, approval binding, confirmation, payment attempt,
  submission, settlement, provider result, verification, and restart.
- `lib/payment/previewLedger.ts` stores only founder-visible preview metadata.
  `lib/payment/supervisedDriverAdapter.ts` stores confirmation ID, exact
  purchase/approval identities, endpoint, terms fingerprint, safe terms, and
  timestamp—never wallet keys, signatures, headers, or credentials.

## Authority, quotes, and executor seam

- M4 `awaiting_m3` plus a persisted founder spend approval identity is required;
  the preview path derives an M3 `PaymentApproval` from exact live terms. The
  driver rejects non-current revisions and all non-`awaiting_m3` preparation or
  execution attempts.
- Preview handles are informational. A fresh `ExecutionQuote` is fetched only
  inside `FreshQuoteExecutor`, after durable confirmation is reloaded. Frozen
  M3 comparison/freshness kernels reject changed amount, asset, network,
  recipient, resource, scheme, timeout, and EIP-712 material. A new local
  payment ID is permitted only with equal material terms.
- `FreshQuoteExecutor` builds the existing `OfficialSignOnlyReplayExecutor` but
  construction performs no signing or I/O. The driver persists
  `payment_attempted` before that executor becomes reachable. Execution remains
  disabled unless a later separately authorized session explicitly enables it.

## Lifecycle, recovery, and M4 writeback

- Lifecycle facts remain separate: `payment_attempted`, `submitted`, `settled`,
  `result_received`, and `verified`. Each observation advances at most one fact.
- Lost/ambiguous execution is durably `reconciliation_required`; restart cannot
  execute again. Submitted state only observes settlement. Settled state only
  retrieves a staged safe result or rests—never replays a signed provider call.
  Result retrieval failure retains the same settled purchase. Only M3's existing
  reconciliation/retry authority can ever reopen a failed purchase.
- `convex/m3Driver.ts` accepts only named M3 facts, reloads current Objective,
  contract, requirement, and intent state, routes through M4 kernels, and
  appends stable deduped wake events. Old financial facts remain reconcilable,
  but stale contract/requirement evidence cannot satisfy a new revision.
- M4, not the Node driver, recomputes Requirement proof and completion after
  `provider_result` / `verification_result` wakes. Buying a resource does not
  assert a later external business effect.

## Evidence

- Focused production/payment/management evidence: 161/161 pass, including the
  D1–D41 authority, quote, duplicate, restart, lifecycle, ambiguity,
  settled-without-result, stale-revision, wake, and Somebody-resume seams.
- Exact candidate final gate (run once on this SHA):
  - `npm test` — exit 0, 602 pass / 0 fail.
  - `npx tsc --noEmit` equivalent local compiler invocation with
    `--incremental false` — exit 0.
  - `npx tsc -p convex/tsconfig.json` equivalent local compiler invocation with
    `--incremental false` — exit 0.
- Read-only local readiness: `onchainos --version` returned `onchainos 4.6.1`.
- No production build was run: changed surfaces are Node driver, payment
  libraries, Convex backend, tests, and docs; repository policy for this gate
  specifies the three checks above.

## Financial safety declaration

No live payment, signing operation, blockchain submission, merchant replay,
paid provider request, wallet command, or mainnet operation occurred while
creating or testing this candidate. All external execution evidence is injected
or deterministic; the concrete composition construction test performs no fetch
and does not invoke the executor.

## Review request

R3 must inspect **exactly** `fe56db17e9275a7967778c091b5599b0d41d570d`, assume
an unsafe duplicate-spend or fake-truth path until disproven, and classify every
material finding as Act Now, Investigate Now, Park for Later, or Ignore / Accept
Risk. The reviewer is read-only and must not run a payment path.
