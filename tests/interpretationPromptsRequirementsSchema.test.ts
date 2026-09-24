import test from "node:test";
import assert from "node:assert/strict";
import {
  REQUIREMENTS_SCHEMA,
  normalizeRequirementsPayload,
  requirementsPrompt,
  requirementsRepairPrompt,
} from "../lib/management/interpretationPrompts";
import { validateRequirementsStructure } from "../lib/management/proposals";

const sampleRequirement = {
  requirementKey: "req_01",
  priority: "required" as const,
  title: "Sample",
  mustBeTrue: "Something is true",
  scope: "launch",
  dependsOnRequirementKeys: [] as string[],
  requiredResourceClasses: [] as string[],
  expectedOutput: null,
  requirementKind: "deliverable" as const,
};

test("REQUIREMENTS_SCHEMA has object root with requirements array", () => {
  assert.equal(REQUIREMENTS_SCHEMA.type, "object");
  assert.ok(
    (REQUIREMENTS_SCHEMA.required as readonly string[]).includes("requirements"),
  );
  const props = REQUIREMENTS_SCHEMA.properties as {
    requirements: { type: string; items: { type: string } };
  };
  assert.equal(props.requirements.type, "array");
  assert.equal(props.requirements.items.type, "object");
});

test("normalizeRequirementsPayload unwraps wrapped provider response", () => {
  const wrapped = { requirements: [sampleRequirement] };
  const normalized = normalizeRequirementsPayload(wrapped);
  assert.deepEqual(normalized, [sampleRequirement]);
  const validated = validateRequirementsStructure(normalized);
  assert.equal(validated.ok, true);
  assert.ok(Array.isArray(validated.value));
  assert.equal((validated.value as unknown[]).length, 1);
});

test("normalizeRequirementsPayload still accepts legacy bare array", () => {
  const bare = [sampleRequirement];
  assert.deepEqual(normalizeRequirementsPayload(bare), bare);
});

test("requirements repair prompt expects object wrapper shape", () => {
  const contract = {
    intent: "intent",
    levels: [{ levelKey: "minimum", statement: "s", label: "Minimum" }],
    minimumCompletionBar: "minimum",
  };
  const repair = requirementsRepairPrompt({
    request: "objective",
    contextBlock: "",
    contract,
    failure: "missing deliverable",
  });
  assert.match(repair.user, /\{"requirements":\[\.\.\.\]\}/);
  const base = requirementsPrompt({
    request: "objective",
    contextBlock: "",
    contract,
  });
  assert.match(base.user, /Shape: \{"requirements":\[/);
  assert.doesNotMatch(base.system, /JSON array only/);
});

test("wrapped repair payload normalizes for structural validation", () => {
  const repairPayload = {
    requirements: [
      sampleRequirement,
      {
        ...sampleRequirement,
        requirementKey: "req_02",
        requirementKind: "input" as const,
        dependsOnRequirementKeys: ["req_01"],
      },
    ],
  };
  const normalized = normalizeRequirementsPayload(repairPayload);
  const validated = validateRequirementsStructure(normalized);
  assert.equal(validated.ok, true);
  assert.equal((validated.value as unknown[]).length, 2);
});
