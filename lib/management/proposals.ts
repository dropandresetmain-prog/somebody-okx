// Bounded parsing of untrusted LLM managerial output.
//
// Every model artifact the engine consumes passes through here FIRST. The rule
// is fail-closed-with-a-typed-result: a malformed proposal produces a refusal
// the manager can act on (ask, retry, escalate), never an exception that
// corrupts state and never a partial repair that invents structure the model
// did not supply.
//
// Nothing parsed here carries authority. Authority is granted only by
// lib/management/authorization.ts after a deterministic recheck.

import { isControlledCapabilityKey } from "../workforce/catalog";
import { isSatisfactionStrategy } from "./types";
import type {
  AmbiguityMateriality,
  ContractAmbiguity,
  ManagerialRecommendation,
  OutcomeLevel,
  RequirementPriority,
  SatisfactionStrategy,
} from "./types";

const LIMITS = {
  statement: 600,
  label: 120,
  key: 80,
  rationale: 1200,
  assumption: 400,
  list: 8,
  levels: 6,
  ambiguities: 6,
} as const;

const LEVEL_KEY_PATTERN = /^[a-z][a-z0-9_]{1,60}$/;

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function stringList(value: unknown, max: number, itemMax: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, itemMax))
    .filter(Boolean)
    .slice(0, max);
}

export type ParsedOutcomeContract = {
  intent: string;
  levels: OutcomeLevel[];
  minimumCompletionBar: string;
  ambiguities: ContractAmbiguity[];
};

export type ProposalParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

// Parse a model-proposed Outcome Contract. The minimum completion bar must be
// one of the proposed levels and at least one level must exist — a contract
// without a bar is exactly the false-completion hole M4 exists to close.
export function parseOutcomeContractProposal(raw: unknown): ProposalParseResult<ParsedOutcomeContract> {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null)
    return { ok: false, errors: ["contract proposal is not an object"] };
  const candidate = raw as Record<string, unknown>;

  const intent = text(candidate.intent, LIMITS.statement);
  if (!intent) errors.push("contract proposal has no restated intent");

  const rawLevels = Array.isArray(candidate.levels) ? candidate.levels : [];
  if (!rawLevels.length) errors.push("contract proposal declares no outcome levels");
  if (rawLevels.length > LIMITS.levels)
    errors.push(`too many outcome levels (max ${LIMITS.levels})`);

  const levels: OutcomeLevel[] = [];
  const seenKeys = new Set<string>();
  rawLevels.forEach((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      errors.push(`level ${index} is not an object`);
      return;
    }
    const item = entry as Record<string, unknown>;
    const levelKey = text(item.levelKey, LIMITS.key);
    if (!levelKey || !LEVEL_KEY_PATTERN.test(levelKey)) {
      errors.push(`level ${index} has no bounded levelKey`);
      return;
    }
    if (seenKeys.has(levelKey)) {
      errors.push(`duplicate levelKey ${levelKey}`);
      return;
    }
    seenKeys.add(levelKey);
    const statement = text(item.statement, LIMITS.statement);
    const label = text(item.label, LIMITS.label) ?? levelKey;
    if (!statement) errors.push(`level ${levelKey} has no statement`);
    levels.push({
      levelKey,
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index + 1,
      statement: statement ?? "",
      label,
    });
  });

  const bar = text(candidate.minimumCompletionBar, LIMITS.key);
  if (!bar) errors.push("contract proposal declares no minimum completion bar");
  else if (!seenKeys.has(bar)) errors.push(`minimum completion bar ${bar} is not one of the proposed levels`);

  const ambiguities: ContractAmbiguity[] = [];
  const rawAmbiguities = Array.isArray(candidate.ambiguities)
    ? candidate.ambiguities.slice(0, LIMITS.ambiguities)
    : [];
  rawAmbiguities.forEach((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      errors.push(`ambiguity ${index} is not an object`);
      return;
    }
    const item = entry as Record<string, unknown>;
    const question = text(item.question, LIMITS.statement);
    const resolution = text(item.resolution, LIMITS.statement);
    const materiality: AmbiguityMateriality =
      item.materiality === "material" ? "material" : "ordinary";
    if (!question || !resolution) {
      errors.push(`ambiguity ${index} needs both a question and a resolution`);
      return;
    }
    // Fail safe: material ambiguity ALWAYS requires founder approval, whatever
    // the model claimed. Ordinary ambiguity may be self-resolved.
    ambiguities.push({
      question,
      materiality,
      resolution,
      resolvedBy: materiality === "material" ? "founder" : "somebody",
      requiresFounderApproval: materiality === "material",
    });
  });

  if (errors.length) return { ok: false, errors };
  // Re-number orders deterministically by array position after validation.
  const ordered = levels.map((level, index) => ({ ...level, order: index + 1 }));
  return {
    ok: true,
    value: {
      intent: intent!,
      levels: ordered,
      minimumCompletionBar: bar!,
      ambiguities,
    },
  };
}

