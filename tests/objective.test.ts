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
import type {
  ActivityResult,
  CompanyResourceInventory,
  EvidenceRecord,
  PlannerProposal,
  SourceClass,
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

function evidence(
  overrides: Partial<EvidenceRecord> = {},
): EvidenceRecord {
  return {
    id: "ev1",
    sourceClass: "public_web",
    label: "Target homepage",
    text: "The target serves small businesses.",
    url: "https://example.com",
    observedAt: now,
    recordedBy: "worker_test",
    runId: "run1",
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

function contract() {
  return createWorkContract({
    assignment: "Evaluate Acme as a partnership target.",
    idempotencyScope: "objective-test:workitem-1",
    worker: createWorkerSpec([
      "company_records_lookup",
      "public_information_research",
    ]),
    requiredSourceClasses: ["company_record", "public_web"],
    minObservations: 3,
  });
}

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

test("the work contract states an explicit assignment boundary", () => {
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
      }),
      evidence({ id: "ev-web1" }),
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
      }),
      evidence({ id: "ev-web1" }),
    ],
    result: result(),
  });
  assert.equal(onlyTwo.complete, false);
  assert.ok(onlyTwo.unmet.some((line) => /Only 2 of 3 required observations/.test(line)));

  const missingPublic = evaluateCompletion({
    contract: c,
    evidence: [
      evidence({
        id: "ev-int",
        sourceClass: "company_record",
        recordRef: "company/profile",
      }),
      evidence({ id: "ev-int2", sourceClass: "company_record" }),
      evidence({ id: "ev-int3", sourceClass: "company_record" }),
    ],
    result: result(),
  });
  assert.equal(missingPublic.complete, false);
  assert.ok(
    missingPublic.unmet.some((line) => /No observation recorded from public_web/.test(line)),
  );
});

test("incomplete work cannot claim completion via a partial result", () => {
  const c = contract();
  const full = [
    evidence({
      id: "ev-int",
      sourceClass: "company_record",
      recordRef: "company/profile",
    }),
    evidence({ id: "ev-web1" }),
    evidence({ id: "ev-web2" }),
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
        requiredSourceClasses: ["public_web"],
        minObservations: 1,
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
        requiredSourceClasses: [],
      }),
    /required source class/,
  );
  assert.throws(
    () =>
      createWorkContract({
        ...contractInput(),
        minObservations: 1,
        requiredSourceClasses: ["public_web", "company_record"] as SourceClass[],
      }),
    /must cover every required source class/,
  );
});

function contractInput() {
  return {
    assignment: "Evaluate Acme.",
    idempotencyScope: "obj:wi",
    worker: createWorkerSpec(["public_information_research"]),
    requiredSourceClasses: ["public_web"] as SourceClass[],
    minObservations: 2,
  };
}

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
