import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkContract,
  createWorkerSpec,
  evaluateCompletion,
  evaluateSourcing,
  isKnownResourceClass,
  resolveWorker,
  validatePlannerProposal,
} from "../lib/workforce";
import {
  normalizePublicUrl,
  sourceIdentity,
} from "../lib/objective/contract";
import type {
  ActivityResult,
  CompanyResourceInventory,
  EvidenceOrigin,
  EvidenceRecord,
  PlannerProposal,
  SourceClass,
  SourceProof,
} from "../lib/workforce";

const now = 1800000000000;

function plannerProposal(
  overrides: Partial<PlannerProposal> = {},
): PlannerProposal {
  return {
    capabilityKeys: ["company_records_lookup", "public_information_research"],
    responsibility: "Evaluate whether the target is a suitable partner.",
    requiredResourceClasses: ["llm_reasoning", "public_web"],
    ...overrides,
  };
}

function inventory(
  available: CompanyResourceInventory["availableResourceClasses"],
): CompanyResourceInventory {
  return { availableResourceClasses: available, observedAt: now };
}

function fullInventory() {
  return inventory([
    "llm_reasoning",
    "public_web",
    "company_records",
    "company_tools",
    "ordinary_compute",
  ]);
}

// Helper to compute sourceId from sourceClass/url/recordRef
function computeSourceId(
  sourceClass: SourceClass,
  url?: string,
  recordRef?: string,
): string {
  return sourceIdentity({ sourceClass, url, recordRef });
}

function evidence(
  overrides: Partial<EvidenceRecord> & {
    origin?: EvidenceOrigin;
    sourceId?: string;
  } = {},
): EvidenceRecord {
  const sourceClass = overrides.sourceClass ?? "public_web";
  const url = overrides.url ?? "https://example.com";
  const recordRef = overrides.recordRef;
  // Auto-derive origin and sourceId from overrides if not explicitly provided
  const origin = overrides.origin ?? "application_observation";
  const sourceId =
    overrides.sourceId ?? computeSourceId(sourceClass, url, recordRef);
  return {
    id: "ev1",
    sourceClass,
    label: "Target homepage",
    text: "The target serves small businesses.",
    url,
    observedAt: now,
    recordedBy: "worker_test",
    runId: "run1",
    origin,
    sourceId,
    ...overrides,
  };
}

function result(overrides: Partial<ActivityResult> = {}): ActivityResult {
  return {
    summary: "Reasonable fit with two open risks.",
    fit: "Serves SMEs; integrates with existing tools.",
    risks: ["No public pricing"],
    unknowns: ["Ownership structure"],
    recommendedNextAction: "Contact via the partner form.",
    completedAt: now,
    ...overrides,
  };
}

const defaultSourceProofs: SourceProof[] = [
  { sourceClass: "company_record", minDistinctSources: 1 },
  { sourceClass: "public_web", minDistinctSources: 2 },
];

function contract() {
  return createWorkContract({
    assignment: "Evaluate Acme as a partnership target.",
    idempotencyScope: "objective-test:workitem-1",
    worker: createWorkerSpec([
      "company_records_lookup",
      "public_information_research",
    ]),
    sourceProofs: defaultSourceProofs,
  });
}

// ── Source identity + URL normalization ──────────────────────────────────────

test("normalizePublicUrl lowercases scheme+host, strips www, drops fragment, strips trailing slash", () => {
  // Trailing slash stripped
  assert.equal(
    normalizePublicUrl("https://example.com/"),
    "https://example.com",
  );
  // http vs https normalize to same host (different scheme kept)
  assert.equal(
    normalizePublicUrl("HTTPS://Example.COM/page"),
    "https://example.com/page",
  );
  // www. stripped
  assert.equal(
    normalizePublicUrl("https://www.example.com/page"),
    "https://example.com/page",
  );
  // Fragment dropped
  assert.equal(
    normalizePublicUrl("https://example.com/page#section"),
    "https://example.com/page",
  );
  // Query kept
  assert.equal(
    normalizePublicUrl("https://example.com/page?q=1"),
    "https://example.com/page?q=1",
  );
  // Trivial variants all normalize to one identity
  assert.equal(
    normalizePublicUrl("https://example.com"),
    normalizePublicUrl("https://example.com/"),
  );
  assert.equal(
    normalizePublicUrl("https://example.com/page"),
    normalizePublicUrl("https://www.example.com/page#frag"),
  );
  // Unparseable -> ""
  assert.equal(normalizePublicUrl("not a url"), "");
  assert.equal(normalizePublicUrl(""), "");
});

