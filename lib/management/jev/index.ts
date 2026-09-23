/**
 * Jev option-selector — Public API Surface
 *
 * A narrow, transplantable adapter: given options the application has
 * already computed as eligible (Stage 1 hard eligibility), ask Jev
 * (typesafe-ai/jev, via Vercel AI Gateway) to choose ONE of the exact
 * supplied option IDs for semantic comparison. Jev never determines
 * eligibility, authorization, budget, spend, proof legality, or
 * stale-contract validity — those stay deterministic, upstream of this call.
 *
 * This module does NOT wire into the live `recommend` seam (../decision.ts)
 * and does NOT produce a `ManagerialRecommendation`. See selectEligibleOption
 * for the exact scope boundary.
 *
 * USAGE:
 * 1. Compute eligible GroundedOption[] the normal way (../options.ts).
 * 2. Call selectEligibleOption({ requirement, eligible }).
 * 3. Handle the typed result — never invent a fallback here; the caller owns
 *    fallback policy.
 */
export { selectEligibleOption } from "./selectEligibleOption";
export { callJevGateway, JEV_MODEL_ID } from "./client";
export { buildOptionSelectionState } from "./stateBuilder";
export { buildOptionChoiceQuestion, SELECTION_QUESTION_ID } from "./questionBuilder";
export { validateJevSelection } from "./validate";

export type { JevGatewayCall, JevGatewayQuestion, JevGatewayResult } from "./client";
export type {
  JevOptionSelectionInput,
  JevOptionSelectionResult,
  JevRequirementContext,
} from "./types";
