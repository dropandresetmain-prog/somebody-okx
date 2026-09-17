import type { ResourceClass } from "../workforce/types";
import type { MarketOffering } from "./discovery";
import type { RegistryEntry } from "./registryData";

/**
 * §5 — Pure registry lookup.
 *
 * resolveCompatibleClasses looks up the offering's serviceId in the verified
 * registry and returns its declared ResourceClass[]. Returns [] when the
 * service is not verified.
 */
export function resolveCompatibleClasses(
  offering: { serviceId: string },
  registry: readonly RegistryEntry[],
): ResourceClass[] {
  const entry = registry.find((e) => e.serviceId === offering.serviceId);
  if (!entry || !entry.verified) return [];
  return [...entry.resourceClasses].sort();
}

/**
 * Attach registry-validated compatibleResourceClasses to an offering.
 */
export function withRegistryValidation(
  offering: MarketOffering,
  registry: readonly RegistryEntry[],
): MarketOffering {
  return {
    ...offering,
    compatibleResourceClasses: resolveCompatibleClasses(offering, registry),
  };
}
