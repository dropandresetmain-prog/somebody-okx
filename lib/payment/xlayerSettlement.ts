import type { SettlementReader } from "./types";

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

export type ExpectedExactSettlement = {
  network: string;
  transactionHash: string;
  asset: string;
  amount: string;
  payTo: string;
  payer: string;
};

export type XLayerSettlementVerification =
  | { state: "pending"; transactionHash: string }
  | { state: "reverted"; transactionHash: string; blockNumber?: string }
  | { state: "mismatch"; transactionHash: string; reason: string; blockNumber?: string }
  | { state: "settled"; transactionHash: string; blockNumber: string; transferLogIndex: number };

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

/**
 * Verify one already-fetched receipt against exact approved payment terms.
 *
 * SETTLED requires all of:
 * - successful receipt status;
 * - exact transaction hash;
 * - a Transfer log emitted by the approved token contract;
 * - payer, payTo and amount matching the approved payment.
 */
export function verifyExactXLayerReceipt(
  rawReceipt: unknown,
  expected: ExpectedExactSettlement,
): XLayerSettlementVerification {
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
      const blockNumber = blockNumberFrom(receipt);
      if (!blockNumber) {
        return {
          state: "mismatch",
          transactionHash: expectedHash,
          reason: "successful matching transfer is missing blockNumber",
        };
      }
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
 * Read chain identity and receipt, then independently verify exact settlement.
 * No retry is performed here: caller controls polling/reconciliation cadence.
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

  const receipt = await rpc("eth_getTransactionReceipt", [expected.transactionHash]);
  return verifyExactXLayerReceipt(receipt, expected);
}

/**
 * Compatibility adapter for the existing SettlementReader seam.
 * Rich M3 reconciliation should prefer readAndVerifyXLayerSettlement so a
 * mismatch/revert is not flattened into a generic false.
 */
export class XLayerExactSettlementReader implements SettlementReader {
  constructor(
    private readonly rpc: JsonRpcTransport,
    private readonly expected: Omit<ExpectedExactSettlement, "transactionHash">,
  ) {}

  async readSettlement(transactionHash: string): Promise<{ settled: boolean }> {
    const result = await readAndVerifyXLayerSettlement(this.rpc, {
      ...this.expected,
      transactionHash,
    });
    return { settled: result.state === "settled" };
  }
}
