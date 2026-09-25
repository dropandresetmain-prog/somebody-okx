/**
 * Final-deliverable identity shared by assessment and bounded correction.
 *
 * This is not a new execution engine. It reuses the dependency-based resolver
 * already used by interpretation, but selects among current REQUIRED work:
 * optional supporting outputs cannot take ownership of the completion gate.
 * No titles, provider names, model-generated purpose labels, or array positions
 * confer authority. Proofs, budgets, approvals and acquisitions remain unchanged.
 */
import { isSerialInputRequirement } from "./executionProtocol";
import { resolvePurposePolicyTarget } from "./purposePolicyTarget";
import type { Assignment, Requirement } from "./types";

export type AssessmentArtifact = {
  key: string;
  version: number;
  content?: string;
};

export type FinalAssessmentTarget =
  | {
      ok: true;
      artifactKey: string;
      artifactVersion: number;
      requirementKey: string;
      minVersionRequired: number | null;
    }
  | { ok: false; reason: string };

/** Resolve the final required output FIRST, then that output's artifact proof. */
export function resolveGovernedAssessmentTarget(input: {
  requirements: readonly Requirement[];
  artifacts: readonly AssessmentArtifact[];
  contractRevision: number;
}): FinalAssessmentTarget {
  const current = input.requirements.filter(
    (req) => req.contractRevision === input.contractRevision && req.priority === "required" && req.state !== "superseded",
  );
  // Preserve the existing proof-based interpretation of legacy rows without a
  // requirementKind. Explicit input/deliverable kinds still take precedence.
  const normalized = current.map((requirement) => ({
    ...requirement,
    requirementKind: isSerialInputRequirement(requirement) ? ("input" as const) : ("deliverable" as const),
  }));
  if (new Set(normalized.map((req) => req.requirementKey)).size !== normalized.length) {
    return { ok: false, reason: "duplicate current required Requirement keys prevent final-target resolution" };
  }
  const resolved = resolvePurposePolicyTarget(normalized, "deliverable");
  if (!resolved.ok) {
    return {
      ok: false,
      reason: resolved.reason === "unbound"
        ? "no deliverable requirement for final assessment"
        : `ambiguous final deliverable requirements: ${resolved.terminalKeys.join(", ") || resolved.matchKeys.join(", ")}`,
    };
  }
  const requirement = resolved.target;
  // A waiver is not permission to pick some other output and silently assess
  // that instead. An Objective with a waived final output needs explicit handling.
  if (requirement.state === "waived") {
    return { ok: false, reason: "final deliverable is waived; no assessable required final output" };
  }

  const proofs = requirement.proofs.filter((proof) => proof.proofKind === "company_artifact_version");
  const keys = new Set<string>();
  let minVersionRequired: number | null = null;
  for (const proof of proofs) {
    const key = proof.params?.artifactKey;
    if (typeof key !== "string" || !key.trim()) {
      return { ok: false, reason: "final deliverable has an artifact proof without a governed artifactKey" };
    }
    keys.add(key.trim());
    const min = proof.params?.minVersion;
    if (min !== undefined && min !== null) {
      if (typeof min !== "number" || !Number.isSafeInteger(min) || min < 1) {
        return { ok: false, reason: "final deliverable has an invalid artifact minimum version" };
      }
      // Never allow a weaker duplicate proof to determine the assessment target.
      minVersionRequired = Math.max(minVersionRequired ?? min, min);
    }
  }
  if (keys.size > 1) {
    return { ok: false, reason: `ambiguous governed artifact targets on final deliverable: ${[...keys].join(", ")}` };
  }
  let artifactKey: string;
  if (keys.size === 1) {
    artifactKey = [...keys][0]!;
  } else {
    // Retain the historical sole-artifact fallback, but only AFTER the final
    // requirement is unambiguous. A shared artifact cannot disambiguate outputs.
    if (input.artifacts.length !== 1) {
      return {
        ok: false,
        reason: input.artifacts.length === 0
          ? "no company artifact present for assessment"
          : "no explicit governed artifact target and multiple company artifacts present",
      };
    }
    artifactKey = input.artifacts[0]!.key;
  }
  const matches = input.artifacts.filter((artifact) => artifact.key === artifactKey);
  if (matches.length !== 1) {
    return {
      ok: false,
      reason: matches.length === 0
        ? `governed artifact ${artifactKey} is not present on this Objective`
        : `duplicate governed artifact ${artifactKey} prevents exact assessment`,
    };
  }
  const artifact = matches[0]!;
  if (!artifact.key.trim() || !Number.isSafeInteger(artifact.version) || artifact.version < 1) {
    return { ok: false, reason: "governed artifact has an invalid key or version" };
  }
  return {
    ok: true,
    artifactKey: artifact.key,
    artifactVersion: artifact.version,
    requirementKey: requirement.requirementKey,
    minVersionRequired,
  };
}

/** Same contract revision alone never makes an assessment current. */
export function assessmentMatchesTarget(
  assessment: { contractRevision?: number; artifactKey?: string | null; artifactVersion?: number | null } | null | undefined,
  target: { contractRevision: number; artifactKey?: string | null; artifactVersion?: number | null },
): boolean {
  return assessment != null &&
    typeof target.artifactKey === "string" && target.artifactKey.trim().length > 0 &&
    typeof target.artifactVersion === "number" && Number.isSafeInteger(target.artifactVersion) && target.artifactVersion > 0 &&
    assessment.contractRevision === target.contractRevision &&
    assessment.artifactKey === target.artifactKey &&
    assessment.artifactVersion === target.artifactVersion;
}

export type FinalDeliverableCorrectionPlan =
  | {
      ok: true;
      reopenedRequirement: Requirement;
      assignmentIdsToSupersede: string[];
      decisionInputFingerprints: Record<string, string>;
    }
  | { ok: false; reason: string };

/**
 * Pure plan for one rejected final output. The caller applies it atomically in
 * its existing Convex mutation and retains its existing deduplicated wake.
 * Accepted prerequisite requirements, their proof-bearing assignments, all
 * acquisitions and every budget counter are deliberately outside this plan.
 */
export function buildFinalDeliverableCorrectionPlan(input: {
  requirements: readonly Requirement[];
  assignments: readonly Assignment[];
  artifacts: readonly AssessmentArtifact[];
  contractRevision: number;
  decisionInputFingerprints: Readonly<Record<string, string>>;
  at: number;
}): FinalDeliverableCorrectionPlan {
  const target = resolveGovernedAssessmentTarget(input);
  if (!target.ok) return target;
  const requirement = input.requirements.find(
    (req) => req.contractRevision === input.contractRevision && req.requirementKey === target.requirementKey,
  );
  if (!requirement || requirement.state !== "satisfied") {
    return { ok: false, reason: "final deliverable is not satisfied; cannot reopen it as an accepted delivery" };
  }
  const decisionInputFingerprints = { ...input.decisionInputFingerprints };
  delete decisionInputFingerprints[requirement.requirementKey];
  return {
    ok: true,
    reopenedRequirement: {
      ...requirement,
      state: "active",
      strategy: null,
      resolution: null,
      updatedAt: input.at,
    },
    assignmentIdsToSupersede: input.assignments
      .filter((assignment) => assignment.objectiveKey === requirement.objectiveKey &&
        assignment.requirementKey === requirement.requirementKey &&
        assignment.contractRevision === input.contractRevision &&
        (assignment.state === "verified" || assignment.state === "result_submitted"))
      .map((assignment) => assignment.assignmentId),
    decisionInputFingerprints,
  };
}
