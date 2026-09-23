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
 * Selection → ManagerialRecommendation bridging is application-owned
 * (`buildJevManagerialRecommendation`). This package still does NOT wire
 * into the live `recommend` seam (../decision.ts); production routing is
 * a later milestone.
 *
 * USAGE:
 * 1. Compute eligible GroundedOption[] the normal way (../options.ts).
 * 2. Call selectEligibleOption({ requirement, eligible }).
 * 3. On kind "selected", call buildJevManagerialRecommendation(...).
 * 4. Pass the proposal through parseManagerialRecommendation + authorization.
 * 5. Never invent a fallback selection here; the caller owns fallback policy.
 */
export { selectEligibleOption } from "./selectEligibleOption";
export { callJevGateway, JEV_MODEL_ID } from "./client";
export { buildOptionSelectionState, serializeJevEvalInput } from "./stateBuilder";
export { buildOptionChoiceQuestion, SELECTION_QUESTION_ID } from "./questionBuilder";
export { validateJevSelection } from "./validate";
export {
  buildJevManagerialRecommendation,
  deriveStrongestAlternativeId,
} from "./buildManagerialRecommendation";

export type { JevGatewayCall, JevGatewayQuestion, JevGatewayResult } from "./client";
export type {
  JevOptionSelectionInput,
  JevOptionSelectionResult,
  JevRequirementContext,
} from "./types";
export type {
  JevRecommendationBridgeFailureReason,
  JevRecommendationBridgeInput,
  JevRecommendationBridgeResult,
  JevValidatedSelection,
} from "./buildManagerialRecommendation";