export type ParsedRequirementProposal = {
  requirementKey: string;
  priority: RequirementPriority;
  title: string;
  mustBeTrue: string;
  scope: string;
  dependsOnRequirementKeys: string[];
  requiredResourceClasses: string[];
  expectedOutput: string | null;
};

// Semantic requirement proposals. Proof specs are NOT model-authored: the
// application attaches governed proof methods when it maps a semantic
// requirement into an executable form (locked decision 5).
export function parseRequirementProposals(raw: unknown): ProposalParseResult<ParsedRequirementProposal[]> {
  if (!Array.isArray(raw)) return { ok: false, errors: ["requirement proposals are not an array"] };
  if (!raw.length) return { ok: false, errors: ["no requirements proposed" ] };
  if (raw.length > 12) return { ok: false, errors: ["too many requirements (max 12)"] };
  const errors: string[] = [];
  const out: ParsedRequirementProposal[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      errors.push(`requirement ${index} is not an object`);
      return;
    }
    const item = entry as Record<string, unknown>;
    const key = text(item.requirementKey, LIMITS.key);
    if (!key || !LEVEL_KEY_PATTERN.test(key)) {
      errors.push(`requirement ${index} has no bounded requirementKey`);
      return;
    }
    if (seen.has(key)) {
      errors.push(`duplicate requirementKey ${key}`);
      return;
    }
    seen.add(key);
    const mustBeTrue = text(item.mustBeTrue, LIMITS.statement);
    const title = text(item.title, LIMITS.label) ?? key;
    const scope = text(item.scope, LIMITS.statement) ?? mustBeTrue ?? "";
    if (!mustBeTrue) {
      errors.push(`requirement ${key} has no mustBeTrue statement`);
      return;
    }
    // Fail safe on priority: an unclear priority becomes REQUIRED, because
    // downgrading a gate to "supporting" is exactly the false-completion move.
    const priority: RequirementPriority = item.priority === "supporting" ? "supporting" : "required";
    const dependsOnRequirementKeys = [
      ...new Set(stringList(item.dependsOnRequirementKeys, 8, LIMITS.key)),
    ].filter((dep) => dep !== key);
    const requiredResourceClasses = [
      ...new Set(stringList(item.requiredResourceClasses, 8, LIMITS.key)),
    ];
    const expectedOutput = text(item.expectedOutput, LIMITS.statement);
    out.push({
      requirementKey: key,
      priority,
      title,
      mustBeTrue,
      scope,
      dependsOnRequirementKeys,
      requiredResourceClasses,
      expectedOutput,
    });
  });
  if (errors.length) return { ok: false, errors };
  const keys = new Set(out.map((requirement) => requirement.requirementKey));
  for (const requirement of out) {
    for (const dep of requirement.dependsOnRequirementKeys) {
      if (!keys.has(dep))
        errors.push(
          `requirement ${requirement.requirementKey} depends on unknown key ${dep}`,
        );
    }
  }
  if (errors.length) return { ok: false, errors };
  const hasRequired = out.some((requirement) => requirement.priority === "required");
  if (!hasRequired) return { ok: false, errors: ["proposals contain no required requirement; an objective needs at least one gate"] };
  return { ok: true, value: out };
}