test("sourceIdentity returns stable identity for company_record and public_web, or empty for missing", () => {
  assert.equal(
    sourceIdentity({ sourceClass: "company_record", recordRef: "company/profile" }),
    "record:company/profile",
  );
  assert.equal(
    sourceIdentity({ sourceClass: "company_record", recordRef: "  company/profile  " }),
    "record:company/profile",
  );
  assert.equal(
    sourceIdentity({ sourceClass: "company_record" }),
    "",
  );
  assert.equal(
    sourceIdentity({ sourceClass: "public_web", url: "https://example.com/page" }),
    "url:https://example.com/page",
  );
  assert.equal(
    sourceIdentity({ sourceClass: "public_web", url: "https://www.example.com/page/" }),
    "url:https://example.com/page",
  );
  assert.equal(
    sourceIdentity({ sourceClass: "public_web" }),
    "",
  );
});

// ── Planner / application boundary ──────────────────────────────────────────

test("a well-formed planner proposal validates with derived resources", () => {
  const plan = validatePlannerProposal(plannerProposal());
  assert.deepEqual(plan.capabilityKeys, [
    "company_records_lookup",
    "public_information_research",
  ]);
  assert.deepEqual(plan.requiredResourceClasses, [
    "company_records",
    "company_tools",
    "llm_reasoning",
    "ordinary_compute",
    "public_web",
  ]);
  assert.equal(plan.rejectedCapabilityKeys.length, 0);
  assert.equal(plan.rejectedResourceClasses.length, 0);
});

test("unknown capability keys are rejected fail-closed", () => {
  const plan = validatePlannerProposal(
    plannerProposal({
      capabilityKeys: ["company_records_lookup", "negotiate_partnerships"],
    }),
  );
  assert.deepEqual(plan.capabilityKeys, ["company_records_lookup"]);
  assert.deepEqual(plan.rejectedCapabilityKeys, ["negotiate_partnerships"]);
  assert.throws(() =>
    validatePlannerProposal(plannerProposal({ capabilityKeys: ["invent_everything"] })),
  );
});

test("unknown resource classes fail closed but never widen requirements", () => {
  const plan = validatePlannerProposal(
    plannerProposal({
      requiredResourceClasses: ["llm_reasoning", "satellite_uplink" as string],
    }),
  );
  assert.deepEqual(plan.rejectedResourceClasses, ["satellite_uplink"]);
  // Application truth from the capabilities, not the model's list.
  assert.ok(plan.requiredResourceClasses.includes("company_records"));
  assert.ok(!plan.requiredResourceClasses.includes("satellite_uplink" as never));
  assert.equal(isKnownResourceClass("llm_reasoning"), true);
  assert.equal(isKnownResourceClass("satellite_uplink"), false);
});

test("the model cannot smuggle tool permissions or spend authority", () => {
  const plan = validatePlannerProposal(
    plannerProposal({
      requestedToolPermissions: [
        "authorize_external_spend",
        "delete_company_record",
        "draft_document",
      ],
    }),
  );
  // draft_document is not in the records+research envelope; spend is never granted.
  assert.deepEqual(plan.deniedToolPermissions.sort(), [
    "authorize_external_spend",
    "delete_company_record",
    "draft_document",
  ]);
  // The derived envelope (what a worker would actually receive) contains no
  // spend authority.
  const worker = createWorkerSpec(plan.capabilityKeys);
  assert.deepEqual(
    worker.allowedToolPermissions.filter((p) => p === "authorize_external_spend"),
    [],
  );
});

test("an empty or unbounded proposal is rejected", () => {
  assert.throws(
    () => validatePlannerProposal(plannerProposal({ capabilityKeys: [] })),
    /no controlled capability/,
  );
  assert.throws(
    () => validatePlannerProposal(plannerProposal({ responsibility: "  " })),
    /bounded responsibility/,
  );
  assert.throws(() =>
    validatePlannerProposal(
      plannerProposal({ responsibility: "x".repeat(401) }),
    ),
  );
});

