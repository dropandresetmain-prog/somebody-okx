// External sourcing context — what an OUTSIDE provider could supply for the
// Requirement being decided, as opposed to what our own worker needs to run.
//
// Two axes that must not be conflated:
//   - Requirement.requiredResourceClasses: MAKE inputs (company_records,
//     public_web, llm_reasoning, …). They decide whether an internal worker can
//     execute. They are NEVER an external fulfillment class.
//   - ExternalSourcingContext: the resource class + governed purpose kind a
//     merchant would have to fulfil. Used ONLY for market discovery, external
//     compatibility and external option construction.
//
// Precedence (highest first):
//   1. validated_resource_need — an application-validated ResourceNeed for this
//      Requirement whose class is a genuine gap (not owned, not already
//      acquired). Its own validated requested scope wins; when it carries none,
//      the Objective policy may supply purpose only if that governed kind
//      applies to the need's class. The need never gains Objective-wide
//      purpose authority of its own.
//   2. objective_sourcing_policy — the Objective's application-owned purpose
//      policy (or the Requirement-local scope bound from it). The external
//      class is derived through the governed catalogue
//      (externalResourceClassesForPurposeKind), never from prose or a model.
//      The policy only AUTHORIZES a purpose; it never manufactures a gap: it
//      binds only when that derived class is an actual missing input of the
//      Requirement being decided (declared or application-validated, not
//      controlled, not already acquired). Otherwise an Objective-wide policy
//      would make a merchant compatible on unrelated Requirements.
//   3. none — no merchant may become compatible.
//
// This is READ / SELECTION context only. It grants no spend authority, no
// signing, no payment, no worker permission and never satisfies a Requirement;
// stage-4 reauthorization and founder approval still gate every effect.

import {
  externalResourceClassesForPurposeKind,
  isGovernedPurposeKind,
  purposeKindAppliesToClass,
  RESOURCE_CLASSES,
} from "../workforce/catalog";
import type { ResourceClass } from "../workforce/types";
import type { AuthorizedPurposePolicy } from "./types";

export type ExternalSourcingSource =
  | "validated_resource_need"
  | "objective_sourcing_policy";

export type ExternalSourcingContext = {
  resourceClass: ResourceClass;
  /** Governed PURPOSE_SCOPES kind, or null when the driving need has no scope. */
  purposeKind: string | null;
  source: ExternalSourcingSource;
  /** Set only when source === "validated_resource_need". */
  resourceNeedId: string | null;
  needDedupeKey: string | null;
  /** Bounded purpose text of the driving need (descriptive, never authority). */
  needPurpose: string | null;
};

export type ExternalSourcingNeedFact = {
  needId: string;
  resourceClass: string;
  purpose: string;
  validated?: boolean;
  dedupeKey?: string | null;
  requestedPurposeKind?: string | null;
  /** A scope was stored but did not validate: never re-scoped by policy. */
  requestedScopeRejected?: boolean;
};

export type DeriveExternalSourcingInput = {
  /** Open ResourceNeeds scoped to this Requirement; only validated ones bind. */
  openResourceNeeds: readonly ExternalSourcingNeedFact[];
  /** Classes the company controls now (a need for these is not a gap). */
  controlledResourceClasses: readonly string[];
  /** Classes already covered by verified scoped acquisitions for this Requirement. */
  scopedCoveredResourceClasses: readonly string[];
  /** Objective-owned policy (Objective.management.authorizedPurposePolicy). */
  objectivePolicy: AuthorizedPurposePolicy | null | undefined;
  /** Requirement-local scope bound from that same policy, when present. */
  requirementAuthorizedPurposeKinds?: readonly string[] | null;
  /**
   * MAKE-input classes of the Requirement being decided: Requirement-declared
   * plus application-validated ResourceNeed classes. The policy fallback binds
   * only when its derived external class is one of these and still missing.
   */
  requiredResourceClasses: readonly string[];
};

const knownClasses = new Set<string>(RESOURCE_CLASSES.map((r) => r.class));

/**
 * The single governed external class for a purpose kind, or null when the kind
 * is ungoverned, maps to no class, or maps to several with no deterministic
 * governed resolution.
 */
export function resolveExternalClassForPurposeKind(kind: string): ResourceClass | null {
  if (!isGovernedPurposeKind(kind)) return null;
  const classes = externalResourceClassesForPurposeKind(kind);
  return classes.length === 1 ? classes[0]! : null;
}

function objectivePurposeKind(input: DeriveExternalSourcingInput): string | null {
  // Requirement-local scope is only ever bound from the Objective policy
  // (bindAuthorizedPurposePolicy), so it is the same authority, narrower.
  const local = (input.requirementAuthorizedPurposeKinds ?? []).find((kind) =>
    isGovernedPurposeKind(kind),
  );
  if (local) return local;
  const policyKind = input.objectivePolicy?.purposeKind;
  return isGovernedPurposeKind(policyKind) ? policyKind : null;
}

export function deriveExternalSourcingContext(
  input: DeriveExternalSourcingInput,
): ExternalSourcingContext | null {
  const controlled = new Set(input.controlledResourceClasses.map((c) => c.toLowerCase()));
  const covered = new Set(input.scopedCoveredResourceClasses.map((c) => c.toLowerCase()));
  const policyKind = objectivePurposeKind(input);

  // 1. Validated ResourceNeed — specific factual evidence of a gap.
  const need = input.openResourceNeeds.find(
    (candidate) =>
      candidate.validated === true &&
      knownClasses.has(candidate.resourceClass) &&
      !controlled.has(candidate.resourceClass.toLowerCase()) &&
      !covered.has(candidate.resourceClass.toLowerCase()),
  );
  if (need) {
    const resourceClass = need.resourceClass as ResourceClass;
    const ownScope =
      typeof need.requestedPurposeKind === "string" &&
      isGovernedPurposeKind(need.requestedPurposeKind)
        ? need.requestedPurposeKind
        : null;
    // The need's own validated scope wins. A need with NO scope may borrow the
    // Objective policy's purpose when that governed kind applies to its class;
    // a need whose stored scope failed validation is never re-scoped.
    const purposeKind =
      ownScope ??
      (need.requestedScopeRejected !== true &&
      policyKind &&
      purposeKindAppliesToClass(policyKind, resourceClass)
        ? policyKind
        : null);
    return {
      resourceClass,
      purposeKind,
      source: "validated_resource_need",
      resourceNeedId: need.needId,
      needDedupeKey: need.dedupeKey ?? null,
      needPurpose: need.purpose,
    };
  }

  // 2. Objective-owned sourcing policy — class derived via the catalogue, and
  //    only when that class is an actual missing input of THIS Requirement.
  if (policyKind) {
    const resourceClass = resolveExternalClassForPurposeKind(policyKind);
    const required = new Set(input.requiredResourceClasses.map((c) => c.toLowerCase()));
    if (
      resourceClass &&
      required.has(resourceClass.toLowerCase()) &&
      !controlled.has(resourceClass.toLowerCase()) &&
      !covered.has(resourceClass.toLowerCase())
    ) {
      return {
        resourceClass,
        purposeKind: policyKind,
        source: "objective_sourcing_policy",
        resourceNeedId: null,
        needDedupeKey: null,
        needPurpose: null,
      };
    }
  }

  // 3. No governed external sourcing context: fail closed.
  return null;
}
