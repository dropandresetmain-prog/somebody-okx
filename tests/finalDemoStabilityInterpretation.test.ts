/**
 * Regression tests for the final-demo stability interpretation patch
 * (commit d8da952): resolvePurposePolicyTarget (lib/management/purposePolicyTarget.ts),
 * its use by auditRequirementSemantics and bindAuthorizedPurposePolicy, the
 * company-context inventory disclosure (lib/management/interpretationContext.ts),
 * and the requirements prompts (lib/management/interpretationPrompts.ts).
 *
 * Covers the real live refusal on Objective obj_1790291536836_8jfgwe (model
 * GPT-6): a legitimate 3-deliverable decomposition
 * (launch_context, comparative_benchmark, founder_ready_launch_plan) that
 * pre-d8da952 code refused as purpose_policy_ambiguous because it counted
 * `requirementKind === "deliverable"` matches instead of resolving the unique
 * TERMINAL deliverable in the dependency graph.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { resolvePurposePolicyTarget } from "../lib/management/purposePolicyTarget";
import {
  interpretObjective,
  interpretOutcomeContract,
  interpretRequirements,
} from "../lib/management/interpretation";
import { auditRequirementSemantics } from "../lib/management/requirementSemanticAudit";
import { bindAuthorizedPurposePolicy } from "../lib/management/contract";
import { assignApplicationRequirementKeys } from "../lib/management/requirementIdentity";
import { parseRequirementProposals } from "../lib/management/proposals";
import {
  buildInterpretationCompanyContext,
  formatInterpretationContextBlock,
} from "../lib/management/interpretationContext";
import {
  requirementsPrompt,
  requirementsRepairPrompt,
} from "../lib/management/interpretationPrompts";
import { SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY } from "../lib/objective/seedData";
import type { AuthorizedPurposePolicy, Requirement, RequirementKind } from "../lib/management/types";

const AT = 1_700_000_000_000;

// ── shared fixtures ──────────────────────────────────────────────────────

// The real live-failure graph shape (Objective obj_1790291536836_8jfgwe,
// model GPT-6), reconstructed from the refusal detail since the raw graph was
// not persisted: three `deliverable` Requirements where the launch plan
// depends on the other two and is the only one nothing else depends on.
const GPT6_RAW_REQUIREMENTS = [
  {
    requirementKey: "launch_context",
    priority: "required" as const,
    title: "Launch context",
    mustBeTrue: "launch context is compiled",
    scope: "launch",
    dependsOnRequirementKeys: [] as string[],
    requiredResourceClasses: ["company_records", "public_web"],
    expectedOutput: "compiled launch context",
    requirementKind: "deliverable" as const,
  },
  {
    requirementKey: "comparative_benchmark",
    priority: "required" as const,
    title: "Comparative benchmark",
    mustBeTrue: "a comparative benchmark is available",
    scope: "launch",
    dependsOnRequirementKeys: [] as string[],
    requiredResourceClasses: ["proprietary_data"],
    expectedOutput: "benchmark",
    requirementKind: "deliverable" as const,
  },
  {
    requirementKey: "founder_ready_launch_plan",
    priority: "required" as const,
    title: "Founder-ready launch plan",
    mustBeTrue: "a founder-ready launch plan is saved",
    scope: "launch",
    dependsOnRequirementKeys: ["launch_context", "comparative_benchmark"],
    requiredResourceClasses: ["company_records", "public_web"],
    expectedOutput: "saved plan",
    requirementKind: "deliverable" as const,
  },
];

const GPT6_RAW_CONTRACT = {
  intent: "Prepare a founder-ready launch plan with external social intelligence",
  levels: [
    { levelKey: "context_ready", statement: "launch context is compiled", label: "Context" },
    { levelKey: "plan_ready", statement: "a founder-ready launch plan is saved", label: "Plan" },
  ],
  minimumCompletionBar: "plan_ready",
  ambiguities: [] as unknown[],
};

function buildGpt6Contract() {
  const c = interpretOutcomeContract({
    objectiveKey: "obj_1790291536836_8jfgwe",
    requestId: "req_gpt6",
    rawContract: GPT6_RAW_CONTRACT,
    founderResolvedQuestions: [],
    at: AT,
  });
  assert.equal(c.ok, true, "GPT-6 contract shape must build");
  if (!c.ok) throw new Error("unreachable");
  return c.contract;
}

type MiniReq = {
  requirementKey: string;
  requirementKind?: RequirementKind;
  dependsOnRequirementKeys?: readonly string[];
};

function req(key: string, kind: RequirementKind, deps: readonly string[] = []): MiniReq {
  return { requirementKey: key, requirementKind: kind, dependsOnRequirementKeys: deps };
}

// ── 1. resolver unit tests ──────────────────────────────────────────────

test("resolvePurposePolicyTarget: single match binds via unique_kind_match", () => {
  const result = resolvePurposePolicyTarget([req("only_one", "deliverable")], "deliverable");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.target.requirementKey, "only_one");
  assert.equal(result.via, "unique_kind_match");
});

test("resolvePurposePolicyTarget: GPT-6 3-deliverable shape resolves the unique terminal plan", () => {
  const graph = [
    req("launch_context", "deliverable"),
    req("comparative_benchmark", "deliverable"),
    req("founder_ready_launch_plan", "deliverable", [
      "launch_context",
      "comparative_benchmark",
    ]),
  ];
  const result = resolvePurposePolicyTarget(graph, "deliverable");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.target.requirementKey, "founder_ready_launch_plan");
  assert.equal(result.via, "unique_terminal_deliverable");
});

test("resolvePurposePolicyTarget: three parallel deliverables are ambiguous with 3 terminals", () => {
  const graph = [
    req("alpha", "deliverable"),
    req("beta", "deliverable"),
    req("gamma", "deliverable"),
  ];
  const result = resolvePurposePolicyTarget(graph, "deliverable");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "ambiguous");
  assert.deepEqual(result.terminalKeys.sort(), ["alpha", "beta", "gamma"]);
});

test("resolvePurposePolicyTarget: zero matches is unbound", () => {
  const result = resolvePurposePolicyTarget([req("only_input", "input")], "deliverable");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "unbound");
  assert.deepEqual(result.matchKeys, []);
});

test("resolvePurposePolicyTarget: two input matches with target input are ambiguous", () => {
  const graph = [
    req("input_one", "input"),
    req("input_two", "input"),
    req("plan", "deliverable", ["input_one", "input_two"]),
  ];
  const result = resolvePurposePolicyTarget(graph, "input");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "ambiguous");
  // Terminal collapsing is deliverable-only; input ambiguity never computes terminals.
  assert.deepEqual(result.terminalKeys, []);
  assert.deepEqual(result.matchKeys.sort(), ["input_one", "input_two"]);
});

test("resolvePurposePolicyTarget: a deliverable depended on by an input Requirement is not terminal", () => {
  const graph = [
    req("not_terminal_deliverable", "deliverable"),
    req("terminal_deliverable", "deliverable"),
    // An `input` Requirement depending on a deliverable still disqualifies it
    // from being terminal — terminal-ness is purely structural, not kind-based.
    req("gate_check", "input", ["not_terminal_deliverable"]),
  ];
  const result = resolvePurposePolicyTarget(graph, "deliverable");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.target.requirementKey, "terminal_deliverable");
  assert.equal(result.via, "unique_terminal_deliverable");
});

test("resolvePurposePolicyTarget with assignApplicationRequirementKeys(forceSequential): plan remaps to the terminal req_NN key", () => {
  const parsed = parseRequirementProposals(GPT6_RAW_REQUIREMENTS);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const keyed = assignApplicationRequirementKeys(parsed.value, { forceSequential: true });
  assert.deepEqual(
    keyed.map((k) => k.requirementKey),
    ["req_01", "req_02", "req_03"],
  );
  assert.deepEqual(keyed[2]?.dependsOnRequirementKeys, ["req_01", "req_02"]);
  const resolved = resolvePurposePolicyTarget(keyed, "deliverable");
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.target.requirementKey, "req_03");
});

// ── 2. interpretRequirements: GPT-6 shape + SUBMISSION policy → ok ───────

test("interpretRequirements: GPT-6 3-deliverable shape binds policy onto the terminal plan only", () => {
  const contract = buildGpt6Contract();
  const r = interpretRequirements({
    objectiveKey: "obj_1790291536836_8jfgwe",
    contract,
    rawRequirements: GPT6_RAW_REQUIREMENTS,
    at: AT,
    authorizedPurposePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;

  const byKey = new Map(r.requirements.map((x) => [x.requirementKey, x]));
  const plan = byKey.get("founder_ready_launch_plan");
  const context = byKey.get("launch_context");
  const benchmark = byKey.get("comparative_benchmark");
  assert.ok(plan && context && benchmark);

  // Only the terminal plan is authorized.
  assert.deepEqual(plan!.authorizedPurposeKinds, ["external_social_intelligence"]);
  assert.ok(!context!.authorizedPurposeKinds || context!.authorizedPurposeKinds.length === 0);
  assert.ok(!benchmark!.authorizedPurposeKinds || benchmark!.authorizedPurposeKinds.length === 0);

  // The policy carries no requiredResourceClasses of its own, so it must not
  // widen anyone's declared needs — comparative_benchmark keeps exactly its
  // declared proprietary_data need, and proprietary_data is not manufactured
  // onto the plan or launch_context.
  assert.deepEqual(benchmark!.requiredResourceClasses, ["proprietary_data"]);
  assert.ok(!plan!.requiredResourceClasses.includes("proprietary_data"));
  assert.ok(!context!.requiredResourceClasses.includes("proprietary_data"));
});

// ── 3. interpretRequirements: three parallel deliverables → ambiguous ───

test("interpretRequirements: three parallel deliverables fail closed as purpose_policy_ambiguous naming 3 terminals", () => {
  const contract = buildGpt6Contract();
  const rawReqs = [
    {
      requirementKey: "alpha_deliverable",
      priority: "required" as const,
      title: "Alpha",
      mustBeTrue: "alpha is true",
      scope: "launch",
      dependsOnRequirementKeys: [] as string[],
      requiredResourceClasses: [] as string[],
      expectedOutput: "alpha",
      requirementKind: "deliverable" as const,
    },
    {
      requirementKey: "beta_deliverable",
      priority: "required" as const,
      title: "Beta",
      mustBeTrue: "beta is true",
      scope: "launch",
      dependsOnRequirementKeys: [] as string[],
      requiredResourceClasses: [] as string[],
      expectedOutput: "beta",
      requirementKind: "deliverable" as const,
    },
    {
      requirementKey: "gamma_deliverable",
      priority: "required" as const,
      title: "Gamma",
      mustBeTrue: "gamma is true",
      scope: "launch",
      dependsOnRequirementKeys: [] as string[],
      requiredResourceClasses: [] as string[],
      expectedOutput: "gamma",
      requirementKind: "deliverable" as const,
    },
  ];
  const r = interpretRequirements({
    objectiveKey: "obj_x",
    contract,
    rawRequirements: rawReqs,
    at: AT,
    authorizedPurposePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.repairableSemanticFailure);
  assert.match(r.repairableSemanticFailure!, /purpose_policy_ambiguous/);
  assert.match(r.repairableSemanticFailure!, /alpha_deliverable/);
  assert.match(r.repairableSemanticFailure!, /beta_deliverable/);
  assert.match(r.repairableSemanticFailure!, /gamma_deliverable/);
  assert.match(r.repairableSemanticFailure!, /3 terminal deliverables/);
});

// ── 4. interpretObjective: full path on GPT-6 shape → ok ────────────────

test("interpretObjective: full contract+requirements path on the GPT-6 shape is ok", () => {
  const full = interpretObjective({
    objectiveKey: "obj_1790291536836_8jfgwe",
    requestId: "req_gpt6_full",
    rawContract: GPT6_RAW_CONTRACT,
    rawRequirements: GPT6_RAW_REQUIREMENTS,
    founderResolvedQuestions: [],
    at: AT,
    authorizedPurposePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
  });
  assert.equal(full.ok, true);
  if (!full.ok) return;
  const plan = full.requirements.find((x) => x.requirementKey === "founder_ready_launch_plan");
  assert.ok(plan);
  assert.deepEqual(plan!.authorizedPurposeKinds, ["external_social_intelligence"]);
});

// ── 5. Audit/binder agreement across graphs ──────────────────────────────

test("audit and binder agree: auditRequirementSemantics(...).ok iff bindAuthorizedPurposePolicy binds exactly one Requirement", () => {
  const graphs: MiniReq[][] = [
    [req("solo_deliverable", "deliverable")],
    [req("first_deliverable", "deliverable"), req("second_deliverable", "deliverable")],
    [
      req("first_deliverable", "deliverable"),
      req("second_deliverable", "deliverable"),
      req("third_deliverable", "deliverable", ["first_deliverable", "second_deliverable"]),
    ],
    [req("only_deliverable", "deliverable"), req("only_input", "input")],
    [],
    [req("input_one", "input"), req("input_two", "input")],
  ];

  for (const graph of graphs) {
    // Cast MiniReq[] up to a Requirement-shaped array for these two functions —
    // both only read requirementKey/requirementKind/dependsOnRequirementKeys.
    const requirements = graph as unknown as Requirement[];
    const audit = auditRequirementSemantics({
      requirements,
      authorizedPurposePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
    });
    const bound = bindAuthorizedPurposePolicy(requirements, SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY);
    const boundCount = bound.filter(
      (r) => Array.isArray((r as Requirement).authorizedPurposeKinds) && (r as Requirement).authorizedPurposeKinds!.length > 0,
    ).length;
    assert.equal(
      audit.ok,
      boundCount === 1,
      `graph [${graph.map((g) => g.requirementKey).join(",")}]: audit.ok=${audit.ok} but boundCount=${boundCount}`,
    );
  }
});

// ── 6. Company context: inventory disclosure + no-grant constraint ──────

test("buildInterpretationCompanyContext: SUBMISSION policy discloses proprietary_data as not owned", () => {
  const context = buildInterpretationCompanyContext({
    authorizedPurposePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
    spendGrantPresent: false,
  });
  assert.ok(context.notCurrentlyOwned.includes("proprietary_data"));
  assert.ok(!context.ownedResourceClasses.includes("proprietary_data"));

  const block = formatInterpretationContextBlock(context);
  const notOwnedLine = block
    .split("\n")
    .find((line) => line.startsWith("- Not currently owned"));
  assert.ok(notOwnedLine);
  assert.match(notOwnedLine!, /proprietary_data/);

  // No-grant constraint mentions later explicit founder approval and tells the
  // interpreter not to ask to pre-authorize hypothetical spend.
  assert.match(block, /founder for explicit approval/i);
  assert.match(
    block,
    /pre-authorize hypothetical spend/i,
  );

  // Must never leak scenario/provider identity or offering economics into the
  // interpreter-facing context — those live only in seed data / the market
  // layer, never in interpretation's WHAT-only prompt context.
  assert.ok(!block.includes("Guru"));
  assert.ok(!block.includes("$"));
  assert.ok(!block.includes("0.01"));
});

test("buildInterpretationCompanyContext: no policy → notCurrentlyOwned is empty", () => {
  const context = buildInterpretationCompanyContext({ spendGrantPresent: false });
  assert.deepEqual(context.notCurrentlyOwned, []);
});

test("buildInterpretationCompanyContext: an ungoverned purposeKind contributes nothing", () => {
  const ungoverned: AuthorizedPurposePolicy = {
    purposeKind: "not_a_governed_purpose_kind",
    targetRequirementKind: "deliverable",
  };
  const context = buildInterpretationCompanyContext({
    authorizedPurposePolicy: ungoverned,
    spendGrantPresent: false,
  });
  assert.deepEqual(context.notCurrentlyOwned, []);
  assert.equal(context.purposePolicyTargetKind, null);
});

// ── 7. Prompts ─────────────────────────────────────────────────────────

test("requirementsPrompt: drops the impossible exactly-ONE invariant, keeps TERMINAL guidance", () => {
  const { system } = requirementsPrompt({
    request: "r",
    contextBlock: "cb",
    contract: { intent: "i", levels: [], minimumCompletionBar: "lvl_a" },
  });
  assert.ok(!system.includes("exactly ONE Requirement of that kind"));
  assert.match(system, /TERMINAL/);
});

test("requirementsRepairPrompt: purpose_policy_ambiguous failure gets purpose-policy repair guidance; dependency_cycle does not", () => {
  const base = {
    request: "r",
    contextBlock: "cb",
    contract: { intent: "i", levels: [], minimumCompletionBar: "lvl_a" },
  };
  const ambiguousRepair = requirementsRepairPrompt({
    ...base,
    failure: "purpose_policy_ambiguous: authorized purpose policy targetRequirementKind=deliverable matched 3 Requirements",
  });
  assert.match(ambiguousRepair.user, /Purpose-policy repair:/);
  assert.match(ambiguousRepair.user, /keep every legitimate upstream/i);
  assert.match(ambiguousRepair.user, /Do not choose a provider/i);
  assert.match(ambiguousRepair.user, /strategy/i);

  const cycleRepair = requirementsRepairPrompt({
    ...base,
    failure: "dependency_cycle: a → b → a",
  });
  assert.ok(!cycleRepair.user.includes("Purpose-policy repair:"));
});
