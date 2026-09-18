import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { encodeFunctionData } from "viem";
import { eip3009ABI } from "@okxweb3/x402-evm";

import {
  readAndVerifyXLayerSettlement,
  verifyExactXLayerTransaction,
  verifyExactXLayerReceipt,
  XLayerExactSettlementReader,
  XLAYER_TESTNET_CHAIN_ID_HEX,
} from "../lib/payment/xlayerSettlement";
import { FilePaymentExecutionAuthority } from "../lib/payment/executionAuthority";

const txHash = `0x${"a".repeat(64)}`;
const payer = "0x1111111111111111111111111111111111111111";
const payTo = "0x3509655ad99effc7f3f74205482b1cb337ca08f7";
const asset = "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d";
const transferTopic =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const authorizationNonce = `0x${"b".repeat(64)}` as `0x${string}`;
const oldAuthorizationNonce = `0x${"c".repeat(64)}` as `0x${string}`;
const signatureBytes = `0x${"11".repeat(65)}` as `0x${string}`;

function addressTopic(address: string): string {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function uint256(value: bigint): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    transactionHash: txHash,
    status: "0x1",
    blockNumber: "0x123",
    logs: [{
      address: asset,
      topics: [transferTopic, addressTopic(payer), addressTopic(payTo)],
      data: uint256(10000n),
    }],
    ...overrides,
  };
}

function transactionInput(overrides: {
  from?: string;
  to?: string;
  value?: bigint;
  validAfter?: bigint;
  validBefore?: bigint;
  nonce?: `0x${string}`;
} = {}) {
  return encodeFunctionData({
    abi: eip3009ABI,
    functionName: "transferWithAuthorization",
    args: [
      (overrides.from ?? payer) as `0x${string}`,
      (overrides.to ?? payTo) as `0x${string}`,
      overrides.value ?? 10000n,
      overrides.validAfter ?? 900n,
      overrides.validBefore ?? 1100n,
      overrides.nonce ?? authorizationNonce,
      signatureBytes,
    ],
  });
}

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    hash: txHash,
    chainId: "0x7a0",
    to: asset,
    input: transactionInput(),
    ...overrides,
  };
}

const expected = {
  purchaseId: "purchase-a",
  executionAttemptId: "attempt-a",
  executionClaimedAt: 1_000_000,
  authorization: {
    authorizationKind: "eip3009" as const,
    authorizationNonce,
    authorizationValidAfter: "900",
    authorizationValidBefore: "1100",
  },
  executionBinding: {
    purchaseId: "purchase-a",
    executionAttemptId: "attempt-a",
    transactionHash: txHash,
  },
  network: "eip155:1952",
  transactionHash: txHash,
  asset,
  amount: "10000",
  payTo,
  payer,
};
const currentProvenance = { blockNumber: "0x123", blockTimestamp: "0x3e8" };

