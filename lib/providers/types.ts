/**
 * §10 — Generic provider-adapter contracts.
 *
 * This file contains NO provider or scenario names.
 * Provider-specific code lives in sibling files.
 */

import type { MarketOffering } from "../market/discovery";
import type { ResourceNeed } from "../objective/resourceNeed";
import type { ResourceClass } from "../workforce/types";

/**
 * Normalised result returned by every provider adapter after a successful
 * external resource acquisition. `payload` is provider-specific but must be
 * derived from the actual provider response, never hardcoded.
 */
export type ExternalResourceEvidence = {
  label: string;
  text: string;
  url?: string;
  observedAt: number;
};

export type ExternalResourceResult = {
  offeringId: string;
  resourceClass: ResourceClass;
  payload: unknown;
  evidence: ExternalResourceEvidence[];
  retrievedAt: number;
  provenance: {
    providerId: string;
    serviceId: string;
    idempotencyKey: string;
  };
};

/**
 * A provider adapter knows how to shape a request for its provider and how to
 * normalise the raw provider response into a generic ExternalResourceResult.
 */
export type ProviderAdapter = {
  providerId: string;
  requestShape(input: {
    offering: MarketOffering;
    need: ResourceNeed;
  }): unknown;
  normalizeResponse(raw: unknown): ExternalResourceResult;
  /** Human-readable description of how to independently verify the result. */
  verificationStrategy: string;
};
