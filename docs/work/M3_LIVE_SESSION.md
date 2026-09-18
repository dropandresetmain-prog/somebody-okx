# M3 supervised live-session ledger

Status: **BLOCKED BEFORE APPROVAL / SIGNING**  
Recorded: **2026-09-18T17:57:10+08:00**

This ledger contains only public challenge terms and safe payment identifiers.
It deliberately contains no private key, authorization header, session token,
email address, or signing material.

## Wallet and network

- Official CLI: `onchainos 4.6.1`.
- Agentic Wallet login: successful; active account/address intentionally not
  reproduced here beyond the testnet receive address previously provided to the
  founder.
- Network: `eip155:1952` (X Layer Testnet only).
- Official balance readback: `0.2` test OKB and `10` test USD₮0 at
  `0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c`.

## Live Mock Merchant challenge

Endpoint: `https://www.okx.com/api/v1/pay/mock-merchant/resource`  
Observed via: `onchainos payment quote` (no signing)

- HTTP status: `402`.
- `x402Version`: `2`.
- Resource: `/api/v1/pay/mock-merchant/resource`.
- Schemes: `exact`, `aggr_deferred`; M3 selects `exact` only.
- Network: `eip155:1952` (X Layer Testnet).
- Asset: `0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d`.
- Amount / `maxAmountRequired`: `10000` atomic units (`0.01`).
- Recipient / `payTo`: `0x3509655ad99effc7f3f74205482b1cb337ca08f7`.
- Timeout: `60` seconds.
- `extra.name`: `USDC_TEST`.
- `extra.version`: `1`.
- Quote payment reference: `pay_81a7538fe620a43d0e21a027` — **unapproved,
  unsigned, unreplayed, and never to be used as an authorization substitute**.

## Token discrepancy — live challenge is authoritative

The current official buyer guide documents test USD₮0 at
`0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c`. The live endpoint above instead
requires `USDC_TEST` at `0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d`.

Conclusion: the live exact challenge governs this M3 transaction. The wallet
has the documented USD₮0 balance, but the official quote reports the required
USDC_TEST balance unavailable. The application must not change the asset to
match documentation and must not sign, submit, or replay this quote.

## Required next safe action

## Funding and fresh quote evidence

After funding, the official direct asset balance and official funding check both
confirmed `10` USDC_TEST and sufficient balance for `0.01` USDC_TEST. The
current official quote is:

- Quote payment reference: `pay_0fed9c340f5b9f85b611f1ed`.
- Selected scheme: index `0`, `exact`.
- Quote preflight `balanceStatus` still says `unavailable`; this contradicts
  the direct balance read and `wallet funding-check`, which returned
  `decision: ready` and `sufficient: true`. This stale quote preflight is
  documented as an observation, not bypassed as a source of settlement truth.

## Application approval and READY_TO_SIGN proof

The application created a distinct supervised proof record without secrets:

- Purchase ID: `purchase-m3-mock-pay-0fed9c340f5b9f85b611f1ed`.
- Idempotency key: `idem-m3-mock-pay-0fed9c340f5b9f85b611f1ed`.
- Approval ID: `approval-m3-mock-pay-0fed9c340f5b9f85b611f1ed`.
- Purchase state: `approved`.
- Bound intent state: `ready_to_sign`.

The approval is exact-bound to the network, asset, amount, recipient, resource,
scheme, timeout, and EIP-712 domain listed above. It is not a wildcard approval
and does not authorize another PurchaseRecord.

## Required next safe action

**Founder confirmation required:** display the exact TESTNET confirmation
surface and receive an explicit confirmation before invoking
`onchainos payment pay --payment-id pay_0fed9c340f5b9f85b611f1ed --selected-index 0 --yes`.

## Submission attempt and reconciliation — no retry authorized

The original quote expired before signing. Wallet history showed no outgoing
payment, so a fresh identical quote was obtained and executed only after the
existing explicit confirmation was checked against its unchanged live terms.

- Replacement quote reference: `pay_af95d85ff8bc7d6fe3b66ac2`.
- Official command used: `onchainos payment pay --payment-id … --selected-index 0 --yes`.
- Result: `status: pending`, `txHash: null`, `decodedReceipt: null`.
- Error: `facilitator non-terminal: HTTP 402`; merchant response remained
  `Payment Required`.

This is ambiguous, not a failed payment. The application lifecycle is:

`approved -> payment_attempted -> uncertain -> reconciliation_required`

Immediate reconciliation evidence:

- official wallet history shows only the three inbound faucet transfers, with
  no outgoing USDC_TEST payment;
- official direct USDC_TEST balance remains `10`.

Those reads show no settled transfer at observation time, but they do not
override the official pending payment status. No second `pay` command, new
signature, or replay is authorized until an official status/receipt readback
resolves this specific payment reference.

## Current official testnet-guide expectation

The current OKX buyer guide explicitly runs this verification flow on X Layer
Testnet. It says the Skill tracks payment status and retrieves a receipt; its
concrete Mock Merchant success example is the paid response body containing
`data` plus `payment.status: "success"`, `payment.txHash`, and
`payment.network: "eip155:1952"`. The guide then directs the buyer to verify
that returned transaction hash on the X Layer Testnet explorer.

Correction: a `PAYMENT-RESPONSE` header can be an x402 receipt format and the
CLI can decode it when present, but this OKX testnet guide does not require it
as the only success evidence. Our pending response has neither that terminal
paid response body nor a transaction hash, so it still cannot be accepted.
