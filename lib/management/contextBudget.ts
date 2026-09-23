/**
 * Structure-aware context budgeting for management model payloads (M2 / F6).
 *
 * Rule: bound FIELDS and LIST LENGTHS before serialization, never the serialized
 * string. `JSON.stringify(x).slice(n)` cuts objects mid-token and can silently
 * remove the very option ids the model must choose from. Everything here returns
 * structurally complete, parseable JSON; every reduction is recorded in an
 * explicit `truncations` list so the model (and tests) can see it happened.
 *
 * Nothing here decides business truth — it only shapes untrusted display data.
 */

export type Truncations = string[];

const TRUNC_MARK = "…[truncated]";

/** Bound one string field; record the truncation by path. */
export function budgetText(
  value: unknown,
  max: number,
  path: string,
  truncations: Truncations,
): string {
  const text = typeof value === "string" ? value : value == null ? "" : String(value);
  if (text.length <= max) return text;
  truncations.push(path);
  return `${text.slice(0, Math.max(0, max - TRUNC_MARK.length))}${TRUNC_MARK}`;
}

/** Bound a list length; the omitted count is recorded. */
export function budgetList<T>(
  list: readonly T[] | null | undefined,
  max: number,
  path: string,
  truncations: Truncations,
): T[] {
  const items = Array.isArray(list) ? list : [];
  if (items.length <= max) return [...items];
  truncations.push(`${path}(omitted ${items.length - max})`);
  return items.slice(0, max);
}

type BoundLimits = { maxString: number; maxArray: number; maxKeys: number; maxDepth: number };
const DEFAULT_BOUND: BoundLimits = { maxString: 400, maxArray: 6, maxKeys: 24, maxDepth: 4 };

/**
 * Bound an arbitrary JSON-ish value into a smaller, structurally complete JSON
 * value. Strings are shortened with a visible marker, arrays/objects capped, and
 * depth-limited subtrees replaced by an explicit `{ "_truncated": true }` marker.
 * Truncated paths are recorded so nothing is dropped silently.
 */
export function boundJsonValue(
  value: unknown,
  path: string,
  truncations: Truncations,
  limits: Partial<BoundLimits> = {},
): unknown {
  const lim = { ...DEFAULT_BOUND, ...limits };
  const walk = (node: unknown, at: string, depth: number): unknown => {
    if (node === null || typeof node === "number" || typeof node === "boolean") return node;
    if (typeof node === "string") return budgetText(node, lim.maxString, at, truncations);
    if (node === undefined || typeof node === "function") return null;
    if (depth >= lim.maxDepth) {
      truncations.push(`${at}(depth)`);
      return { _truncated: true };
    }
    if (Array.isArray(node)) {
      const kept = node.slice(0, lim.maxArray).map((item, i) => walk(item, `${at}[${i}]`, depth + 1));
      if (node.length > lim.maxArray) {
        truncations.push(`${at}(omitted ${node.length - lim.maxArray})`);
      }
      return kept;
    }
    if (typeof node === "object") {
      const entries = Object.entries(node as Record<string, unknown>);
      const out: Record<string, unknown> = {};
      for (const [key, child] of entries.slice(0, lim.maxKeys)) {
        out[key] = walk(child, `${at}.${key}`, depth + 1);
      }
      if (entries.length > lim.maxKeys) {
        truncations.push(`${at}(omitted ${entries.length - lim.maxKeys} keys)`);
      }
      return out;
    }
    return null;
  };
  return walk(value, path, 0);
}

/**
 * Serialize a payload within `maxChars` as COMPLETE JSON. Critical keys are never
 * dropped; optional keys are cleared lowest-priority-first (`dropOrder`) until it
 * fits, each recorded under `truncations`. If critical content alone exceeds the
 * budget the caller is told (`fits:false`) instead of receiving a cut string.
 */
export function serializeWithinBudget(
  payload: Record<string, unknown>,
  maxChars: number,
  dropOrder: readonly string[],
  truncations: Truncations,
): { json: string; fits: boolean } {
  const build = (): string => JSON.stringify({ ...payload, truncations });
  let json = build();
  for (const key of dropOrder) {
    if (json.length <= maxChars) break;
    if (!(key in payload)) continue;
    const current = payload[key];
    payload[key] = Array.isArray(current) ? [] : null;
    truncations.push(`${key}(dropped to fit)`);
    json = build();
  }
  return { json, fits: json.length <= maxChars };
}

