// The core operates on authority, stable effects and evidence, without quote semantics.
export type CoreWorkerContract = {
  objective: string;
  idempotencyScope: string;
  authorizedEffectKeys: string[];
  requiredVerifiedEffectKeys: string[];
  approvalVersion: number | null;
};
export function transition<S extends string>(
  current: S,
  next: S,
  allowed: Record<S, readonly S[]>,
): S {
  if (current === next) return current;
  if (!allowed[current]?.includes(next))
    throw new Error(`Invalid workflow transition: ${current} → ${next}`);
  return next;
}
export function authorizeEffect(
  contract: CoreWorkerContract,
  effect: { key: string; gated: boolean; approvalVersion: number | null },
) {
  if (!contract.authorizedEffectKeys.includes(effect.key))
    throw new Error("Effect is not authorized by the current contract");
  if (
    effect.gated &&
    (contract.approvalVersion === null ||
      contract.approvalVersion !== effect.approvalVersion)
  )
    throw new Error("Persisted approval for this decision is required");
}
export function verifyReceipt(
  expected: { key: string; endpointRef: string; payload: string },
  observed: { key: string; endpointRef: string; payload: string } | null,
) {
  if (
    !observed ||
    observed.key !== expected.key ||
    observed.endpointRef !== expected.endpointRef ||
    observed.payload !== expected.payload
  )
    throw new Error("Read-back does not match the intended effect");
}
export function assertComplete(
  contract: CoreWorkerContract,
  effects: { key: string; status: string }[],
) {
  if (
    !contract.requiredVerifiedEffectKeys.length ||
    contract.requiredVerifiedEffectKeys.some(
      (key) => !effects.some((e) => e.key === key && e.status === "verified"),
    )
  )
    throw new Error("Required effects still need independent verification");
}
