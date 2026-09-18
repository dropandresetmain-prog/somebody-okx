// Level 2 — the Objective sourcing seam.
//
// These prove the integration, not the kernel rule (that is tests/sourcing.test.ts):
// the Objective layer must contain no make-vs-buy logic of its own, must delegate
// to the canonical policy, and must persist the decision truthfully.

import test from "node:test";
import assert from "node:assert/strict";
import {
  APPROVED_PROVIDER_PATHS,
  approvedPathsFor,
  decideObjectiveSourcing,
} from "@/lib/objective/sourcing";
import { validatePlannerProposal } from "@/lib/objective/planner";
import { evaluateSourcingPolicy } from "@/lib/sourcing";
import { CURRENT_RESOURCE_INVENTORY } from "@/lib/objective/policy";
import { RESOURCE_CLASSES } from "@/lib/workforce/catalog";
import type { ApprovedProviderPath } from "@/lib/sourcing";
import type {
  CompanyResourceInventory,
  PlannerProposal,
} from "@/lib/objective/types";

const now = 1800000000000;

// A proposal whose capabilities require resources spanning the "owned" and
// "not owned" boundary of the current factual inventory.
function proposal(
  overrides: Partial<PlannerProposal> = {},
): PlannerProposal {
  return {
    capabilityKeys: ["company_records_lookup", "public_information_research"],
    responsibility: "Evaluate whether the target is a suitable partner.",
    requiredResourceClasses: ["llm_reasoning", "public_web"],
    ...overrides,
  };
}

function inventory(available: string[]): CompanyResourceInventory {
  return {
    availableResourceClasses:
      available as CompanyResourceInventory["availableResourceClasses"],
    observedAt: now,
  };
}

const fullInventory = () => inventory(CURRENT_RESOURCE_INVENTORY);

// ── Single authority ────────────────────────────────────────────────────────

test("the Objective layer delegates: the seam result equals the canonical policy verdict", () => {
  const validated = validatePlannerProposal(proposal());

  for (const candidate of [
    fullInventory(),
    inventory(["llm_reasoning"]),
    inventory([]),
  ]) {
    const adapted = decideObjectiveSourcing({ validated, inventory: candidate });
    const canonical = evaluateSourcingPolicy({
      validatedNeeds: {
        requiredResourceClasses: validated.requiredResourceClasses,
        rejectedUnknownClasses: validated.rejectedResourceClasses,
      },
      factualInventory: {
        controlledResourceClasses: candidate.availableResourceClasses,
      },
      approvedProviderPaths: APPROVED_PROVIDER_PATHS,
    });

    assert.equal(canonical.outcome, "authorizing");
    if (canonical.outcome !== "authorizing") continue;

    // The seam may add presentation text, but never a different verdict.
    assert.equal(adapted.decision, canonical.decision);
    assert.equal(adapted.reasonCode, canonical.reasonCode);
    assert.deepEqual([...adapted.missing].sort(), [
      ...canonical.missingResourceClasses,
    ].sort());
    assert.deepEqual([...adapted.satisfied].sort(), [
      ...canonical.satisfiedResourceClasses,
    ].sort());
  }
});

test("no duplicate sourcing authority survives: planner.ts declares no decision rule", async () => {
  const { readFileSync } = await import("node:fs");
  const planner = readFileSync("lib/objective/planner.ts", "utf8");

  // The removed M1 rule returned these literals directly from planner.ts. If
  // either ever reappears here, two MAKE/BLOCKED policies are back in the tree.
  assert.ok(
    !/decision:\s*"MAKE"/.test(planner),
    'planner.ts still contains a "MAKE" decision literal',
  );
  assert.ok(
    !/decision:\s*"BLOCKED"/.test(planner),
    'planner.ts still contains a "BLOCKED" decision literal',
  );
  assert.ok(
    !/export function evaluateSourcing\b/.test(planner),
    "planner.ts still exports its own evaluateSourcing()",
  );
  // Sourcing must be explicitly delegated, not silently absent.
  assert.ok(/lib\/sourcing/.test(planner), "planner.ts does not point at lib/sourcing");
});

test("exactly one canonical sourcing policy is defined in the tree", async () => {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");

  function walkTs(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (name === "node_modules" || name === "_generated") continue;
        walkTs(full, out);
      } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
        out.push(full);
      }
    }
    return out;
  }

  const files = ["lib", "convex", "app"].flatMap((root) => walkTs(root));
  const declarations = files.filter((file) =>
    /export function evaluateSourcingPolicy\b/.test(readFileSync(file, "utf8")),
  );
  // One definition, in the kernel.
  assert.equal(declarations.length, 1);
  assert.match(declarations[0].replace(/\\/g, "/"), /lib\/sourcing\/policy\.ts/);

  // And the removed M1 duplicate must not come back under any path.
  assert.deepEqual(
    files.filter((file) =>
      /export function evaluateSourcing\b/.test(readFileSync(file, "utf8")),
    ),
    [],
    "a second evaluateSourcing() authority reappeared",
  );
});