// ── Resource evaluation ─────────────────────────────────────────────────────

test("MAKE requires the factual inventory to cover every required resource", () => {
  const plan = validatePlannerProposal(plannerProposal());
  const sourcing = evaluateSourcing({
    requiredResourceClasses: plan.requiredResourceClasses,
    inventory: fullInventory(),
  });
  assert.equal(sourcing.decision, "MAKE");
  assert.equal(sourcing.missing.length, 0);
});

test("a missing required resource does not silently pass as MAKE", () => {
  const plan = validatePlannerProposal(plannerProposal());
  const sourcing = evaluateSourcing({
    requiredResourceClasses: plan.requiredResourceClasses,
    inventory: inventory(["llm_reasoning", "ordinary_compute"]),
  });
  assert.equal(sourcing.decision, "BLOCKED");
  assert.deepEqual(sourcing.missing.sort(), [
    "company_records",
    "company_tools",
    "public_web",
  ]);
  // No catalog membership trick: an empty inventory blocks everything.
  assert.equal(
    evaluateSourcing({
      requiredResourceClasses: plan.requiredResourceClasses,
      inventory: inventory([]),
    }).decision,
    "BLOCKED",
  );
});

// ── WorkContract ────────────────────────────────────────────────────────────

test("the work contract states an explicit assignment boundary and derives requiredSourceClasses + minObservations from sourceProofs", () => {
  const c = contract();
  assert.equal(c.assignment, "Evaluate Acme as a partnership target.");
  assert.equal(c.idempotencyScope, "objective-test:workitem-1");
  assert.equal(c.workerKey, "worker_company_records_lookup-public_information_research");
  assert.deepEqual(c.requiredVerifiedEffectKeys, []);
  assert.equal(c.approvalVersion, null);
  assert.deepEqual(c.allowedToolPermissions.sort(), [
    "read_company_record",
    "read_public_web",
    "record_finding",
  ]);
  // Derived from sourceProofs
  assert.deepEqual(c.requiredSourceClasses.sort(), ["company_record", "public_web"]);
  assert.equal(c.minObservations, 3);
  assert.deepEqual(c.sourceProofs, defaultSourceProofs);
});

test("evidence-only internal work completes when required proof exists", () => {
  const c = contract();
  const complete = evaluateCompletion({
    contract: c,
    evidence: [
      evidence({
        id: "ev-int",
        sourceClass: "company_record",
        label: "Internal criteria",
        recordRef: "partnerships/evaluation-criteria",
        url: undefined,
      }),
      evidence({ id: "ev-web1", url: "https://example.com" }),
      evidence({
        id: "ev-web2",
        label: "Target pricing page",
        url: "https://example.com/pricing",
      }),
    ],
    result: result(),
  });
  assert.equal(complete.complete, true);
  assert.equal(complete.unmet.length, 0);
});

test("no-effect internal work cannot complete with missing observations", () => {
  const c = contract();
  const onlyTwo = evaluateCompletion({
    contract: c,
    evidence: [
      evidence({
        id: "ev-int",
        sourceClass: "company_record",
        recordRef: "company/profile",
        url: undefined,
      }),
      evidence({ id: "ev-web1", url: "https://example.com" }),
    ],
    result: result(),
  });
  assert.equal(onlyTwo.complete, false);
  assert.ok(
    onlyTwo.unmet.some((line) => /public_web: found 1 distinct source\(s\), required 2/.test(line)),
  );

  const missingPublic = evaluateCompletion({
    contract: c,
    evidence: [
      evidence({
        id: "ev-int",
        sourceClass: "company_record",
        recordRef: "company/profile",
        url: undefined,
      }),
      evidence({ id: "ev-int2", sourceClass: "company_record", recordRef: "company/other", url: undefined }),
      evidence({ id: "ev-int3", sourceClass: "company_record", recordRef: "company/third", url: undefined }),
    ],
    result: result(),
  });
  assert.equal(missingPublic.complete, false);
  assert.ok(
    missingPublic.unmet.some((line) => /public_web: found 0 distinct source\(s\), required 2/.test(line)),
  );
});

