import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  AssetDomainMismatchError,
  assertAssetDomainCompatible,
  decodeAbiString,
  decodeAbiUint,
  readAssetDomainFacts,
  verifyAssetDomain,
} from "../lib/payment/assetDomain";
import type { JsonRpcTransport } from "../lib/payment/xlayerSettlement";

/**
 * Fixtures are the real X Layer Testnet responses recorded on 18 Sep 2026 from
 * https://testrpc.xlayer.tech for the asset the live Mock Merchant advertises.
 */
const LIVE_ASSET = "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d";

const NAME_USDC_TEST =
  "0x0000000000000000000000000000000000000000000000000000000000000020" +
  "0000000000000000000000000000000000000000000000000000000000000009" +
  "555344435f544553540000000000000000000000000000000000000000000000";
const VERSION_2 =
  "0x0000000000000000000000000000000000000000000000000000000000000020" +
  "0000000000000000000000000000000000000000000000000000000000000001" +
  "3200000000000000000000000000000000000000000000000000000000000000";
const DECIMALS_6 =
  "0x0000000000000000000000000000000000000000000000000000000000000006";
const DOMAIN_SEPARATOR_ONCHAIN =
  "0x7513e76c6d38c7986bcfe857d0e0772d5050d9db65ef5a941d1e15859baef959";

const SELECTORS = {
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  version: "0x54fd4d50",
  domainSeparator: "0x3644e515",
} as const;

/** Transport replaying the recorded live token responses. */
function liveTokenTransport(overrides: Record<string, unknown> = {}): JsonRpcTransport {
  return async (method, params) => {
    assert.equal(method, "eth_call");
    const call = params[0] as { to: string; data: string };
    assert.equal(call.to, LIVE_ASSET);
    if (call.data in overrides) {
      const value = overrides[call.data];
      if (value === "REVERT") throw new Error("execution reverted");
      return value;
    }
    switch (call.data) {
      case SELECTORS.name:
      case SELECTORS.symbol:
        return NAME_USDC_TEST;
      case SELECTORS.decimals:
        return DECIMALS_6;
      case SELECTORS.version:
        return VERSION_2;
      case SELECTORS.domainSeparator:
        return DOMAIN_SEPARATOR_ONCHAIN;
      default:
        throw new Error(`unexpected selector ${call.data}`);
    }
  };
}

describe("ABI return decoding", () => {
  it("decodes solidity string and uint returns", () => {
    assert.equal(decodeAbiString(NAME_USDC_TEST), "USDC_TEST");
    assert.equal(decodeAbiString(VERSION_2), "2");
    assert.equal(decodeAbiUint(DECIMALS_6), 6);
  });

  it("returns null rather than guessing on undecodable data", () => {
    assert.equal(decodeAbiString(null), null);
    assert.equal(decodeAbiString("0x"), null);
    assert.equal(decodeAbiUint(undefined), null);
  });
});

describe("live asset domain facts", () => {
  it("reads the real on-chain identity of the advertised asset", async () => {
    const facts = await readAssetDomainFacts(liveTokenTransport(), LIVE_ASSET);
    assert.deepEqual(facts, {
      asset: LIVE_ASSET,
      name: "USDC_TEST",
      symbol: "USDC_TEST",
      decimals: 6,
      version: "2",
      domainSeparator: DOMAIN_SEPARATOR_ONCHAIN,
    });
  });

  it("treats a reverted getter as an absent getter, not a transport failure", async () => {
    const facts = await readAssetDomainFacts(
      liveTokenTransport({ [SELECTORS.version]: "REVERT" }),
      LIVE_ASSET,
    );
    assert.equal(facts.version, null);
    assert.equal(facts.name, "USDC_TEST");
  });
});

describe("402 challenge asset domain compatibility", () => {
  /**
   * Regression for the live Sep-2026 Mock Merchant defect: the challenge was
   * migrated from USD₮0 (domain version "1") to USDC_TEST but kept
   * extra.version "1", while the deployed token's domain version is "2".
   * A signature built from that challenge can never be verified by the token.
   */
  it("refuses to sign when the merchant advertises the wrong domain version", async () => {
    await assert.rejects(
      () =>
        assertAssetDomainCompatible(liveTokenTransport(), LIVE_ASSET, {
          name: "USDC_TEST",
          version: "1",
          decimals: 6,
        }),
      (error: unknown) => {
        assert.ok(error instanceof AssetDomainMismatchError);
        assert.equal(error.asset, LIVE_ASSET);
        assert.equal(error.facts.version, "2");
        assert.match(error.reasons.join(" "), /domain version mismatch/);
        assert.match(error.reasons.join(" "), /"1"/);
        assert.match(error.reasons.join(" "), /"2"/);
        return true;
      },
    );
  });

  it("accepts the same challenge once the domain version is correct", async () => {
    const verdict = await assertAssetDomainCompatible(liveTokenTransport(), LIVE_ASSET, {
      name: "USDC_TEST",
      version: "2",
      decimals: 6,
    });
    assert.equal(verdict.state, "compatible");
  });

  it("catches a domain name mismatch as well as a version mismatch", () => {
    const verdict = verifyAssetDomain(
      {
        asset: LIVE_ASSET,
        name: "USDC_TEST",
        symbol: "USDC_TEST",
        decimals: 6,
        version: "2",
        domainSeparator: DOMAIN_SEPARATOR_ONCHAIN,
      },
      { name: "USD₮0", version: "2", decimals: 6 },
    );
    assert.equal(verdict.state, "incompatible");
    assert.match(verdict.reasons.join(" "), /domain name mismatch/);
  });

  it("catches a decimals mismatch that would misprice the atomic amount", () => {
    const verdict = verifyAssetDomain(
      {
        asset: LIVE_ASSET,
        name: "USDC_TEST",
        symbol: "USDC_TEST",
        decimals: 6,
        version: "2",
        domainSeparator: DOMAIN_SEPARATOR_ONCHAIN,
      },
      { name: "USDC_TEST", version: "2", decimals: 18 },
    );
    assert.equal(verdict.state, "incompatible");
    assert.match(verdict.reasons.join(" "), /decimals mismatch/);
  });

  it("reports unverifiable rather than compatible when the token exposes no version()", async () => {
    const verdict = await assertAssetDomainCompatible(
      liveTokenTransport({ [SELECTORS.version]: "REVERT" }),
      LIVE_ASSET,
      { name: "USDC_TEST", version: "1", decimals: 6 },
    );
    assert.equal(verdict.state, "unverifiable");
    assert.match(verdict.reasons.join(" "), /does not expose version\(\)/);
  });
});
