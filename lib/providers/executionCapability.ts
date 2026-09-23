/**
 * Current composed external-execution capability.
 *
 * DATA about which provider/service pairs the running application can actually
 * fulfill through a configured boundary. Distinct from registry membership:
 * a verified registry offering is not automatically executable.
 *
 * Managerial control flow must not branch on brand names; it asks
 * `hasConfiguredExternalExecutionPath` only.
 */

import { getAdapter } from "./registry";
import {
  M3_PRODUCT_PROVIDER_ID,
  M3_PRODUCT_SERVICE_ID,
  M3_PRODUCT_FULFILLMENT_SCOPE,
  resolveSupportedPurposeKind,
} from "../payment/m3FounderNarrativeProduct";

export type ComposedExternalExecution = {
  providerId: string;
  serviceId: string;
  /** Physical boundary that can fulfill this service today. */
  boundary: "m3_local_testnet_merchant";
};

/**
 * Services the current local M3 TESTNET composition can purchase and normalize.
 * Expand this table only when a real composed path exists — not to make demos pass.
 */
export const COMPOSED_EXTERNAL_EXECUTION: readonly ComposedExternalExecution[] = [
  {
    providerId: M3_PRODUCT_PROVIDER_ID,
    serviceId: M3_PRODUCT_SERVICE_ID,
    boundary: "m3_local_testnet_merchant",
  },
];

/** True when a registered adapter AND a composed execution boundary exist. */
export function hasConfiguredExternalExecutionPath(input: {
  providerId: string;
  serviceId: string;
}): boolean {
  if (!input.providerId || !input.serviceId) return false;
  if (!getAdapter(input.providerId)) return false;
  return COMPOSED_EXTERNAL_EXECUTION.some(
    (row) =>
      row.providerId === input.providerId && row.serviceId === input.serviceId,
  );
}

/**
 * Product-owned purpose gate for composed services that declare one.
 * Returns true when the offering has no product-scope contract (this does not
 * invent scope for other providers), otherwise requires ALL of:
 * - an APPLICATION-VALIDATED requested scope kind (V7 review R4) — absent or
 *   unknown scope is incompatible (fail closed), never coerced to the
 *   product's only supported kind;
 * - that kind and the required resource class are inside the adapter's
 *   declared fulfillment scope;
 * - the descriptive purpose does not AFFIRMATIVELY claim something the
 *   product does not sell (prose can only refuse, never grant).
 */
export function externalOfferingAcceptsPurpose(input: {
  serviceId: string;
  purpose: string | null | undefined;
  /** The need's application-validated requested scope kind. */
  purposeKind?: string | null;
  resourceClass?: string | null;
}): boolean {
  if (input.serviceId !== M3_PRODUCT_SERVICE_ID) return true;
  const purposeKind =
    typeof input.purposeKind === "string" && input.purposeKind.trim()
      ? input.purposeKind.trim()
      : null;
  if (purposeKind === null) return false;
  if (
    !(M3_PRODUCT_FULFILLMENT_SCOPE.purposeKinds as readonly string[]).includes(purposeKind) ||
    !input.resourceClass ||
    !(M3_PRODUCT_FULFILLMENT_SCOPE.resourceClasses as readonly string[]).includes(input.resourceClass)
  ) {
    return false;
  }
  const resolved = resolveSupportedPurposeKind({
    resourceClass: input.resourceClass,
    productId: M3_PRODUCT_SERVICE_ID,
    serviceId: M3_PRODUCT_SERVICE_ID,
    offeringId: null,
    purpose: input.purpose ?? null,
    purposeKind,
    requestId: null,
  });
  return resolved.ok;
}