test("incomplete work cannot claim completion via a partial result", () => {
  const c = contract();
  const full = [
    evidence({
      id: "ev-int",
      sourceClass: "company_record",
      recordRef: "company/profile",
      url: undefined,
    }),
    evidence({ id: "ev-web1", url: "https://example.com" }),
    evidence({ id: "ev-web2", url: "https://example.com/pricing" }),
  ];
  const noResult = evaluateCompletion({
    contract: c,
    evidence: full,
    result: null,
  });
  assert.equal(noResult.complete, false);
  const partial = evaluateCompletion({
    contract: c,
    evidence: full,
    result: result({ risks: [], unknowns: [] }),
  });
  assert.equal(partial.complete, false);
  assert.equal(partial.unmet.length, 2);
  const emptyFields = evaluateCompletion({
    contract: c,
    evidence: full,
    result: result({ summary: "   ", recommendedNextAction: "" }),
  });
  assert.equal(emptyFields.complete, false);
});

test("unauthorized external effects are rejected by the contract boundary", () => {
  assert.throws(
    () =>
      createWorkContract({
        assignment: "Pay a vendor",
        idempotencyScope: "obj:wi",
        worker: {
          ...createWorkerSpec(["public_information_research"]),
          allowedToolPermissions: ["authorize_external_spend"],
        },
        sourceProofs: [{ sourceClass: "public_web", minDistinctSources: 1 }],
      }),
    /cannot bind external spend authority/,
  );
  assert.throws(
    () => createWorkContract({ ...contractInput(), assignment: "  " }),
    /bounded assignment/,
  );
  assert.throws(
    () =>
      createWorkContract({
        ...contractInput(),
        sourceProofs: [],
      }),
    /at least one source proof/,
  );
});

function contractInput() {
  return {
    assignment: "Evaluate Acme.",
    idempotencyScope: "obj:wi",
    worker: createWorkerSpec(["public_information_research"]),
    sourceProofs: [{ sourceClass: "public_web", minDistinctSources: 2 }] as SourceProof[],
  };
}

// ── Blocker A: model_note evidence NEVER counts toward proof ────────────────

test("Blocker A: a model_note row (even with valid sourceClass + url) does NOT complete a run", () => {
  const c = contract();
  // All evidence is model_note — looks complete by old rules, but must fail
  const allNotes = evaluateCompletion({
    contract: c,
    evidence: [
      evidence({
        id: "note-1",
        sourceClass: "company_record",
        recordRef: "company/profile",
        url: undefined,
        origin: "model_note",
        sourceId: "note:ev-1",
      }),
      evidence({
        id: "note-2",
        sourceClass: "public_web",
        url: "https://example.com",
        origin: "model_note",
        sourceId: "note:ev-2",
      }),
      evidence({
        id: "note-3",
        sourceClass: "public_web",
        url: "https://example.com/pricing",
        origin: "model_note",
        sourceId: "note:ev-3",
      }),
    ],
    result: result(),
  });
  assert.equal(allNotes.complete, false);
  assert.ok(
    allNotes.unmet.some((line) => /company_record: found 0 distinct source\(s\), required 1/.test(line)),
  );
  assert.ok(
    allNotes.unmet.some((line) => /public_web: found 0 distinct source\(s\), required 2/.test(line)),
  );
});

test("Blocker A: a note referencing another row still cannot mint proof", () => {
  const c = contract();
  // One real observation + notes that reference it — notes still don't count
  const mixed = evaluateCompletion({
    contract: c,
    evidence: [
      evidence({
        id: "ev-real",
        sourceClass: "company_record",
        recordRef: "company/profile",
        url: undefined,
        origin: "application_observation",
      }),
      // Note referencing the real row — must NOT count
      evidence({
        id: "note-ref",
        sourceClass: "company_record",
        recordRef: "company/profile",
        url: undefined,
        origin: "model_note",
        sourceId: "note:ev-real",
      }),
      // Another note pretending to be public_web
      evidence({
        id: "note-web",
        sourceClass: "public_web",
        url: "https://example.com",
        origin: "model_note",
        sourceId: "note:ev-web",
      }),
    ],
    result: result(),
  });
  assert.equal(mixed.complete, false);
  // company_record has 1 real observation (passes), but public_web has 0 real
  assert.ok(
    mixed.unmet.some((line) => /public_web: found 0 distinct source\(s\), required 2/.test(line)),
  );
});

