/**
 * CP3 eligibility: under testnet_demo, a social-intelligence need discovers 3
 * offerings but only Social Media Guru is purpose-compatible / executable.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createTestnetDemoDiscovery } from "../lib/market/testnetDemoMarket";
import { VERIFIED_SERVICE_REGISTRY } from "../lib/market/registryData";
import { groundRegistryOfferings } from "../lib/management/grounding";
import {
  externalOfferingAcceptsPurpose,
  hasConfiguredExternalExecutionPath,
} from "../lib/providers/executionCapability";
import { EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND } from "../lib/workforce/catalog";
import { SOCIAL_MEDIA_GURU_SERVICE_ID } from "../lib/payment/socialMediaGuruProduct";
import {
  TESTNET_TOKEN_MARKET_SERVICE_ID,
  TESTNET_WALLET_RISK_SERVICE_ID,
} from "../lib/payment/testnetDemoProducts";

const PURPOSE =
  "Obtain current audience and trend evidence across TikTok Instagram Facebook and X for a marketing plan";

test("testnet social need: 3 discovered, only Social Media Guru purpose-compatible and executable", async () => {
  const discovered = await createTestnetDemoDiscovery().discover({
    resourceClass: "proprietary_data",
    taskDescription: PURPOSE,
  });
  assert.equal(discovered.length, 3);

  const { offerings } = groundRegistryOfferings({
    registry: VERIFIED_SERVICE_REGISTRY,
    discovered,
    requiredResourceClass: "proprietary_data",
    at: 1_960_000_000_000,
    purpose: PURPOSE,
    purposeKind: EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
  });

  assert.equal(offerings.length, 3);
  const guru = offerings.find((o) => o.serviceId === SOCIAL_MEDIA_GURU_SERVICE_ID);
  const token = offerings.find((o) => o.serviceId === TESTNET_TOKEN_MARKET_SERVICE_ID);
  const wallet = offerings.find((o) => o.serviceId === TESTNET_WALLET_RISK_SERVICE_ID);
  assert.ok(guru && token && wallet);

  assert.equal(guru!.compatibleResourceClass, true);
  assert.equal(guru!.purposeScopeCompatible, true);
  assert.equal(guru!.executionPathConfigured, true);
  assert.equal(
    hasConfiguredExternalExecutionPath({
      providerId: guru!.providerId,
      serviceId: guru!.serviceId,
    }),
    true,
  );

  assert.equal(token!.compatibleResourceClass, true, "token offering stays in the market");
  assert.equal(token!.purposeScopeCompatible, false, "token offering is not social-intel eligible");
  assert.equal(token!.executionPathConfigured, false);

  assert.equal(wallet!.compatibleResourceClass, true);
  assert.equal(wallet!.purposeScopeCompatible, false);
  assert.equal(wallet!.executionPathConfigured, false);

  assert.equal(
    externalOfferingAcceptsPurpose({
      serviceId: SOCIAL_MEDIA_GURU_SERVICE_ID,
      purpose: PURPOSE,
      purposeKind: EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
      resourceClass: "proprietary_data",
    }),
    true,
  );
});