// The strategy proposal the model may attach to a requirement BEFORE grounding.
// It names a semantic approach; it may not name prices, providers or authority.
export type ParsedStrategyProposal = {
  strategy: SatisfactionStrategy;
  desiredCapabilities: string[]; // ungoverned keys survive only as proposals
  needsExternalResourceClass: string | null;
  notes: string | null;
};

export function parseStrategyProposal(raw: unknown): ProposalParseResult<ParsedStrategyProposal> {
  if (typeof raw !== "object" || raw === null)
    return { ok: false, errors: ["strategy proposal is not an object"] };
  const candidate = raw as Record<string, unknown>;
  const strategy = text(candidate.strategy, 20)?.toUpperCase();
  if (!strategy || !isSatisfactionStrategy(strategy))
    return { ok: false, errors: [`unknown satisfaction strategy "${String(candidate.strategy ?? "")}"`] };
  return {
    ok: true,
    value: {
      strategy: strategy as SatisfactionStrategy,
      desiredCapabilities: stringList(candidate.desiredCapabilities, LIMITS.list, LIMITS.key),
      needsExternalResourceClass: text(candidate.needsExternalResourceClass, LIMITS.key),
      notes: text(candidate.notes, LIMITS.rationale),
    },
  };
}

// Parse the Stage-3 recommendation. The selected option must be one of the
// ELIGIBLE option ids the application supplied — the parser's job is to make
// "the model hallucinated an option" a typed refusal, not a crash or a spend.
export function parseManagerialRecommendation(
  raw: unknown,
  context: {
    requirementKey: string;
    contractRevision: number;
    eligibleOptionIds: readonly string[];
  },
): ProposalParseResult<ManagerialRecommendation> {
  if (typeof raw !== "object" || raw === null)
    return { ok: false, errors: ["recommendation is not an object"] };
  const candidate = raw as Record<string, unknown>;
  const errors: string[] = [];

  const requirementKey = text(candidate.requirementKey, LIMITS.key);
  if (requirementKey !== context.requirementKey)
    errors.push(`recommendation targets ${requirementKey ?? "(none)"}, expected ${context.requirementKey}`);

  const revision = Number(candidate.contractRevision);
  if (revision !== context.contractRevision)
    errors.push(`recommendation targets revision ${String(candidate.contractRevision)}, expected ${context.contractRevision}`);

  const eligible = new Set(context.eligibleOptionIds);
  const selected = text(candidate.selectedOptionId, LIMITS.key * 2);
  if (!selected) errors.push("recommendation names no selected option");
  else if (!eligible.has(selected))
    errors.push(`selected option ${selected} is not an eligible grounded option`);

  let alternative = text(candidate.strongestAlternativeId, LIMITS.key * 2);
  if (alternative && !eligible.has(alternative)) alternative = null; // discard, do not fail the whole rec

  const rationale = text(candidate.rationale, LIMITS.rationale);
  // An outage marker from the caller's safe-wrapper counts as "no rationale"
  // (typed refusal downstream), so a failed model call can never select an
  // option on an empty argument.
  const outage = typeof candidate.error === "string" ? candidate.error : null;
  if (!rationale && outage) errors.push(outage);
  else if (!rationale) errors.push("recommendation has no business rationale");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      requirementKey: context.requirementKey,
      contractRevision: context.contractRevision,
      selectedOptionId: selected!,
      strongestAlternativeId: alternative,
      rationale: rationale!,
      materialAssumptions: stringList(candidate.materialAssumptions, LIMITS.list, LIMITS.assumption),
      changeMyMindEvidence: stringList(candidate.changeMyMindEvidence, LIMITS.list, LIMITS.assumption),
    },
  };
}

// Semantic capability proposals are checked for governed-ness elsewhere
// (capability.ts). This helper only extracts candidate keys for reporting.
export function ungovernedCapabilityKeys(proposed: readonly string[]): string[] {
  return proposed.filter((key) => !isControlledCapabilityKey(key)).sort();
}