/** Critical lifecycle fields first, bulky prose last (also the drop order, reversed). */
const RESULT_PACKAGE_ORDER = [
  "semanticEvidenceGap",
  "finalReviewCritique",
  "provenanceEvidenceIds",
  "priorActionResult",
  "scopedVerifiedAcquisitions",
  "currentControlledArtifact",
  "latestAcceptedWorkerOutput",
  "latestWorkerDiagnostic",
] as const;
const RESULT_PACKAGE_DROP_ORDER = [
  "latestWorkerDiagnostic",
  "latestAcceptedWorkerOutput",
  "currentControlledArtifact",
  "scopedVerifiedAcquisitions",
] as const;
const TEXT_STEPS = [1500, 800, 400, 160, 60] as const;

/**
 * Bound the manager result package to a complete JSON object of at most
 * `maxChars`. Lifecycle state (gap, critique, evidence ids) is placed first and
 * survives every step; prose fields shrink, then the bulkiest optional sections
 * are dropped whole, each recorded under `truncations`.
 */
export function budgetManagerResultPackage(
  pkg: unknown,
  maxChars: number,
): { value: Record<string, unknown>; json: string } {
  const source =
    typeof pkg === "object" && pkg !== null ? (pkg as Record<string, unknown>) : {};
  for (const step of TEXT_STEPS) {
    const truncations: Truncations = [];
    const ordered: Record<string, unknown> = {};
    for (const key of RESULT_PACKAGE_ORDER) {
      if (key in source) ordered[key] = source[key];
    }
    for (const key of Object.keys(source)) if (!(key in ordered)) ordered[key] = source[key];
    const bounded = boundJsonValue(ordered, "managerResultPackage", truncations, {
      maxString: step,
      maxArray: 6,
      maxDepth: 5,
    }) as Record<string, unknown>;
    const { json, fits } = serializeWithinBudget(
      bounded,
      maxChars,
      step === TEXT_STEPS[TEXT_STEPS.length - 1] ? RESULT_PACKAGE_DROP_ORDER : [],
      truncations,
    );
    if (fits) return { value: { ...bounded, truncations }, json };
  }
  // Unreachable in practice (critical fields are tiny); fail safe to an empty
  // but explicit, still-valid object.
  const value = { truncations: ["managerResultPackage(dropped to fit)"] };
  return { value, json: JSON.stringify(value) };
}

/**
 * Bound option rows for the recommendation prompt. EVERY option id survives:
 * only optional per-option detail shrinks, and only in whole, recorded steps.
 */
export function budgetOptions<T extends { optionId: string }>(
  options: readonly T[],
  maxChars: number,
  truncations: Truncations,
): { json: string; optionIds: string[] } {
  const optionIds = options.map((option) => option.optionId);
  const shrink = (row: T, textMax: number, listMax: number): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "string") out[key] = budgetText(value, textMax, `options.${row.optionId}.${key}`, truncations);
      else if (Array.isArray(value))
        out[key] = budgetList(value, listMax, `options.${row.optionId}.${key}`, truncations).map((item) =>
          typeof item === "string" ? budgetText(item, textMax, `options.${row.optionId}.${key}[]`, truncations) : item,
        );
      else out[key] = value;
    }
    return out;
  };
  for (const [textMax, listMax] of [[300, 8], [120, 4], [60, 2]] as const) {
    const saved = truncations.length;
    const rows = options.map((row) => {
      const local = shrink(row, textMax, listMax);
      return local;
    });
    const json = JSON.stringify(rows);
    if (json.length <= maxChars || textMax === 60) {
      if (json.length > maxChars) {
        // Last resort: id-and-kind only. Ids are never dropped.
        truncations.push("options(detail dropped to fit)");
        return {
          json: JSON.stringify(
            options.map((row) => ({
              optionId: row.optionId,
              kind: (row as Record<string, unknown>).kind ?? null,
              strategy: (row as Record<string, unknown>).strategy ?? null,
              eligible: (row as Record<string, unknown>).eligible ?? null,
            })),
          ),
          optionIds,
        };
      }
      return { json, optionIds };
    }
    truncations.length = saved; // discard this step's marks; retry tighter
  }
  return { json: "[]", optionIds };
}
