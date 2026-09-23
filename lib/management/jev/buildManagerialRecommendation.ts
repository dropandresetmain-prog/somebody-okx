/**
 * Application-owned bridge: validated Jev selection → ManagerialRecommendation.
 *
 * Jev only supplies a selected optionId (plus diagnostic probabilities).
 * This module binds identity, derives strongestAlternativeId from those
 * probabilities, and writes a factual decision receipt from GroundedOption
 * data the application already owns. It does not invent option IDs, does not
 * claim Jev reasoning, and does not grant authority — the existing
 * parseManagerialRecommendation + reauthorizeRecommendation path remains the
 * only authority seam.
 */
import type { EconomicFacts, FactValue, GroundedOption, ManagerialRecommendation } from "../types";

/** Successful Jev selection shape — already validated by validateJevSelection. */
export type JevValidatedSelection = {
  optionId: string;
  /** Diagnostic only. Keys should be eligible option IDs when present. */
  probabilities: Record<string, number>;
  confidence: number | null;
};

export type JevRecommendationBridgeInput = {
  requirementKey: string;
  contractRevision: number;
  /** Already-eligible grounded options for this requirement/revision. */
  eligible: readonly GroundedOption[];
  /** Successful Jev selection only — failures must not reach this bridge. */
  selection: JevValidatedSelection;
};

export type JevRecommendationBridgeFailureReason =
  | "no_eligible_options"
  | "inconsistent_option_identity"
  | "duplicate_option_id"
  | "selected_option_absent"
  | "requirement_key_mismatch"
  | "contract_revision_mismatch";

export type JevRecommendationBridgeResult =
  | { ok: true; recommendation: ManagerialRecommendation }
  | {
      ok: false;
      reason: JevRecommendationBridgeFailureReason;
      detail: string;
    };

const RATIONALE_LIMIT = 1200;

/**
 * Convert a validated Jev selection into a ManagerialRecommendation-shaped
 * proposal using only application-owned facts. Fail closed on identity drift.
 */
export function buildJevManagerialRecommendation(
  input: JevRecommendationBridgeInput,
): JevRecommendationBridgeResult {
  const { requirementKey, contractRevision, eligible, selection } = input;

  if (eligible.length === 0) {
    return {
      ok: false,
      reason: "no_eligible_options",
      detail: "bridge requires at least one eligible grounded option",
    };
  }

  const seenIds = new Set<string>();
  for (const option of eligible) {
    if (seenIds.has(option.optionId)) {
      return {
        ok: false,
        reason: "duplicate_option_id",
        detail: `duplicate optionId ${option.optionId} in eligible set`,
      };
    }
    seenIds.add(option.optionId);

    if (option.requirementKey !== requirementKey) {
      return {
        ok: false,
        reason: "requirement_key_mismatch",
        detail: `option ${option.optionId} targets ${option.requirementKey}, expected ${requirementKey}`,
      };
    }
    if (option.contractRevision !== contractRevision) {
      return {
        ok: false,
        reason: "contract_revision_mismatch",
        detail: `option ${option.optionId} targets revision ${option.contractRevision}, expected ${contractRevision}`,
      };
    }
  }

  const selectedId = selection.optionId;
  if (typeof selectedId !== "string" || !selectedId || !seenIds.has(selectedId)) {
    return {
      ok: false,
      reason: "selected_option_absent",
      detail: `selected option ${JSON.stringify(selectedId)} is not in the supplied eligible set`,
    };
  }

  const selected = eligible.find((option) => option.optionId === selectedId)!;
  // Defense in depth: re-check selected option identity even though the set passed.
  if (selected.requirementKey !== requirementKey || selected.contractRevision !== contractRevision) {
    return {
      ok: false,
      reason: "inconsistent_option_identity",
      detail: `selected option ${selectedId} identity does not match bridge requirement/revision`,
    };
  }

  const strongestAlternativeId = deriveStrongestAlternativeId(
    eligible,
    selectedId,
    selection.probabilities,
  );
  const alternative =
    strongestAlternativeId === null
      ? null
      : (eligible.find((option) => option.optionId === strongestAlternativeId) ?? null);

  const recommendation: ManagerialRecommendation = {
    requirementKey,
    contractRevision,
    selectedOptionId: selectedId,
    strongestAlternativeId,
    rationale: buildFactualDecisionReceipt({
      selected,
      alternative,
      eligibleCount: eligible.length,
    }),
    materialAssumptions: [],
    changeMyMindEvidence: [],
  };

  return { ok: true, recommendation };
}