// ── Blocker B: two distinct public sources are enforced ─────────────────────

test("Blocker B: the SAME public URL twice does NOT satisfy the two-distinct-public-source requirement", () => {
  const c = contract();
  const sameUrlTwice = evaluateCompletion({
    contract: c,
    evidence: [
      evidence({
        id: "ev-int",
        sourceClass: "company_record",
        recordRef: "company/profile",
        url: undefined,
      }),
      evidence({ id: "ev-web1", url: "https://example.com/page" }),
      evidence({ id: "ev-web2", url: "https://example.com/page" }),
    ],
    result: result(),
  });
  assert.equal(sameUrlTwice.complete, false);
  assert.ok(
    sameUrlTwice.unmet.some((line) => /public_web: found 1 distinct source\(s\), required 2/.test(line)),
  );
});

test("Blocker B: trivial URL variants (trailing slash, http vs https scheme, fragment, www) normalize to one identity and do NOT satisfy 2 distinct", () => {
  const c = contract();
  const variants = evaluateCompletion({
    contract: c,
    evidence: [
      evidence({
        id: "ev-int",
        sourceClass: "company_record",
        recordRef: "company/profile",
        url: undefined,
      }),
      // These all normalize to the same URL identity
      evidence({ id: "ev-web1", url: "https://example.com/page" }),
      evidence({ id: "ev-web2", url: "https://example.com/page/" }),
      evidence({ id: "ev-web3", url: "https://www.example.com/page#section" }),
    ],
    result: result(),
  });
  assert.equal(variants.complete, false);
  assert.ok(
    variants.unmet.some((line) => /public_web: found 1 distinct source\(s\), required 2/.test(line)),
  );
});

test("Blocker B: 2 company records + 1 distinct public URL FAILS (needs 2 distinct public)", () => {
  const c = contract();
  const check = evaluateCompletion({
    contract: c,
    evidence: [
      evidence({
        id: "ev-int1",
        sourceClass: "company_record",
        recordRef: "company/profile",
        url: undefined,
      }),
      evidence({
        id: "ev-int2",
        sourceClass: "company_record",
        recordRef: "partnerships/evaluation-criteria",
        url: undefined,
      }),
      evidence({ id: "ev-web1", url: "https://example.com" }),
    ],
    result: result(),
  });
  assert.equal(check.complete, false);
  assert.ok(
    check.unmet.some((line) => /public_web: found 1 distinct source\(s\), required 2/.test(line)),
  );
});

test("Blocker B: valid mix — 1 company record + 2 distinct public URLs + full structured result PASSES", () => {
  const c = contract();
  const check = evaluateCompletion({
    contract: c,
    evidence: [
      evidence({
        id: "ev-int",
        sourceClass: "company_record",
        recordRef: "company/profile",
        url: undefined,
      }),
      evidence({ id: "ev-web1", url: "https://example.com" }),
      evidence({ id: "ev-web2", url: "https://other-site.com/about" }),
    ],
    result: result(),
  });
  assert.equal(check.complete, true);
  assert.equal(check.unmet.length, 0);
});

// ── Worker resolution ───────────────────────────────────────────────────────

test("a compatible worker is reused; otherwise a bounded worker is created", () => {
  const reuse = resolveWorker({
    requiredCapabilityKeys: ["public_information_research"],
    inventory: [createWorkerSpec(["public_information_research"])],
  });
  assert.equal(reuse.outcome, "reuse");
  const created = resolveWorker({
    requiredCapabilityKeys: [
      "company_records_lookup",
      "public_information_research",
    ],
    inventory: [createWorkerSpec(["public_information_research"])],
  });
  assert.equal(created.outcome, "create");
  assert.deepEqual(created.worker.capabilityKeys, [
    "company_records_lookup",
    "public_information_research",
  ]);
});

test("the permission envelope stays deny-by-default and spend stays unavailable", () => {
  const worker = createWorkerSpec([
    "company_records_lookup",
    "public_information_research",
  ]);
  assert.deepEqual(worker.allowedToolPermissions.sort(), [
    "read_company_record",
    "read_public_web",
    "record_finding",
  ]);
  const c = contract();
  assert.ok(!c.allowedToolPermissions.includes("authorize_external_spend"));
});
