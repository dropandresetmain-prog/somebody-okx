/**
 * Jev gateway boundary — Vercel AI Gateway, `typesafe-ai/jev`.
 *
 * Isolated so tests can inject a double without a network call, matching the
 * existing structured-chat double convention in ../modelBoundary.ts. Reads
 * AI_GATEWAY_API_KEY from the environment via the `ai` package's default
 * gateway provider resolution — this module never reads, logs, or persists
 * the key itself.
 */
import { experimental_evaluate as evaluate } from "ai";

export const JEV_MODEL_ID = "typesafe-ai/jev";

type EvaluateArgs = Parameters<typeof evaluate>[0];
export type JevGatewayQuestion = EvaluateArgs["questions"][string];
export type JevGatewayResult = Awaited<ReturnType<typeof evaluate>>;

export type JevGatewayCall = (input: {
  state: Record<string, unknown>;
  questions: Record<string, JevGatewayQuestion>;
  abortSignal?: AbortSignal;
}) => Promise<JevGatewayResult>;

/** Live call. Tests inject a different `JevGatewayCall`, never this one. */
export const callJevGateway: JevGatewayCall = ({ state, questions, abortSignal }) =>
  evaluate({
    model: JEV_MODEL_ID,
    // `state` is application-built plain data (see stateBuilder.ts) — always
    // JSON-safe at runtime; the SDK's JSONObject type just isn't structurally
    // inferable from our GroundedOption-derived shape.
    state: state as EvaluateArgs["state"],
    questions,
    abortSignal,
  });
