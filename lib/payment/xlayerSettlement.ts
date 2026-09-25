import type { SettlementReader } from "./types";
import { decodeFunctionData, type Hex } from "viem";
import { eip3009ABI } from "@okxweb3/x402-evm";
import {
  type PaymentAuthorizationIdentity,
  type SettlementExecutionBinding,
} from "./executionAuthority";

/**
 * Read-only X Layer Testnet settlement verification.
 *
 * This module never signs or submits transactions. It verifies a txHash against
 * the canonical X Layer Testnet chain and the exact ERC-20 transfer terms that
 * were approved by the application.
 */

export const XLAYER_TESTNET_NETWORK = "eip155:1952";
export const XLAYER_TESTNET_CHAIN_ID_HEX = "0x7a0";
export const XLAYER_TESTNET_PRIMARY_RPC = "https://testrpc.xlayer.tech/terigon";
/** Small tolerance for local wall-clock vs chain block-clock skew. */
export const XLAYER_SETTLEMENT_MAX_CLOCK_SKEW_SECONDS = 120;

/** keccak256("Transfer(address,address,uint256)") */
const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export type JsonRpcTransport = (
  method: string,
  params: readonly unknown[],
) => Promise<unknown>;

type ReceiptLog = {
  address?: unknown;
  topics?: unknown;
  data?: unknown;
};

type TransactionReceipt = {
  transactionHash?: unknown;
  status?: unknown;
  blockNumber?: unknown;
  logs?: unknown;
};

type Transaction = {
  hash?: unknown;
  chainId?: unknown;
  to?: unknown;
  input?: unknown;
};

export type ExpectedExactSettlement = {
  purchaseId: string;
  executionAttemptId: string;
  executionBinding: SettlementExecutionBinding;
  executionClaimedAt: number;
  authorization: PaymentAuthorizationIdentity;
  network: string;
  transactionHash: string;
  asset: string;
  amount: string;
  payTo: string;
  payer: string;
};

export type XLayerSettlementProvenance = {
  /** Block number used to fetch the timestamp; must equal the receipt block. */
  blockNumber: string;
  /** Timestamp returned by eth_getBlockByNumber for the receipt block. */
  blockTimestamp: string;
};

function assertExecutionBinding(
  expected: ExpectedExactSettlement,
): void {
  if (
    expected.executionBinding.purchaseId !== expected.purchaseId
    || expected.executionBinding.executionAttemptId !== expected.executionAttemptId
    || expected.executionBinding.transactionHash.toLowerCase() !== expected.transactionHash.toLowerCase()
  ) {
    throw new Error("Settlement evidence is not bound to this purchase execution");
  }
}

export type XLayerSettlementVerification =
  | { state: "pending"; transactionHash: string }
  | { state: "reverted"; transactionHash: string; blockNumber?: string }
  | { state: "mismatch"; transactionHash: string; reason: string; blockNumber?: string }
  | { state: "settled"; transactionHash: string; blockNumber: string; transferLogIndex: number };

export type XLayerTransactionVerification =
  | { state: "valid" }
  | { state: "mismatch"; reason: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

function normalizeAddress(value: string): string {
  const normalized = value.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
    throw new Error(`Invalid EVM address: ${value}`);
  }
  return normalized;
}

function normalizeHash(value: string): string {
  const normalized = value.toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`Invalid transaction hash: ${value}`);
  }
  return normalized;
}

function addressFromTopic(value: unknown): string | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    return null;
  }
  return `0x${value.slice(-40).toLowerCase()}`;
}

function amountFromData(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    return null;
  }
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function blockNumberFrom(receipt: TransactionReceipt): string | undefined {
  return typeof receipt.blockNumber === "string" ? receipt.blockNumber : undefined;
}

function unsignedIntegerFrom(value: unknown): bigint | null {
  if (typeof value === "bigint") return value >= 0n ? value : null;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value !== "string" || !/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : null;
  } catch {
    return null;
  }
}

function bytes32From(value: unknown): string | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) return null;
  return value.toLowerCase();
}

function bytesFrom(value: unknown): string | null {
  if (
    typeof value !== "string"
    || !/^0x[0-9a-fA-F]*$/.test(value)
    || value.length < 4
    || (value.length - 2) % 2 !== 0
  ) {
    return null;
  }
  return value.toLowerCase();
}

function addressFromValue(value: unknown): string | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) return null;
  return value.toLowerCase();
}