describe("X Layer settlement readback", () => {
  it("accepts only a successful receipt with the exact approved ERC-20 transfer", () => {
    assert.deepEqual(verifyExactXLayerReceipt(receipt(), expected, currentProvenance), {
      state: "settled",
      transactionHash: txHash,
      blockNumber: "0x123",
      transferLogIndex: 0,
    });
  });

  it("cannot use transaction evidence recorded for purchase A to settle purchase B", () => {
    const purchaseB = {
      ...expected,
      purchaseId: "purchase-b",
      executionAttemptId: "attempt-b",
      executionBinding: expected.executionBinding,
    };
    assert.throws(
      () => verifyExactXLayerReceipt(receipt(), purchaseB, currentProvenance),
      /not bound to this purchase execution/,
    );
  });

  it("durable execution evidence can bind the current transaction only to purchase A", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "somebody-settlement-binding-"));
    const authority = new FilePaymentExecutionAuthority(path.join(directory, "ledger.json"));
    const attempt = authority.claim({ purchaseId: "purchase-a", idempotencyKey: "idem-a", approvalId: "approval-a" });
    authority.recordSubmitted(attempt.attemptId, txHash);
    assert.throws(
      () => authority.getSettlementBinding(attempt.attemptId, "purchase-b", txHash),
      /belongs to another purchase/,
    );
    assert.deepEqual(
      authority.getSettlementBinding(attempt.attemptId, "purchase-a", txHash),
      { purchaseId: "purchase-a", executionAttemptId: attempt.attemptId, transactionHash: txHash },
    );
  });

  it("distinguishes pending and reverted from settled", () => {
    assert.deepEqual(verifyExactXLayerReceipt(null, expected, null), {
      state: "pending",
      transactionHash: txHash,
    });
    assert.deepEqual(verifyExactXLayerReceipt(receipt({ status: "0x0" }), expected, null), {
      state: "reverted",
      transactionHash: txHash,
      blockNumber: "0x123",
    });
  });

  it("rejects a successful transaction whose transfer terms do not match approval", () => {
    const wrongAmount = receipt({
      logs: [{
        address: asset,
        topics: [transferTopic, addressTopic(payer), addressTopic(payTo)],
        data: uint256(9999n),
      }],
    });
    const result = verifyExactXLayerReceipt(wrongAmount, expected, currentProvenance);
    assert.equal(result.state, "mismatch");
    if (result.state === "mismatch") {
      assert.match(result.reason, /approved token transfer/);
    }
  });

  it("verifies chain identity before reading the receipt", async () => {
    const calls: string[] = [];
    const rpc = async (method: string): Promise<unknown> => {
      calls.push(method);
      if (method === "eth_chainId") return XLAYER_TESTNET_CHAIN_ID_HEX;
      if (method === "eth_getTransactionByHash") return transaction();
      if (method === "eth_getTransactionReceipt") return receipt();
      if (method === "eth_getBlockByNumber") return { timestamp: currentProvenance.blockTimestamp };
      throw new Error("unexpected method");
    };

    const result = await readAndVerifyXLayerSettlement(rpc, expected);
    assert.equal(result.state, "settled");
    assert.deepEqual(calls, [
      "eth_chainId",
      "eth_getTransactionByHash",
      "eth_getTransactionReceipt",
      "eth_getBlockByNumber",
    ]);
  });

  it("rejects a wrong-nonce transaction before receipt economics can settle it", async () => {
    const rpc = async (method: string): Promise<unknown> => {
      if (method === "eth_chainId") return XLAYER_TESTNET_CHAIN_ID_HEX;
      if (method === "eth_getTransactionByHash") {
        return transaction({ input: transactionInput({ nonce: oldAuthorizationNonce }) });
      }
      if (method === "eth_getTransactionReceipt") return receipt();
      if (method === "eth_getBlockByNumber") return { timestamp: currentProvenance.blockTimestamp };
      throw new Error("unexpected method");
    };

    const result = await readAndVerifyXLayerSettlement(rpc, expected);
    assert.equal(result.state, "mismatch");
    if (result.state === "mismatch") assert.match(result.reason, /nonce does not match/);
  });

  it("fails closed on a wrong RPC chain before trusting a receipt", async () => {
    let receiptRead = false;
    const rpc = async (method: string): Promise<unknown> => {
      if (method === "eth_chainId") return "0xc4";
      receiptRead = true;
      return receipt();
    };

    await assert.rejects(
      () => readAndVerifyXLayerSettlement(rpc, expected),
      /Wrong RPC chain/,
    );
    assert.equal(receiptRead, false);
  });

  it("rejects a valid historical receipt with the same economics", () => {
    const result = verifyExactXLayerTransaction(
      transaction({ input: transactionInput({ nonce: oldAuthorizationNonce }) }),
      expected,
    );
    assert.equal(result.state, "mismatch");
    if (result.state === "mismatch") {
      assert.match(result.reason, /nonce does not match/);
    }
  });

  it("keeps block freshness as defense in depth after nonce verification", () => {
    const result = verifyExactXLayerReceipt(
      receipt(),
      expected,
      { blockNumber: "0x123", blockTimestamp: "0x1" },
    );
    assert.equal(result.state, "mismatch");
    if (result.state === "mismatch") assert.match(result.reason, /predates the current execution claim/);
  });

  it("accepts the current authorization nonce on the transaction itself", () => {
    assert.deepEqual(verifyExactXLayerTransaction(transaction(), expected), { state: "valid" });
  });

  it("rejects another purchase authorization nonce", () => {
    const purchaseB = {
      ...expected,
      purchaseId: "purchase-b",
      executionAttemptId: "attempt-b",
      executionBinding: {
        purchaseId: "purchase-b",
        executionAttemptId: "attempt-b",
        transactionHash: txHash,
      },
      authorization: {
        ...expected.authorization,
        authorizationNonce: oldAuthorizationNonce,
      },
    };
    const result = verifyExactXLayerTransaction(transaction(), purchaseB);
    assert.equal(result.state, "mismatch");
    if (result.state === "mismatch") assert.match(result.reason, /nonce does not match/);
  });

  it("rejects malformed input, wrong token target, and altered authorization fields", () => {
    const malformed = verifyExactXLayerTransaction(transaction({ input: "0xdeadbeef" }), expected);
    assert.equal(malformed.state, "mismatch");

    const wrongTarget = verifyExactXLayerTransaction(
      transaction({ to: "0x0000000000000000000000000000000000000001" }),
      expected,
    );
    assert.equal(wrongTarget.state, "mismatch");
    if (wrongTarget.state === "mismatch") assert.match(wrongTarget.reason, /target/);

    for (const altered of [
      { from: "0x2222222222222222222222222222222222222222" },
      { to: "0x3333333333333333333333333333333333333333" },
      { value: 9999n },
    ]) {
      const result = verifyExactXLayerTransaction(
        transaction({ input: transactionInput(altered) }),
        expected,
      );
      assert.equal(result.state, "mismatch");
    }
  });

  it("fails closed when settlement provenance is malformed", () => {
    const result = verifyExactXLayerReceipt(receipt(), expected, { blockNumber: "0x123", blockTimestamp: "not-a-timestamp" });
    assert.equal(result.state, "mismatch");
    if (result.state === "mismatch") {
      assert.match(result.reason, /block timestamp is missing or malformed/);
    }
  });

  it("fails closed through the weak SettlementReader compatibility adapter", async () => {
    await assert.rejects(
      () => new XLayerExactSettlementReader().readSettlement(txHash),
      /cannot establish current execution provenance/,
    );
  });
});
