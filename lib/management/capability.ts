// Dynamic semantic capability definition under governance.
//
// Somebody may invent a new SEMANTIC capability (e.g.
// "competitor_pricing_analysis") at runtime, but only as a composition of
// primitives that already exist under application governance. A missing
// primitive/resource/authority is returned as a typed blocker — the caller
// persists it as a capability gap or escalates — never as an exception and
// never as a silently granted tool.
//
// Dynamic capability ≠ dynamic authority. This module is the proof of that
// line: it can name anything, and it can compose only what the catalog holds.

import {
  isControlledToolPermissionId,
  getToolPermission,
} from "../workforce/catalog";
import { KNOWN_RESOURCE_CLASSES } from "../sourcing/policy";
import type { CapabilitySpec, CapabilitySpecValidation } from "./types";

const knownResourceClasses = new Set<string>(KNOWN_RESOURCE_CLASSES);

// Primitives that may NEVER be composed into a dynamic capability, even though
// they exist in the catalog. authorize_external_spend is the reserved rail
// permission; a model-authored CapabilitySpec can only ever describe ordinary
// bounded work.
const RESERVED_PRIMITIVES: readonly string[] = ["authorize_external_spend"];

const MAX_NAME = 160;
const MAX_RESPONSIBILITY = 800;
const MAX_PRIMITIVES = 12;
const MAX_RESOURCES = 12;

// Bounded identifier: snake_case-ish semantic keys only. Rejects prose, URLs,
// and anything that could be smuggled as an instruction into a worker prompt.
const KEY_PATTERN = /^[a-z][a-z0-9_]{1,79}$/;

export function validateCapabilitySpec(proposed: unknown): CapabilitySpecValidation {
  if (typeof proposed !== "object" || proposed === null)
    return malformed(["capability proposal must be a structured object"]);
  const candidate = proposed as Record<string, unknown>;

  const key = typeof candidate.key === "string" ? candidate.key.trim() : "";
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  const responsibility =
    typeof candidate.responsibility === "string" ? candidate.responsibility.trim() : "";
  const requiredResources = toStringList(candidate.requiredResources).slice(0, MAX_RESOURCES);
  const primitives = toStringList(candidate.primitives).slice(0, MAX_PRIMITIVES);

  const structural: string[] = [];
  if (!KEY_PATTERN.test(key)) structural.push(`capability key "${key.slice(0, 40)}" is not a bounded identifier`);
  if (!name || name.length > MAX_NAME) structural.push("capability name must be 1..160 chars");
  if (!responsibility || responsibility.length > MAX_RESPONSIBILITY)
    structural.push(`capability responsibility must be 1..${MAX_RESPONSIBILITY} chars`);
  if (primitives.length === 0) structural.push("capability must compose at least one governed primitive");
  if (structural.length)
    return malformed(structural);

  // Composition validation: every primitive must exist in the governed catalog
  // and must not be reserved authority.
  const missingPrimitives: string[] = [];
  for (const primitive of primitives) {
    if (!isControlledToolPermissionId(primitive)) missingPrimitives.push(primitive);
    else if (RESERVED_PRIMITIVES.includes(primitive)) missingPrimitives.push(`${primitive} (reserved authority)`);
    else if (getToolPermission(primitive)?.externalAuthority)
      missingPrimitives.push(`${primitive} (external authority)`);
  }

  const missingResources: string[] = [];
  for (const resource of requiredResources)
    if (!knownResourceClasses.has(resource)) missingResources.push(resource);

  if (missingPrimitives.length || missingResources.length) {
    const parts: string[] = [];
    if (missingPrimitives.length)
      parts.push(
        `no governed tool/integration exists for: ${missingPrimitives.join(", ")} — requires governed application onboarding/authorization`,
      );
    if (missingResources.length)
      parts.push(`unknown resource classes: ${missingResources.join(", ")}`);
    return blocked(missingPrimitives, missingResources, parts.join("; "));
  }

  return {
    ok: true,
    governedKeys: [...primitives].sort(),
    spec: {
      key,
      name,
      responsibility,
      requiredResources: [...new Set(requiredResources)].sort(),
      primitives: [...new Set(primitives)].sort(),
    },
  };
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function blocked(
  missingPrimitives: string[],
  missingResources: string[],
  blocker: string,
): CapabilitySpecValidation {
  return { ok: false, missingPrimitives, missingResources, blocker };
}

// A malformed proposal is bounded and refused; it is never repaired by guesswork.
function malformed(issues: string[]): CapabilitySpecValidation {
  return {
    ok: false,
    missingPrimitives: [],
    missingResources: [],
    blocker: `malformed capability proposal: ${issues.join("; ")}`,
  };
}