/**
 * Highest-probability remaining eligible option; exact ties broken by stable
 * optionId ascending order. Unrecognized probability keys are ignored.
 * Returns null when no usable alternative probability exists.
 */
export function deriveStrongestAlternativeId(
  eligible: readonly GroundedOption[],
  selectedOptionId: string,
  probabilities: Record<string, number>,
): string | null {
  const eligibleIds = new Set(eligible.map((option) => option.optionId));
  let bestId: string | null = null;
  let bestProb = -Infinity;

  for (const [id, value] of Object.entries(probabilities)) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (!eligibleIds.has(id)) continue;
    if (id === selectedOptionId) continue;

    if (
      bestId === null ||
      value > bestProb ||
      (value === bestProb && id.localeCompare(bestId) < 0)
    ) {
      bestId = id;
      bestProb = value;
    }
  }

  return bestId;
}

function buildFactualDecisionReceipt(input: {
  selected: GroundedOption;
  alternative: GroundedOption | null;
  eligibleCount: number;
}): string {
  const lines = [
    `Jev selected ${input.selected.optionId} from ${input.eligibleCount} eligible grounded options.`,
    `Selected option facts: ${describeGroundedOptionFacts(input.selected)}.`,
  ];
  if (input.alternative) {
    lines.push(`Strongest alternative facts: ${describeGroundedOptionFacts(input.alternative)}.`);
  } else {
    lines.push("Strongest alternative facts: none.");
  }
  const receipt = lines.join(" ");
  if (receipt.length <= RATIONALE_LIMIT) return receipt;
  return `${receipt.slice(0, RATIONALE_LIMIT - 1)}…`;
}

function describeGroundedOptionFacts(option: GroundedOption): string {
  const parts: string[] = [
    `optionId=${option.optionId}`,
    `strategy=${option.strategy}`,
    `kind=${option.kind}`,
  ];

  if (option.internal) {
    const caps = option.internal.capabilityKeys.length
      ? option.internal.capabilityKeys.join(",")
      : "none";
    const worker =
      option.internal.workerKey !== null
        ? `reuse:${option.internal.workerKey}`
        : "create";
    parts.push(`capabilities=${caps}`);
    parts.push(`worker=${worker}`);
    if (option.internal.staffingReason) {
      parts.push(`staffing=${option.internal.staffingReason}`);
    }
  }

  if (option.external) {
    parts.push(`offeringId=${formatNullable(option.external.offeringId)}`);
    parts.push(`providerId=${formatNullable(option.external.providerId)}`);
    parts.push(`serviceId=${formatNullable(option.external.serviceId)}`);
    parts.push(`resourceClass=${formatNullable(option.external.resourceClass)}`);
    parts.push(
      option.external.priceUsd === null
        ? "quotedPrice=unknown"
        : `quotedPrice=${option.external.priceUsd}usd(provenance=${option.external.priceSource})`,
    );
  }

  appendFactParts(parts, option.facts);
  return parts.join("; ");
}

function appendFactParts(parts: string[], facts: EconomicFacts): void {
  // Stable field order so identical inputs yield identical receipts.
  appendFact(parts, "expectedQuality", facts.expectedQuality);
  appendFact(parts, "setupMinutes", facts.setupMinutes);
  appendFact(parts, "queueMinutes", facts.queueMinutes);
  appendFact(parts, "executionMinutes", facts.executionMinutes);
  appendFact(parts, "verificationMinutes", facts.verificationMinutes);
  appendFact(parts, "internalCostUsd", facts.internalCostUsd);
  appendFact(parts, "externalPriceUsd", facts.externalPriceUsd);
  appendFact(parts, "reliability", facts.reliability);
  appendFact(parts, "availability", facts.availability);
  appendFact(parts, "reuseValue", facts.reuseValue);
  appendFact(parts, "externalAdvantage", facts.externalAdvantage);
}

function appendFact<T>(
  parts: string[],
  label: string,
  fact: FactValue<T> | null,
): void {
  if (fact === null) return; // omit unknown — never invent zeros or certainty
  parts.push(`${label}=${String(fact.value)}(provenance=${fact.provenance})`);
}

function formatNullable(value: string | null): string {
  return value === null ? "unknown" : value;
}
