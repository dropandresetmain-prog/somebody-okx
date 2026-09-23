/**
 * CP2 focused tests: Social Media Guru + 3-offering Testnet demo market.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  createTestnetDemoDiscovery,
  TESTNET_DEMO_OFFERING_COUNT,
  TESTNET_DEMO_OFFERINGS,
} from "../lib/market/testnetDemoMarket";
import { createDecisionMarketDiscovery } from "../lib/management/decisionPass";
import { externalOfferingAcceptsPurpose } from "../lib/providers/executionCapability";
import { getAdapter } from "../lib/providers/registry";
import {
  SOCIAL_MEDIA_GURU_LIMITATION,
  SOCIAL_MEDIA_GURU_OFFERING_ID,
  SOCIAL_MEDIA_GURU_PROVIDER_ID,
  SOCIAL_MEDIA_GURU_SERVICE_ID,
  buildSocialMediaGuruProtectedSuccess,
  evaluateSocialMediaGuruProductFulfillment,
  verifySocialMediaGuruProtectedResult,
} from "../lib/payment/socialMediaGuruProduct";
import {
  TESTNET_TOKEN_MARKET_SERVICE_ID,
  TESTNET_WALLET_RISK_SERVICE_ID,
} from "../lib/payment/testnetDemoProducts";
import { EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND } from "../lib/workforce/catalog";
import { createM3SellerRoutes, M3_SOCIAL_MEDIA_GURU_PATH } from "../lib/payment/m3Seller";

test("testnet_demo marketplace exposes exactly 3 controlled offerings", async () => {
  assert.equal(TESTNET_DEMO_OFFERINGS.length, TESTNET_DEMO_OFFERING_COUNT);
  const discovery = createTestnetDemoDiscovery();
  const found = await discovery.discover({
    resourceClass: "proprietary_data",
    taskDescription: "external social intelligence for multi-platform marketing",
  });
  assert.equal(found.length, 3);
  assert.ok(found.every((o) => o.source.kind === "controlled_testnet"));
  assert.ok(
    found.some((o) => o.offeringId === SOCIAL_MEDIA_GURU_OFFERING_ID),
    "Social Media Guru must be present",
  );
  assert.ok(found.some((o) => o.serviceId === TESTNET_TOKEN_MARKET_SERVICE_ID));
  assert.ok(found.some((o) => o.serviceId === TESTNET_WALLET_RISK_SERVICE_ID));
});

test("Social Media Guru matches external_social_intelligence; crypto offerings do not", () => {
  const purpose =
    "Need current audience and trend evidence for TikTok Instagram Facebook and X marketing plan";
  assert.equal(
    externalOfferingAcceptsPurpose({
      serviceId: SOCIAL_MEDIA_GURU_SERVICE_ID,
      purpose,
      purposeKind: EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
      resourceClass: "proprietary_data",
    }),
    true,
  );
  assert.equal(
    externalOfferingAcceptsPurpose({
      serviceId: TESTNET_TOKEN_MARKET_SERVICE_ID,
      purpose,
      purposeKind: EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
      resourceClass: "proprietary_data",
    }),
    false,
    "token market must not become a valid social-intelligence purchase",
  );
  assert.equal(
    externalOfferingAcceptsPurpose({
      serviceId: TESTNET_WALLET_RISK_SERVICE_ID,
      purpose,
      purposeKind: EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
      resourceClass: "proprietary_data",
    }),
    false,
    "wallet risk must not become a valid social-intelligence purchase",
  );
});

test("Social Media Guru product contract preserves synthetic Testnet provenance", () => {
  const result = evaluateSocialMediaGuruProductFulfillment({
    resourceClass: "proprietary_data",
    productId: SOCIAL_MEDIA_GURU_SERVICE_ID,
    serviceId: SOCIAL_MEDIA_GURU_SERVICE_ID,
    offeringId: SOCIAL_MEDIA_GURU_OFFERING_ID,
    purpose: "Audience and trend evidence for multi-platform social marketing",
    purposeKind: EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
    requestId: "req_smg_1",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.provenance, "synthetic_test_provider");
  assert.equal(result.limitation, SOCIAL_MEDIA_GURU_LIMITATION);
  assert.match(result.content, /No live TikTok/);
  assert.match(result.content, /synthetic_test_provider/i);
  assert.ok(verifySocialMediaGuruProtectedResult(result));
  assert.ok(result.payload.platforms.includes("TikTok"));
  assert.ok(result.payload.contentRecommendations.length > 0);

  const adapter = getAdapter(SOCIAL_MEDIA_GURU_PROVIDER_ID);
  assert.ok(adapter);
  const normalized = adapter!.normalizeResponse(result);
  assert.equal(normalized.provenance.providerId, SOCIAL_MEDIA_GURU_PROVIDER_ID);
});

test("decision discovery uses Testnet market only when SOMEBODY_EXECUTION_MODE=testnet_demo", async () => {
  const prev = process.env.SOMEBODY_EXECUTION_MODE;
  try {
    process.env.SOMEBODY_EXECUTION_MODE = "testnet_demo";
    const demo = await createDecisionMarketDiscovery().discover({
      resourceClass: "proprietary_data",
      taskDescription: "social intelligence",
    });
    assert.equal(demo.length, 3);
    assert.ok(demo.every((o) => o.source.kind === "controlled_testnet"));

    process.env.SOMEBODY_EXECUTION_MODE = "disabled";
    const snapshot = await createDecisionMarketDiscovery().discover({
      resourceClass: "proprietary_data",
      taskDescription: "social intelligence",
    });
    assert.ok(snapshot.every((o) => o.source.kind === "snapshot"));
    assert.ok(
      snapshot.some((o) => o.serviceId === "newsliquid_twitter_search"),
      "disabled/mainnet path keeps NewsLiquid snapshot integration",
    );
  } finally {
    if (prev === undefined) delete process.env.SOMEBODY_EXECUTION_MODE;
    else process.env.SOMEBODY_EXECUTION_MODE = prev;
  }
});

test("controlled seller routes include Social Media Guru without mutating founder_narrative path", () => {
  const routes = createM3SellerRoutes(
    "0x1111111111111111111111111111111111111111",
  );
  assert.ok(routes[`GET /m3/paid-ping`], "founder_narrative paid-ping preserved");
  assert.ok(routes[`GET ${M3_SOCIAL_MEDIA_GURU_PATH}`], "social media guru route present");
});

test("Social Media Guru refuses incomplete purposeKind (prose cannot self-authorize)", () => {
  const result = evaluateSocialMediaGuruProductFulfillment({
    resourceClass: "proprietary_data",
    productId: null,
    serviceId: SOCIAL_MEDIA_GURU_SERVICE_ID,
    offeringId: SOCIAL_MEDIA_GURU_OFFERING_ID,
    purpose: "social media marketing trends",
    purposeKind: null,
    requestId: "req_x",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "incomplete_product_request");

  const built = buildSocialMediaGuruProtectedSuccess({
    purpose: "ok purpose",
    purposeKind: EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
    requestId: "r1",
    offeringId: SOCIAL_MEDIA_GURU_OFFERING_ID,
  });
  assert.ok(built.content.includes("NOT live"));
});
