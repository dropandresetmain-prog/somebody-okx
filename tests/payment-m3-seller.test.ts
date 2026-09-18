import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import type { FacilitatorClient } from "@okxweb3/x402-core/server";
import { parse402Challenge, decodePaymentRequiredHeader } from "../lib/payment/challenge";
import {
  createM3SellerApp,
  createM3SellerRoutes,
  inspectM3SellerEnvironment,
  M3_SELLER_AMOUNT,
  M3_SELLER_ASSET,
  M3_SELLER_NETWORK,
  M3_SELLER_PATH,
} from "../lib/payment/m3Seller";

const RECEIVER = "0x1111111111111111111111111111111111111111";
const TX = `0x${"ab".repeat(32)}`;
const env = {
  NODE_ENV: "test",
  M3_SELLER_RECEIVER_ADDRESS: RECEIVER,
  OKX_API_KEY: "test-api-key",
  OKX_SECRET_KEY: "test-secret-key",
  OKX_API_PASSPHRASE: "test-passphrase",
} as const;

const facilitator: FacilitatorClient = {
  getSupported: async () => ({
    kinds: [{ x402Version: 2, scheme: "exact", network: M3_SELLER_NETWORK }],
    extensions: [],
    signers: {},
  }),
  verify: async () => ({ isValid: true, payer: RECEIVER }),
  settle: async () => ({
    success: true,
    status: "success" as const,
    transaction: TX,
    network: M3_SELLER_NETWORK,
  }),
};

function request(port: number): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: M3_SELLER_PATH }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
    req.on("error", reject);
  });
}

describe("controlled M3 seller", () => {
  it("freezes the seller to Testnet, the current USDT0 asset, and an env recipient", () => {
    const routes = createM3SellerRoutes(RECEIVER) as Record<string, { accepts: { price: unknown; network: string; payTo: string } }>;
    const route = routes[`GET ${M3_SELLER_PATH}`];
    assert.equal(route.accepts.network, M3_SELLER_NETWORK);
    assert.equal(route.accepts.payTo, RECEIVER);
    assert.deepEqual(route.accepts.price, {
      asset: M3_SELLER_ASSET,
      amount: M3_SELLER_AMOUNT,
      extra: { name: "USD₮0", version: "1" },
    });
    assert.ok(!JSON.stringify(routes).includes("test-secret-key"));
  });

  it("fails closed on mainnet or non-loopback seller configuration", () => {
    const mainnet = inspectM3SellerEnvironment({
      ...env,
      M3_SELLER_NETWORK: "eip155:196",
    });
    assert.equal(mainnet.ok, false);
    assert.match(mainnet.errors.join(" "), /eip155:1952/);

    const publicHost = inspectM3SellerEnvironment({
      ...env,
      M3_SELLER_HOST: "0.0.0.0",
    });
    assert.equal(publicHost.ok, false);
    assert.match(publicHost.errors.join(" "), /127\.0\.0\.1|localhost/);
  });

  it("returns the official x402 v2 402 challenge without a payment", async () => {
    const seller = createM3SellerApp({ env, facilitatorClient: facilitator });
    await seller.initialize();
    const server = seller.app.listen(0, "127.0.0.1");
    try {
      await new Promise<void>((resolve) => server.once("listening", () => resolve()));
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const response = await request(address.port);
      assert.equal(response.status, 402);
      const encoded = response.headers["payment-required"];
      assert.equal(typeof encoded, "string");
      const challenge = decodePaymentRequiredHeader(encoded as string);
      const [terms] = parse402Challenge(challenge);
      assert.ok(terms, JSON.stringify(challenge));
      assert.equal(terms.network, M3_SELLER_NETWORK);
      assert.equal(terms.asset, M3_SELLER_ASSET);
      assert.equal(terms.maxAmountRequired, M3_SELLER_AMOUNT);
      assert.equal(terms.payTo, RECEIVER);
      assert.equal(terms.resource, M3_SELLER_PATH);
      assert.equal(response.body.includes("test-secret-key"), false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
