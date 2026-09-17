import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { MarketOffering } from "../lib/market/discovery";
import { assessCandidate, selectOffering } from "../lib/market/assessment";
import type { CandidateAssessment } from "../lib/market/assessment";
import { resolveCompatibleClasses } from "../lib/market/registry";
import { VERIFIED_SERVICE_REGISTRY } from "../lib/market/registryData";
import { SNAPSHOT_OFFERINGS } from "../lib/market/snapshotData";
import { createSnapshotDiscovery } from "../lib/market/snapshotDiscovery";
import { createOkxDiscovery } from "../lib/market/okxDiscovery";

// Helpers to build offerings for tests
function makeOffering(overrides: Partial<MarketOffering> & { offeringId: string; serviceId: string; providerId: string }): MarketOffering {
  return {
    name: "Test",
    description: "Test offering",
    price: { amount: "1", asset: "USDT", unit: "per_use" },
    source: { kind: "snapshot" as const, retrievedAt: 0 },
    compatibleResourceClasses: [],
    ...overrides,
  };
}

function validatedOfferering(offering: MarketOffering): MarketOffering {
  return {
    ...offering,
    compatibleResourceClasses: resolveCompatibleClasses(offering, VERIFIED_SERVICE_REGISTRY),
  };
}

describe("Market — offeringId format", () => {
  it("offeringId is providerId:serviceId for all snapshot offerings", () => {
    for (const o of SNAPSHOT_OFFERINGS) {
      assert.equal(o.offeringId, `${o.providerId}:${o.serviceId}`);
    }
    assert.ok(SNAPSHOT_OFFERINGS.length >= 4);
  });
});

describe("Market — registry resolveCompatibleClasses", () => {
  it("returns classes for verified service", () => {
    const classes = resolveCompatibleClasses(
      { serviceId: "newsliquid_twitter_search" },
      VERIFIED_SERVICE_REGISTRY,
    );
    assert.deepEqual(classes, ["proprietary_data"]);
  });

  it("returns empty for unverified service", () => {
    const classes = resolveCompatibleClasses(
      { serviceId: "unknown_service_xyz" },
      VERIFIED_SERVICE_REGISTRY,
    );
    assert.deepEqual(classes, []);
  });
});

describe("Market — assessCandidate", () => {
  it("rejects redundant generic growth offering (reject_redundant)", () => {
    const offering = validatedOfferering(
      makeOffering({
        offeringId: "4442:flybeacon_project_growth_analysis",
        providerId: "4442",
        serviceId: "flybeacon_project_growth_analysis",
      }),
    );
    // Company already owns llm_reasoning, public_web, company_records
    const owned = ["llm_reasoning", "public_web", "company_records", "ordinary_compute"] as const;
    const result = assessCandidate({
      offering,
      need: { resourceClass: "llm_reasoning" },
      ownedResourceClasses: owned,
    });
    assert.equal(result.verdict, "reject_redundant");
    assert.equal(result.reasonCode, "redundant_with_owned_resources");
  });

  it("selects the scarce proprietary_data offering (eligible_buy)", () => {
    const offering = validatedOfferering(
      makeOffering({
        offeringId: "2135:newsliquid_twitter_search",
        providerId: "2135",
        serviceId: "newsliquid_twitter_search",
        price: { amount: "0.002", asset: "USDT", unit: "per_use" },
      }),
    );
    // Company does NOT own proprietary_data
    const owned = ["llm_reasoning", "public_web", "company_records", "ordinary_compute"] as const;
    const result = assessCandidate({
      offering,
      need: { resourceClass: "proprietary_data" },
      ownedResourceClasses: owned,
    });
    assert.equal(result.verdict, "eligible_buy");
    assert.equal(result.reasonCode, "supplies_missing_resource");
  });

  it("rejects unverified service (reject_untrusted)", () => {
    const offering = makeOffering({
      offeringId: "9999:unknown_service",
      providerId: "9999",
      serviceId: "unknown_service",
      compatibleResourceClasses: [], // not in registry
    });
    const result = assessCandidate({
      offering,
      need: { resourceClass: "proprietary_data" },
      ownedResourceClasses: ["llm_reasoning"],
    });
    assert.equal(result.verdict, "reject_untrusted");
    assert.equal(result.reasonCode, "unverified_or_invalid");
  });

  it("rejects wrong-class verified offering (reject_incompatible)", () => {
    const offering = validatedOfferering(
      makeOffering({
        offeringId: "3460:xbird_twitter_x_api",
        providerId: "3460",
        serviceId: "xbird_twitter_x_api",
      }),
    );
    // xbird provides privileged_access, but need is proprietary_data
    const result = assessCandidate({
      offering,
      need: { resourceClass: "proprietary_data" },
      ownedResourceClasses: ["llm_reasoning"],
    });
    assert.equal(result.verdict, "reject_incompatible");
    assert.equal(result.reasonCode, "resource_class_mismatch");
  });
});