// ── Factual inventory remains the only ownership authority ──────────────────

test("catalog ownership metadata never makes a resource controlled", () => {
  // Every class the catalog labels "owned" must still be missing when the
  // factual inventory says so. Vocabulary and control stay distinct.
  const ownedLabels = RESOURCE_CLASSES.filter(
    (resource) => resource.ownership === "owned",
  ).map((resource) => resource.class);
  assert.ok(ownedLabels.length > 0);

  const validated = validatePlannerProposal(proposal());
  const decision = decideObjectiveSourcing({
    validated,
    inventory: inventory([]),
  });
  assert.equal(decision.decision, "BLOCKED");
  assert.equal(decision.satisfied.length, 0);
  assert.equal(
    decision.missing.length,
    validated.requiredResourceClasses.length,
  );
});

// ── BUY / BLOCKED persistence truth ─────────────────────────────────────────

test("BUY persists the named missing resource AND its approved provider path", () => {
  const validated = validatePlannerProposal(proposal());
  const missing = ["public_web"] as const;
  const controlled = validated.requiredResourceClasses.filter(
    (resource) => !missing.includes(resource as (typeof missing)[number]),
  );
  const path: ApprovedProviderPath = {
    forResourceClass: "public_web",
    pathId: "candidate_public_data_provider",
  };

  const decision = decideObjectiveSourcing({
    validated,
    inventory: inventory(controlled),
    approvedProviderPaths: [path],
  });

  assert.equal(decision.decision, "BUY");
  assert.equal(decision.reasonCode, "missing_with_approved_path");
  assert.deepEqual([...decision.missing], ["public_web"]);
  assert.deepEqual(
    decision.approvedProviderPaths.map((entry) => [
      entry.forResourceClass,
      entry.pathId,
    ]),
    [["public_web", "candidate_public_data_provider"]],
  );
  // The reason must name the missing resource so it is auditable downstream.
  assert.match(decision.reason, /public_web/);
});

test("BLOCKED persists the missing resource with NO approved path", () => {
  const validated = validatePlannerProposal(proposal());
  const decision = decideObjectiveSourcing({
    validated,
    inventory: inventory(["llm_reasoning", "ordinary_compute"]),
    // A path exists, but only for a resource that is NOT missing.
    approvedProviderPaths: [
      { forResourceClass: "attestation", pathId: "notary_service" },
    ],
  });

  assert.equal(decision.decision, "BLOCKED");
  assert.equal(decision.reasonCode, "missing_without_approved_path");
  assert.ok(decision.missing.includes("public_web"));
  // An unrelated approved path must not leak into the persisted decision.
  assert.deepEqual([...decision.approvedProviderPaths], []);
});

test("a path approved for resource A cannot satisfy missing resource B", () => {
  const validated = validatePlannerProposal(proposal());
  const controlled = validated.requiredResourceClasses.filter(
    (resource) => resource !== "public_web",
  );
  const decision = decideObjectiveSourcing({
    validated,
    inventory: inventory(controlled),
    approvedProviderPaths: [
      { forResourceClass: "company_records", pathId: "wrong_resource_path" },
    ],
  });
  assert.equal(decision.decision, "BLOCKED");
});

test("the shipped provider registry is empty, so the current product cannot fabricate a BUY", () => {
  // M2 must not invent a canonical provider. With no approved paths recorded,
  // anything missing is BLOCKED, and only full control yields MAKE.
  assert.deepEqual([...APPROVED_PROVIDER_PATHS], []);
  assert.deepEqual([...approvedPathsFor(["public_web"])], []);

  const validated = validatePlannerProposal(proposal());
  assert.equal(
    decideObjectiveSourcing({ validated, inventory: fullInventory() }).decision,
    "MAKE",
  );
  assert.equal(
    decideObjectiveSourcing({
      validated,
      inventory: inventory(["llm_reasoning", "ordinary_compute"]),
    }).decision,
    "BLOCKED",
  );
});

test("the registry lookup is resource-specific", () => {
  const registry: ApprovedProviderPath[] = [
    { forResourceClass: "attestation", pathId: "notary_service" },
    { forResourceClass: "public_web", pathId: "data_provider" },
  ];
  assert.deepEqual(
    approvedPathsFor(["public_web"], registry).map((entry) => entry.pathId),
    ["data_provider"],
  );
  // Sorted by the resource class the path is approved for, so attestation
  // precedes public_web deterministically.
  assert.deepEqual(
    approvedPathsFor(["public_web", "attestation"], registry).map(
      (entry) => entry.pathId,
    ),
    ["notary_service", "data_provider"],
  );
});

// ── Fail-closed + determinism at the seam ───────────────────────────────────

