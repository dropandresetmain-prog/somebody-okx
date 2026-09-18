import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  readAndVerifyXLayerSettlement,
  verifyExactXLayerReceipt,
  XLAYER_TESTNET_CHAIN_ID_HEX,
} from "../lib/payment/xlayerSettlement";

const txHash = `0x${"a".repeat(64)}`;
const payer = "0x1111111111111111111111111111111111111111";
const payTo = "0x3509655ad99effc7f3f74205482b1cb337ca08f7";
const asset = "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d";
const transferTopic =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

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

const expected = {
  network: "eip155:1952",
  transactionHash: txHash,
  asset,
  amount: "10000",
  payTo,
  payer,
};

describe("X Layer settlement readback", () => {
  it("accepts only a successful receipt with the exact approved ERC-20 transfer", () => {
    assert.deepEqual(verifyExactXLayerReceipt(receipt(), expected), {
      state: "settled",
      transactionHash: txHash,
      blockNumber: "0x123",
      transferLogIndex: 0,
    });
  });

  it("distinguishes pending and reverted from settled", () => {
    assert.deepEqual(verifyExactXLayerReceipt(null, expected), {
      state: "pending",
      transactionHash: txHash,
    });
    assert.deepEqual(verifyExactXLayerReceipt(receipt({ status: "0x0" }), expected), {
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
    const result = verifyExactXLayerReceipt(wrongAmount, expected);
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
      if (method === "eth_getTransactionReceipt") return receipt();
      throw new Error("unexpected method");
    };

    const result = await readAndVerifyXLayerSettlement(rpc, expected);
    assert.equal(result.state, "settled");
    assert.deepEqual(calls, ["eth_chainId", "eth_getTransactionReceipt"]);
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
});
