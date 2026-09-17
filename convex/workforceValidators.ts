// Convex validators for the controlled workforce vocabulary. String literals
// are validated against the catalog types so persisted plans cannot widen the
// controlled vocabulary.

import { v } from "convex/values";
import {
  CONTROLLED_CAPABILITIES,
  RESOURCE_CLASSES,
  TOOL_PERMISSIONS,
} from "../lib/workforce/catalog";

function literals<T extends string>(values: readonly T[]) {
  return v.union(...values.map((value) => v.literal(value)));
}

export const vCapabilityKey = literals(
  CONTROLLED_CAPABILITIES.map((capability) => capability.key),
);
export const vResourceClass = literals(
  RESOURCE_CLASSES.map((resource) => resource.class),
);
export const vToolPermissionId = literals(
  TOOL_PERMISSIONS.map((permission) => permission.id),
);
