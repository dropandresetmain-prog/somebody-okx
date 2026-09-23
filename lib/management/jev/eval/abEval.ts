import type { JevQuestionRubric } from "../questionBuilder";
import { selectEligibleOption } from "../selectEligibleOption";
import { isConfidentlyWrong, probabilityMargin } from "./classify";
import type { EvalCase } from "./types";

export type AbRunRow = {
  caseId: string;
  provenance: string;
  corpusSource: EvalCase["corpusSource"];
  classification: string;
  candidateCount: number;
  correctedExpected: string | null;
  rubric: JevQuestionRubric;
  choice: string | null;
  kind: string;
  probabilities: Record<string, number>;
  topProbability: number | null;
  margin: number | null;
  matchesCorrected: boolean | null;
  confidentlyWrong: boolean;
  latencyMs: number;
  usage: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null };
  detail: string | null;
};

function extractUsage(raw: unknown): AbRunRow["usage"] {
  if (typeof raw !== "object" || raw === null) {
    return { inputTokens: null, outputTokens: null, totalTokens: null };
  }
  const usage = (raw as { usage?: Record<string, number> }).usage;
  const inputTokens = usage?.inputTokens ?? usage?.promptTokens ?? null;
  const outputTokens = usage?.outputTokens ?? usage?.completionTokens ?? null;
  const totalTokens =
    usage?.totalTokens ??
    (inputTokens != null && outputTokens != null ? inputTokens + outputTokens : null);
  return { inputTokens: inputTokens ?? null, outputTokens: outputTokens ?? null, totalTokens };
}

export async function runAbSelection(
  caseRow: EvalCase,
  rubric: JevQuestionRubric,
  correctedExpected: string | null,
): Promise<AbRunRow> {
  const t0 = Date.now();
  let rawGateway: unknown;
  const result = await selectEligibleOption(
    {
      requirement: caseRow.requirement,
      eligible: caseRow.eligible,
      questionRubric: rubric,
    },
    {
      callGateway: async (input) => {
        const { callJevGateway } = await import("../client");
        rawGateway = await callJevGateway(input);
        return rawGateway as Awaited<ReturnType<typeof import("../client").callJevGateway>>;
      },
    },
  );

  const choice = result.kind === "selected" ? result.optionId : null;
  const probs = result.kind === "selected" ? result.probabilities : {};
  const { top, margin } = probabilityMargin(probs, choice);
  const matchesCorrected =
    correctedExpected === null ? null : choice !== null && choice === correctedExpected;

  const row: AbRunRow = {
    caseId: caseRow.caseId,
    provenance: caseRow.provenance,
    corpusSource: caseRow.corpusSource,
    classification: caseRow.reference.kind,
    candidateCount: caseRow.eligible.length,
    correctedExpected,
    rubric,
    choice,
    kind: result.kind,
    probabilities: probs,
    topProbability: top,
    margin,
    matchesCorrected,
    confidentlyWrong: false,
    latencyMs: Date.now() - t0,
    usage: extractUsage(rawGateway),
    detail: result.kind === "selected" ? null : result.detail,
  };
  row.confidentlyWrong = isConfidentlyWrong({
    caseShape: caseRow.caseShape,
    matchesReference: matchesCorrected,
    topProbability: top,
    margin,
  });
  return row;
}
