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
 * Returns true when the offering has no product-scope contract, or when the
 * purpose is accepted. Does not invent scope for other providers.
 */
export function externalOfferingAcceptsPurpose(input: {
  serviceId: string;
  purpose: string | null | undefined;
}): boolean {
  if (input.serviceId !== M3_PRODUCT_SERVICE_ID) return true;
  const purpose = input.purpose?.trim() ?? "";
  if (!purpose) return true;
  const resolved = resolveSupportedPurposeKind({
    resourceClass: "proprietary_data",
    productId: M3_PRODUCT_SERVICE_ID,
    serviceId: M3_PRODUCT_SERVICE_ID,
    offeringId: null,
    purpose,
    purposeKind: null,
    requestId: null,
  });
  return resolved.ok;
}