test("an unsatisfiable requirement set fails closed at the seam instead of defaulting to MAKE", () => {
  // Empty requirements reach the seam only through a bug, and must throw.
  const validated = validatePlannerProposal(proposal());
  assert.throws(
    () =>
      decideObjectiveSourcing({
        validated: { ...validated, requiredResourceClasses: [] },
        inventory: fullInventory(),
      }),
    /refused/i,
  );
});

test("the seam is deterministic for identical inputs", () => {
  const validated = validatePlannerProposal(proposal());
  const a = decideObjectiveSourcing({ validated, inventory: fullInventory() });
  const b = decideObjectiveSourcing({ validated, inventory: fullInventory() });
  assert.deepEqual(a, b);
});

// ── M1 MAKE behaviour is still intact ───────────────────────────────────────

test("existing M1 MAKE path is unchanged: validated capability + full inventory → MAKE", () => {
  const validated = validatePlannerProposal(proposal());
  const decision = decideObjectiveSourcing({
    validated,
    inventory: fullInventory(),
  });
  assert.equal(decision.decision, "MAKE");
  assert.equal(decision.reasonCode, "all_resources_controlled");
  assert.equal(decision.missing.length, 0);
  assert.equal(decision.approvedProviderPaths.length, 0);
  // The capabilities the M1 runtime executes on are untouched by M2.
  assert.deepEqual(validated.capabilityKeys, [
    "company_records_lookup",
    "public_information_research",
  ]);
});

test("a missing worker never produces BUY: resources in control keep the decision MAKE", () => {
  // No WorkerSpec exists for these capabilities on a fresh deployment, yet the
  // underlying resources are controlled → MAKE, not BUY.
  const validated = validatePlannerProposal(
    proposal({ capabilityKeys: ["document_drafting"] }),
  );
  const decision = decideObjectiveSourcing({
    validated,
    inventory: fullInventory(),
  });
  assert.equal(decision.decision, "MAKE");
});

// ── The model cannot approve a provider path ────────────────────────────────

test("provider-path approval has exactly one source: the application registry", async () => {
  const { readFileSync } = await import("node:fs");
  const spine = readFileSync("convex/objectives.ts", "utf8");

  // The Convex spine calls the seam without supplying paths, so the decision
  // can only ever use the application-owned registry. A model-authored
  // approvedProviderPaths argument cannot reach the policy.
  const calls = spine.match(/decideObjectiveSourcing\(\{[\s\S]*?\}\)/g) ?? [];
  assert.ok(calls.length > 0, "the Convex spine no longer calls decideObjectiveSourcing");
  for (const call of calls)
    assert.ok(
      !/approvedProviderPaths/.test(call),
      `spine passes provider paths into the seam: ${call}`,
    );

  // And the planner argument vocabulary carries no decision or provider field.
  const args = readFileSync("convex/objectiveArgs.ts", "utf8");
  const proposalShape =
    args.match(/export const vPlannerProposal = v\.object\(\{[\s\S]*?\}\);/);
  assert.ok(proposalShape, "vPlannerProposal not found");
  for (const forbidden of [
    "decision",
    "approvedProviderPaths",
    "provider",
    "makeOrBuy",
    "pathId",
  ])
    assert.ok(
      !new RegExp(`\\b${forbidden}\\b\\s*:`).test(proposalShape[0]),
      `the model may submit '${forbidden}' in a planner proposal`,
    );
});

// ── Persisted-shape backward compatibility (M1 must stay intact) ────────────

test("the persisted sourcing shape still accepts rows written during accepted M1", async () => {
  const { sourcingReason } = await import("@/convex/objectiveValidators");
  const { decideObjectiveSourcing: seam } = await import(
    "@/lib/objective/sourcing"
  );

  // This validator is both the write guard and the read/return shape for
  // getObjective, so a newly REQUIRED field would make every pre-M2 row fail
  // to load. M1 wrote exactly these four fields.
  const m1Fields = ["decision", "satisfied", "missing", "reason"];
  const fields = (sourcingReason as unknown as { fields: Record<string, { isOptional: string }> })
    .fields;
  assert.deepEqual(Object.keys(fields).sort(), [...m1Fields, "approvedProviderPaths", "reasonCode"].sort());
  for (const field of m1Fields)
    assert.equal(fields[field].isOptional, "required", `${field} must stay required`);
  // The two M2 additions must be optional so accepted M1 rows still validate.
  assert.equal(fields.reasonCode.isOptional, "optional");
  assert.equal(fields.approvedProviderPaths.isOptional, "optional");

  // What M2 writes now is complete, independent of the validator's leniency.
  const validated = validatePlannerProposal(proposal());
  const m2Row = seam({ validated, inventory: fullInventory() });
  assert.equal(typeof m2Row.reasonCode, "string");
  assert.ok(Array.isArray(m2Row.approvedProviderPaths));
});
