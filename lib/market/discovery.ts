import type { ResourceClass } from "../workforce/types";

/**
 * §4 — MarketOffering + MarketDiscovery interface.
 *
 * External market data is UNTRUSTED until validated by the registry + assessment.
 * Provider/scenario strings are forbidden in this file.
 */

export type OfferingPrice = {
  amount: string; // decimal string as returned by the source, e.g. "0.002"
  asset: string; // human asset symbol or address as returned
  unit: string; // e.g. "per_use"
};

export type MarketOffering = {
  offeringId: string; // stable id = `${providerId}:${serviceId}`
  providerId: string; // e.g. agent id
  serviceId: string;
  name: string;
  description: string;
  price: OfferingPrice | null;
  source: {
    kind: "okx_cli" | "okx_api" | "snapshot" | "controlled_testnet";
    retrievedAt: number;
    raw?: unknown;
  };
  compatibleResourceClasses: ResourceClass[]; // ONLY set after registry validation; else []
};

export type MarketDiscoveryInput = {
  resourceClass: ResourceClass;
  taskDescription: string; // e.g. "current privileged social intelligence about ..."
  limit?: number; // default 5, hard cap 10
};

export type MarketDiscovery = {
  discover(input: MarketDiscoveryInput): Promise<MarketOffering[]>;
};