function chainTimestampFrom(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function executionProvenanceMismatch(
  expected: ExpectedExactSettlement,
  receiptBlockNumber: string,
  provenance: XLayerSettlementProvenance | null | undefined,
): string | undefined {
  if (!Number.isSafeInteger(expected.executionClaimedAt) || expected.executionClaimedAt < 0) {
    return "execution claim timestamp is malformed";
  }
  const blockTimestamp = chainTimestampFrom(provenance?.blockTimestamp);
  if (blockTimestamp === null) {
    return "independent settlement block timestamp is missing or malformed";
  }
  if (
    typeof provenance?.blockNumber !== "string"
    || provenance.blockNumber.toLowerCase() !== receiptBlockNumber.toLowerCase()
  ) {
    return "independent settlement block identity is missing or does not match the receipt blockNumber";
  }
  const claimedAtSeconds = BigInt(Math.floor(expected.executionClaimedAt / 1000));
  if (
    blockTimestamp + BigInt(XLAYER_SETTLEMENT_MAX_CLOCK_SKEW_SECONDS)
    < claimedAtSeconds
  ) {
    return "settlement block timestamp predates the current execution claim beyond clock-skew tolerance";
  }
  return undefined;
}

/**
 * Verify the independent transaction body for the current EIP-3009 attempt.
 * The installed x402 ABI is authoritative for both accepted
 * transferWithAuthorization overloads; signatures themselves are never
 * returned or persisted by this verifier.
 */
export function verifyExactXLayerTransaction(
  rawTransaction: unknown,
  expected: ExpectedExactSettlement,
): XLayerTransactionVerification {
  assertExecutionBinding(expected);
  if (expected.network !== XLAYER_TESTNET_NETWORK) {
    return { state: "mismatch", reason: `Transaction verifier only permits ${XLAYER_TESTNET_NETWORK}` };
  }
  if (expected.authorization.authorizationKind !== "eip3009") {
    return { state: "mismatch", reason: "Unsupported payment authorization kind" };
  }

  const transaction = asRecord(rawTransaction) as Transaction | null;
  if (!transaction) return { state: "mismatch", reason: "eth_getTransactionByHash returned no transaction" };

  const expectedHash = normalizeHash(expected.transactionHash);
  const transactionHash = typeof transaction.hash === "string" ? transaction.hash : "";
  let normalizedTransactionHash: string;
  try {
    normalizedTransactionHash = normalizeHash(transactionHash);
  } catch {
    return { state: "mismatch", reason: "transaction hash is missing or malformed" };
  }
  if (normalizedTransactionHash !== expectedHash) {
    return { state: "mismatch", reason: "transaction hash does not match requested hash" };
  }

  const chainId = unsignedIntegerFrom(transaction.chainId);
  if (chainId !== 1952n) {
    return { state: "mismatch", reason: "transaction chainId is not X Layer Testnet" };
  }
  const transactionTarget = addressFromValue(transaction.to);
  if (!transactionTarget || transactionTarget !== normalizeAddress(expected.asset)) {
    return { state: "mismatch", reason: "transaction target is not the approved EIP-3009 token contract" };
  }
  if (typeof transaction.input !== "string" || !/^0x[0-9a-fA-F]+$/.test(transaction.input)) {
    return { state: "mismatch", reason: "transaction input is missing or malformed" };
  }

  let decoded: { functionName: string; args?: readonly unknown[] };
  try {
    decoded = decodeFunctionData({ abi: eip3009ABI, data: transaction.input as Hex });
  } catch {
    return { state: "mismatch", reason: "transaction input is not decodable as EIP-3009 transferWithAuthorization" };
  }
  if (decoded.functionName !== "transferWithAuthorization" || !decoded.args) {
    return { state: "mismatch", reason: "transaction calls an unsupported function" };
  }

  const args = Array.from(decoded.args);
  if (args.length !== 9 && args.length !== 7) {
    return { state: "mismatch", reason: "transaction uses an unsupported EIP-3009 overload" };
  }
  const from = addressFromValue(args[0]);
  const to = addressFromValue(args[1]);
  const value = unsignedIntegerFrom(args[2]);
  const validAfter = unsignedIntegerFrom(args[3]);
  const validBefore = unsignedIntegerFrom(args[4]);
  const nonce = bytes32From(args[5]);
  const expectedPayer = normalizeAddress(expected.payer);
  const expectedPayTo = normalizeAddress(expected.payTo);
  if (!from || from !== expectedPayer) return { state: "mismatch", reason: "transaction authorization payer does not match approval" };
  if (!to || to !== expectedPayTo) return { state: "mismatch", reason: "transaction authorization recipient does not match approval" };
  if (value === null || value !== BigInt(expected.amount)) return { state: "mismatch", reason: "transaction authorization amount does not match approval" };
  if (validAfter === null || validBefore === null || validAfter >= validBefore) {
    return { state: "mismatch", reason: "transaction authorization validity window is malformed" };
  }
  const expectedNonce = bytes32From(expected.authorization.authorizationNonce);
  if (!expectedNonce || nonce !== expectedNonce) {
    return { state: "mismatch", reason: "transaction authorization nonce does not match this execution attempt" };
  }
  if (validAfter !== BigInt(expected.authorization.authorizationValidAfter)) {
    return { state: "mismatch", reason: "transaction validAfter does not match the durable authorization identity" };
  }
  if (validBefore !== BigInt(expected.authorization.authorizationValidBefore)) {
    return { state: "mismatch", reason: "transaction validBefore does not match the durable authorization identity" };
  }

  if (args.length === 9) {
    if (unsignedIntegerFrom(args[6]) === null || bytes32From(args[7]) === null || bytes32From(args[8]) === null) {
      return { state: "mismatch", reason: "transaction ECDSA authorization signature fields are malformed" };
    }
  } else if (bytesFrom(args[6]) === null) {
    return { state: "mismatch", reason: "transaction authorization signature bytes are malformed" };
  }
  return { state: "valid" };
}

/**
 * Verify one already-fetched receipt against exact approved payment terms.
 *
 * SETTLED requires all of:
 * - successful receipt status;
 * - exact transaction hash;
 * - a Transfer log emitted by the approved token contract;
 * - payer, payTo and amount matching the approved payment.
 * - an independently fetched block timestamp that is fresh relative to the
 *   durable execution claim.
 */
export function verifyExactXLayerReceipt(
  rawReceipt: unknown,
  expected: ExpectedExactSettlement,
  provenance: XLayerSettlementProvenance | null,
): XLayerSettlementVerification {
  assertExecutionBinding(expected);
  if (expected.network !== XLAYER_TESTNET_NETWORK) {
    throw new Error(`Settlement verifier only permits ${XLAYER_TESTNET_NETWORK}`);
  }

  const expectedHash = normalizeHash(expected.transactionHash);
  const expectedAsset = normalizeAddress(expected.asset);
  const expectedPayTo = normalizeAddress(expected.payTo);
  const expectedPayer = normalizeAddress(expected.payer);
  if (!/^(0|[1-9][0-9]*)$/.test(expected.amount)) {
    throw new Error("Expected settlement amount must be atomic integer units");
  }
  const expectedAmount = BigInt(expected.amount);

  if (rawReceipt === null) {
    return { state: "pending", transactionHash: expectedHash };
  }

  const receipt = asRecord(rawReceipt) as TransactionReceipt | null;
  if (!receipt) {
    return {
      state: "mismatch",
      transactionHash: expectedHash,
      reason: "eth_getTransactionReceipt returned a malformed receipt",
    };
  }

  const receiptHash =
    typeof receipt.transactionHash === "string"
      ? receipt.transactionHash.toLowerCase()
      : "";
  if (receiptHash !== expectedHash) {
    return {
      state: "mismatch",
      transactionHash: expectedHash,
      reason: "receipt transactionHash does not match requested hash",
      blockNumber: blockNumberFrom(receipt),
    };
  }

  if (receipt.status === "0x0") {
    return {
      state: "reverted",
      transactionHash: expectedHash,
      blockNumber: blockNumberFrom(receipt),
    };
  }
  if (receipt.status !== "0x1") {
    return {
      state: "mismatch",
      transactionHash: expectedHash,
      reason: "receipt status is neither successful nor reverted",
      blockNumber: blockNumberFrom(receipt),
    };
  }

  const blockNumber = blockNumberFrom(receipt);
  if (!blockNumber) {
    return {
      state: "mismatch",
      transactionHash: expectedHash,
      reason: "successful receipt is missing blockNumber",
    };
  }

  const provenanceMismatch = executionProvenanceMismatch(expected, blockNumber, provenance);
  if (provenanceMismatch) {
    return {
      state: "mismatch",
      transactionHash: expectedHash,
      reason: provenanceMismatch,
      blockNumber,
    };
  }

  if (!Array.isArray(receipt.logs)) {
    return {
      state: "mismatch",
      transactionHash: expectedHash,
      reason: "successful receipt has no readable logs",
      blockNumber: blockNumberFrom(receipt),
    };
  }

  for (let index = 0; index < receipt.logs.length; index += 1) {
    const log = asRecord(receipt.logs[index]) as ReceiptLog | null;
    if (!log || typeof log.address !== "string" || !Array.isArray(log.topics)) continue;

    const topics = log.topics;
    const topic0 = typeof topics[0] === "string" ? topics[0].toLowerCase() : "";
    if (log.address.toLowerCase() !== expectedAsset || topic0 !== ERC20_TRANSFER_TOPIC) continue;

    const from = addressFromTopic(topics[1]);
    const to = addressFromTopic(topics[2]);
    const amount = amountFromData(log.data);
    if (from === expectedPayer && to === expectedPayTo && amount === expectedAmount) {
      return {
        state: "settled",
        transactionHash: expectedHash,
        blockNumber,
        transferLogIndex: index,
      };
    }
  }

  return {
    state: "mismatch",
    transactionHash: expectedHash,
    reason: "successful transaction does not contain the approved token transfer",
    blockNumber: blockNumberFrom(receipt),
  };
}

/**
 * Build a minimal public JSON-RPC transport. No wallet credentials or secrets
 * are used. Callers may inject another official X Layer Testnet RPC endpoint.
 */
export function createXLayerJsonRpcTransport(
  rpcUrl: string = XLAYER_TESTNET_PRIMARY_RPC,
): JsonRpcTransport {
  let id = 0;
  return async (method, params) => {
    id += 1;
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    if (!response.ok) {
      throw new Error(`X Layer RPC HTTP ${response.status}`);
    }
    const body = asRecord(await response.json());
    if (!body) throw new Error("X Layer RPC returned malformed JSON");
    if (body.error !== undefined) {
      throw new Error("X Layer RPC returned an error");
    }
    return body.result;
  };
}

/**
 * Read chain identity, transaction body, receipt, and block provenance, then
 * independently verify exact settlement. No retry is performed here: caller
 * controls polling/reconciliation cadence.
 */
export async function readAndVerifyXLayerSettlement(
  rpc: JsonRpcTransport,
  expected: ExpectedExactSettlement,
): Promise<XLayerSettlementVerification> {
  const chainId = await rpc("eth_chainId", []);
  if (typeof chainId !== "string" || chainId.toLowerCase() !== XLAYER_TESTNET_CHAIN_ID_HEX) {
    throw new Error(
      `Wrong RPC chain: expected ${XLAYER_TESTNET_CHAIN_ID_HEX} for X Layer Testnet`,
    );
  }

  const transaction = await rpc("eth_getTransactionByHash", [expected.transactionHash]);
  const receipt = await rpc("eth_getTransactionReceipt", [expected.transactionHash]);
  if (receipt === null) return verifyExactXLayerReceipt(receipt, expected, null);

  const receiptRecord = asRecord(receipt);
  const blockNumber = receiptRecord && typeof receiptRecord.blockNumber === "string"
    ? receiptRecord.blockNumber
    : undefined;
  if (!blockNumber) return verifyExactXLayerReceipt(receipt, expected, null);

  const transactionVerification = verifyExactXLayerTransaction(transaction, expected);
  if (transactionVerification.state === "mismatch") {
    return {
      state: "mismatch",
      transactionHash: normalizeHash(expected.transactionHash),
      reason: transactionVerification.reason,
      blockNumber,
    };
  }

  const block = await rpc("eth_getBlockByNumber", [blockNumber, false]);
  const blockRecord = asRecord(block);
  const blockTimestamp = blockRecord?.timestamp;
  return verifyExactXLayerReceipt(
    receipt,
    expected,
    {
      blockNumber,
      blockTimestamp: typeof blockTimestamp === "string" ? blockTimestamp : "",
    },
  );
}

/**
 * Compatibility adapter for the existing SettlementReader seam.
 * This seam cannot carry the durable claim timestamp or independently fetched
 * block timestamp, so it must fail closed instead of flattening an unproven
 * receipt into a generic boolean.
 */
export class XLayerExactSettlementReader implements SettlementReader {
  async readSettlement(_transactionHash: string): Promise<{ settled: boolean }> {
    throw new Error(
      "XLayerExactSettlementReader cannot establish current execution provenance; "
      + "use readAndVerifyXLayerSettlement with the durable execution claim",
    );
  }
}
