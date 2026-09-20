// M6.1 serial manager–execution protocol discriminator and helpers.
//
// New objectives interpreted on this path get `management.executionProtocol =
// "m61_serial_v1"`. Absent/legacy keeps historical HYBRID + ceremony behavior
// readable. This module is deliberately small: no second orchestration layer.

export const M61_SERIAL_V1 = "m61_serial_v1" as const;

export type ExecutionProtocol = typeof M61_SERIAL_V1;

/** True when management blob opts into the serial MAKE/BUY loop. */
export function isSerialManagerProtocol(
  management: { executionProtocol?: string | null } | null | undefined,
): boolean {
  return management?.executionProtocol === M61_SERIAL_V1;
}

/**
 * Artifact mutation is required only when the assignment's proof obligations
 * demand a company artifact version — not merely because the capability
 * envelope grants `update_company_artifact`.
 */
export function assignmentRequiresArtifactMutation(input: {
  allowedToolPermissions: readonly string[];
  proofKinds?: readonly string[];
  serialProtocol: boolean;
}): boolean {
  if (!input.allowedToolPermissions.includes("update_company_artifact")) {
    return false;
  }
  if (!input.serialProtocol) {
    // Legacy: permission grant implies mutation obligation (historical path).
    return true;
  }
  const kinds = input.proofKinds ?? [];
  return kinds.includes("company_artifact_version");
}

/** Requirement proofs that are satisfied solely by a verified external result. */
export function isInputOnlyRequirement(proofKinds: readonly string[]): boolean {
  if (proofKinds.length === 0) return false;
  return proofKinds.every(
    (kind) =>
      kind === "verified_external_result" || kind === "verified_external_effect",
  );
}
