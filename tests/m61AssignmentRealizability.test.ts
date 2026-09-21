/**
 * M6.1 — assignment realizability: document_drafting must materialize a
 * mutation tool; research-only envelopes stay bounded; STOP A interpretation
 * fixes stay bounded.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCatalogIntegrity,
  createWorkContract,
  createWorkerSpec,
  toolPermissionsForCapabilities,
} from "../lib/workforce";
import { toolNamesForContract } from "../lib/worker/runtime";
import { assessInternalContractExecutability } from "../lib/management/dispatch";
import type { Requirement } from "../lib/management/types";
import { CP2_REQUIREMENT_FIELDS } from "./helpers/cp2Requirement";
import {
  interpretObjective,
  isSpendGrantMetaAmbiguity,
} from "../lib/management/interpretation";
import { parseOutcomeContractProposal } from "../lib/management/proposals";

const at = 1_700_000_000_000;

function baselineRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    requirementKey: "req_01",
    objectiveKey: "obj_launch",
    contractId: "contract_launch",
    contractRevision: 1,
    priority: "required",
    title: "Current launch messaging baseline captured",
    mustBeTrue:
      "The exact current launch messaging and its intended audience and offer are documented as the baseline for diagnosis.",
    scope:
      "The exact current launch messaging and its intended audience and offer are documented as the baseline for diagnosis.",
    ...CP2_REQUIREMENT_FIELDS,
    expectedOutput: "documented launch messaging baseline",
    proofs: [
      {
        proofKey: "observation",
        description: "application observation",
        proofKind: "application_observation",
        params: {},
      },
      {
        proofKey: "artifact_change",
        description: "controlled company artifact advanced",
        proofKind: "company_artifact_version",
        params: { artifactKey: "launch/page-message", minVersion: 2 },
      },
    ],
    state: "active",
    strategy: "MAKE",
    resolution: null,
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

// ── Test A — previously impossible envelope is now realizable ───────────────

test("A: company_records_lookup + document_drafting materializes update_company_artifact", () => {
  const keys = ["company_records_lookup", "document_drafting"] as const;
  const granted = toolPermissionsForCapabilities([...keys]);
  assert.ok(granted.includes("update_company_artifact"));
  assert.ok(granted.includes("read_company_record"));
  assert.ok(!granted.includes("draft_document"));

  const spec = createWorkerSpec([...keys]);
  const contract = createWorkContract({
    assignment: "Document launch messaging baseline.",
    idempotencyScope: "m61:realizability:a",
    worker: spec,
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
  });
  const surface = toolNamesForContract(contract);
  assert.ok(surface.materialized.includes("update_company_artifact"));
  assert.ok(surface.materialized.includes("read_company_record"));
  assert.ok(!surface.materialized.includes("draft_document"));
  assert.deepEqual(surface.skipped, []);

  const executable = assessInternalContractExecutability({
    requirement: baselineRequirement(),
    capabilityKeys: [...keys],
  });
  assert.equal(executable.ok, true);
});

// ── Test B — mutation path for genuine artifact requirement ─────────────────

test("B: document_drafting alone binds mutation authority without request_resource", () => {
  const granted = toolPermissionsForCapabilities(["document_drafting"]);
  assert.deepEqual(granted, ["record_finding", "update_company_artifact"]);
  assert.ok(!granted.includes("request_resource"));
  assert.ok(!granted.includes("read_public_web"));

  const artifactOnly = baselineRequirement({
    proofs: [
      {
        proofKey: "artifact_change",
        description: "artifact advanced",
        proofKind: "company_artifact_version",
        params: { artifactKey: "launch/page-message", minVersion: 2 },
      },
    ],
  });
  const artifactOk = assessInternalContractExecutability({
    requirement: artifactOnly,
    capabilityKeys: ["document_drafting"],
  });
  assert.equal(artifactOk.ok, true);
});

// ── Test C — gap path: growth keeps request_resource; drafting combo does not ─

test("C: growth_launch_operations keeps request_resource; records+drafting does not", () => {
  const growth = toolPermissionsForCapabilities(["growth_launch_operations"]);
  assert.ok(growth.includes("request_resource"));
  assert.ok(growth.includes("update_company_artifact"));

  const draftingCombo = toolPermissionsForCapabilities([
    "company_records_lookup",
    "document_drafting",
  ]);
  // Missing-input reporting for this combo is submit_result.missingInputs
  // (workflow), not request_resource — intentional bounded grant.
  assert.ok(!draftingCombo.includes("request_resource"));
  assert.ok(draftingCombo.includes("read_company_record"));
});

// ── Test D — no over-permission for research-only workers ───────────────────

test("D: research-only envelope does not gain mutation authority", () => {
  const research = toolPermissionsForCapabilities([
    "company_records_lookup",
    "public_information_research",
  ]);
  assert.ok(!research.includes("update_company_artifact"));
  assert.ok(!research.includes("request_resource"));
  assert.ok(!research.includes("draft_document"));

  const refused = assessInternalContractExecutability({
    requirement: baselineRequirement(),
    capabilityKeys: ["company_records_lookup", "public_information_research"],
  });
  assert.equal(refused.ok, false);
  if (refused.ok) return;
  assert.ok(
    refused.reasons.some((r) => r.includes("cannot mutate company artifacts")),
  );
});

test("catalog integrity rejects non-materializable grants", () => {
  assert.doesNotThrow(assertCatalogIntegrity);
});

// ── Test E — interpretation STOP A fixes ────────────────────────────────────

test("E: spend-grant meta ambiguity detects grant questions only", () => {
  assert.equal(
    isSpendGrantMetaAmbiguity("What is the approved spend limit amount?"),
    true,
  );
  assert.equal(
    isSpendGrantMetaAmbiguity(
      "Does spend within the founder grant need further approval?",
    ),
    true,
  );
  assert.equal(
    isSpendGrantMetaAmbiguity(
      "Which audience segment should relaunch messaging target?",
    ),
    false,
  );
});

test("E: interpretObjective demotes grant-meta only when spendGrantPresent", () => {
  const rawContract = {
    intent:
      "Diagnose launch messaging and produce a relaunch-ready message set.",
    levels: [
      {
        levelKey: "Diagnosis_Complete",
        order: 1,
        label: "Diagnosis complete",
        statement: "A defensible diagnosis exists.",
      },
      {
        levelKey: "relaunch_ready",
        order: 2,
        label: "Relaunch ready",
        statement: "Relaunch messaging is ready.",
      },
    ],
    minimumCompletionBar: "Relaunch_Ready",
    ambiguities: [
      {
        question: "What is the approved spend limit amount?",
        materiality: "material",
        requiresFounderApproval: true,
        resolvedBy: "founder",
        resolution: "Founder must state the spend limit.",
      },
      {
        question: "Which channel is the primary relaunch surface?",
        materiality: "material",
        requiresFounderApproval: true,
        resolvedBy: "founder",
        resolution: "Founder must name the primary channel.",
      },
    ],
  };
  const rawRequirements = [
    {
      requirementKey: "req_01",
      title: "Baseline captured",
      mustBeTrue: "Current launch messaging baseline is documented.",
      priority: "required",
      scope: "baseline",
      dependsOnRequirementKeys: [],
      requiredResourceClasses: [],
      expectedOutput: "baseline doc",
    },
  ];

  const withoutGrant = interpretObjective({
    objectiveKey: "obj_t",
    requestId: "req_t",
    rawContract,
    rawRequirements,
    founderResolvedQuestions: [],
    at,
    spendGrantPresent: false,
  });
  assert.equal(withoutGrant.ok, true);
  if (!withoutGrant.ok) return;
  const unresolvedWithout = withoutGrant.contract.ambiguities.filter(
    (a) => a.materiality === "material" && a.requiresFounderApproval,
  );
  assert.equal(unresolvedWithout.length, 2);

  const withGrant = interpretObjective({
    objectiveKey: "obj_t",
    requestId: "req_t",
    rawContract,
    rawRequirements,
    founderResolvedQuestions: [],
    at,
    spendGrantPresent: true,
  });
  assert.equal(withGrant.ok, true);
  if (!withGrant.ok) return;
  const unresolvedWith = withGrant.contract.ambiguities.filter(
    (a) => a.materiality === "material" && a.requiresFounderApproval,
  );
  assert.equal(unresolvedWith.length, 1);
  assert.match(unresolvedWith[0]!.question, /channel/i);
  assert.ok(
    withGrant.notes.some((n) => /demoted .*spend-grant/i.test(n)),
    `expected demotion note, got ${withGrant.notes.join("; ")}`,
  );
});

test("E: serial path discloses spend bound; does not keyword-demote ambiguities", () => {
  const rawContract = {
    intent: "Diagnose launch messaging and produce a relaunch-ready message set.",
    levels: [
      {
        levelKey: "relaunch_ready",
        order: 1,
        label: "Relaunch ready",
        statement: "Relaunch messaging is ready.",
      },
    ],
    minimumCompletionBar: "relaunch_ready",
    ambiguities: [
      {
        question: "What is the approved spend limit amount?",
        materiality: "material",
        requiresFounderApproval: true,
        resolvedBy: "founder",
        resolution: "Founder must state the spend limit.",
      },
      {
        question: "Which channel is the primary relaunch surface?",
        materiality: "material",
        requiresFounderApproval: true,
        resolvedBy: "founder",
        resolution: "Founder must name the primary channel.",
      },
    ],
  };
  const result = interpretObjective({
    objectiveKey: "obj_serial_spend",
    requestId: "req_serial_spend",
    rawContract,
    rawRequirements: [
      {
        requirementKey: "req_01",
        title: "Baseline",
        mustBeTrue: "Baseline documented",
        priority: "required",
        scope: "baseline",
        dependsOnRequirementKeys: [],
        requiredResourceClasses: [],
        expectedOutput: "baseline",
      },
    ],
    founderResolvedQuestions: [],
    at,
    spendGrantPresent: true,
    spendLimitUsd: 25,
    serialManagerProtocol: true,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const unresolved = result.contract.ambiguities.filter(
    (a) => a.materiality === "material" && a.requiresFounderApproval,
  );
  assert.equal(unresolved.length, 2, "serial must not demote spend-meta by keyword");
  assert.ok(
    result.notes.some((n) => /serial spend bound disclosed.*USD 25/i.test(n)),
    result.notes.join("; "),
  );
  assert.ok(!result.notes.some((n) => /demoted/i.test(n)));
});

test("E: levelKey lowercase normalization keeps malformed keys invalid", () => {
  const ok = parseOutcomeContractProposal({
    intent: "Ship a relaunch-ready message.",
    levels: [
      {
        levelKey: "Diagnosis_Complete",
        order: 1,
        label: "Diagnosis",
        statement: "Diagnosis exists.",
      },
    ],
    minimumCompletionBar: "diagnosis_complete",
    ambiguities: [],
  });
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.value.levels[0]?.levelKey, "diagnosis_complete");
  assert.equal(ok.value.minimumCompletionBar, "diagnosis_complete");

  // Too short after lowercasing — pattern requires ≥2 chars.
  const tooShort = parseOutcomeContractProposal({
    intent: "Ship a relaunch-ready message.",
    levels: [
      {
        levelKey: "L",
        order: 1,
        label: "L",
        statement: "Invalid short key.",
      },
    ],
    minimumCompletionBar: "L",
    ambiguities: [],
  });
  assert.equal(tooShort.ok, false);

  const unknownBar = parseOutcomeContractProposal({
    intent: "Ship a relaunch-ready message.",
    levels: [
      {
        levelKey: "relaunch_ready",
        order: 1,
        label: "Ready",
        statement: "Ready.",
      },
    ],
    minimumCompletionBar: "not_a_declared_level",
    ambiguities: [],
  });
  assert.equal(unknownBar.ok, false);
});