describe("Market — selectOffering", () => {
  function offeringWithPrice(id: string, amount: string): MarketOffering {
    return makeOffering({
      offeringId: id,
      providerId: id.split(":")[0],
      serviceId: id.split(":")[1],
      price: { amount, asset: "USDT", unit: "per_use" },
      compatibleResourceClasses: ["proprietary_data"],
    });
  }

  it("picks lowest price among eligible", () => {
    const o1 = offeringWithPrice("2135:newsliquid_twitter_search", "0.002");
    const o2 = offeringWithPrice("4442:flybeacon_x_narrative_pulse", "0.5");
    const assessments: CandidateAssessment[] = [
      {
        offeringId: o1.offeringId,
        verdict: "eligible_buy",
        reasonCode: "supplies_missing_resource",
        resourceClass: "proprietary_data",
        rationale: "test",
      },
      {
        offeringId: o2.offeringId,
        verdict: "eligible_buy",
        reasonCode: "supplies_missing_resource",
        resourceClass: "proprietary_data",
        rationale: "test",
      },
    ];
    const result = selectOffering(assessments, [o1, o2]);
    assert.ok(result);
    assert.equal(result.offeringId, "2135:newsliquid_twitter_search");
  });

  it("is deterministic — same price breaks tie by offeringId lexicographic", () => {
    const o1 = offeringWithPrice("aaa:svc1", "0.01");
    const o2 = offeringWithPrice("bbb:svc2", "0.01");
    const assessments: CandidateAssessment[] = [
      {
        offeringId: o2.offeringId,
        verdict: "eligible_buy",
        reasonCode: "supplies_missing_resource",
        resourceClass: "proprietary_data",
        rationale: "test",
      },
      {
        offeringId: o1.offeringId,
        verdict: "eligible_buy",
        reasonCode: "supplies_missing_resource",
        resourceClass: "proprietary_data",
        rationale: "test",
      },
    ];
    // Run twice to verify determinism
    const r1 = selectOffering(assessments, [o1, o2]);
    const r2 = selectOffering(assessments, [o2, o1]);
    assert.ok(r1);
    assert.ok(r2);
    assert.equal(r1.offeringId, r2.offeringId);
    assert.equal(r1.offeringId, "aaa:svc1");
  });

  it("returns null when none eligible", () => {
    const assessments: CandidateAssessment[] = [
      {
        offeringId: "4442:flybeacon_project_growth_analysis",
        verdict: "reject_redundant",
        reasonCode: "redundant_with_owned_resources",
        resourceClass: "llm_reasoning",
        rationale: "test",
      },
    ];
    const result = selectOffering(assessments, []);
    assert.equal(result, null);
  });
});

describe("Market — snapshot discovery", () => {
  it("is need-driven (task description) and respects limit", async () => {
    const discovery = createSnapshotDiscovery();

    // proprietary_data + social intelligence keywords → should find Newsliquid + FlyBeacon fallback
    const results = await discovery.discover({
      resourceClass: "proprietary_data",
      taskDescription: "social intelligence about current twitter narrative",
      limit: 5,
    });
    assert.ok(results.length >= 1);
    assert.ok(results.length <= 5);
    // All results must have proprietary_data in compatible classes
    for (const r of results) {
      assert.ok(r.compatibleResourceClasses.includes("proprietary_data"));
    }

    // privileged_access + twitter keywords → should find xbird
    const results2 = await discovery.discover({
      resourceClass: "privileged_access",
      taskDescription: "twitter execution API for posting",
      limit: 5,
    });
    assert.ok(results2.length >= 1);
    for (const r of results2) {
      assert.ok(r.compatibleResourceClasses.includes("privileged_access"));
    }
  });

  it("respects hard cap of 10", async () => {
    const discovery = createSnapshotDiscovery();
    const results = await discovery.discover({
      resourceClass: "proprietary_data",
      taskDescription: "social data",
      limit: 100, // should be capped at 10
    });
    assert.ok(results.length <= 10);
  });

  it("returns empty for resource class with no matching offerings", async () => {
    const discovery = createSnapshotDiscovery();
    const results = await discovery.discover({
      resourceClass: "human_voice_contact",
      taskDescription: "social media intelligence",
    });
    assert.equal(results.length, 0);
  });
});

describe("Market — okxDiscovery adapter", () => {
  it("delegates to snapshot and returns same interface", async () => {
    const discovery = createOkxDiscovery();
    const results = await discovery.discover({
      resourceClass: "proprietary_data",
      taskDescription: "social intelligence twitter",
    });
    assert.ok(results.length >= 1);
    // Verify it's the same as snapshot
    const snapshot = createSnapshotDiscovery();
    const snapshotResults = await snapshot.discover({
      resourceClass: "proprietary_data",
      taskDescription: "social intelligence twitter",
    });
    assert.equal(results.length, snapshotResults.length);
    for (let i = 0; i < results.length; i++) {
      assert.equal(results[i].offeringId, snapshotResults[i].offeringId);
    }
  });
});
