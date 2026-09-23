import { buildJevManagerialRecommendation } from "../buildManagerialRecommendation";
import { selectEligibleOption } from "../selectEligibleOption";
import type { JevGatewayCall } from "../client";
import {
  classifyFailure,
  compareToIncumbent,
  isConfidentlyWrong,
  probabilityMargin,
} from "./classify";
import type { EvalCase, JevRunRecord } from "./types";

function extractUsage(raw: unknown): {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  marketCostUsd: number | null;
} {
  if (typeof raw !== "object" || raw === null) {
    return { inputTokens: null, outputTokens: null, totalTokens: null, marketCostUsd: null };
  }
  const r = raw as Record<string, unknown>;
  const usage = r.usage as Record<string, unknown> | undefined;
  const inputTokens =
    typeof usage?.inputTokens === "number"
      ? usage.inputTokens
      : typeof usage?.promptTokens === "number"
        ? usage.promptTokens
        : null;
  const outputTokens =
    typeof usage?.outputTokens === "number"
      ? usage.outputTokens
      : typeof usage?.completionTokens === "number"
        ? usage.completionTokens
        : null;
  const totalTokens =
    typeof usage?.totalTokens === "number"
      ? usage.totalTokens
      : inputTokens !== null && outputTokens !== null
        ? inputTokens + outputTokens
        : null;
  const marketCostUsd =
    typeof r.marketCost === "number"
      ? r.marketCost
      : typeof (r.experimental_providerMetadata as Record<string, unknown>)?.marketCost ===
          "number"
        ? (r.experimental_providerMetadata as Record<string, number>).marketCost
        : null;
  return { inputTokens, outputTokens, totalTokens, marketCostUsd };
}

export async function runJevEvalCase(
  caseRow: EvalCase,
  deps: { callGateway?: JevGatewayCall; dryRun?: boolean } = {},
): Promise<{ record: JevRunRecord; rawGateway?: unknown }> {
  const t0 = Date.now();
  let rawGateway: unknown;
  const callGateway: JevGatewayCall | undefined = deps.dryRun
    ? undefined
    : deps.callGateway ??
      (async (input) => {
        const { callJevGateway } = await import("../client");
        const result = await callJevGateway(input);
        rawGateway = result;
        return result;
      });

  const selection = deps.dryRun
    ? ({
        kind: "unavailable" as const,
        failureClass: "provider_unavailable" as const,
        detail: "dry-run",
      })
    : await selectEligibleOption(
        { requirement: caseRow.requirement, eligible: caseRow.eligible },
        callGateway ? { callGateway } : {},
      );

  let bridgeOk = false;
  let bridgeReason: string | null = null;
  let jevOptionId: string | null = null;
  let probabilities: Record<string, number> = {};
  let confidence: number | null = null;

  if (selection.kind === "selected") {
    jevOptionId = selection.optionId;
    probabilities = selection.probabilities;
    confidence = selection.confidence;
    const bridged = buildJevManagerialRecommendation({
      requirementKey: caseRow.requirement.requirementKey,
      contractRevision: caseRow.contractRevision,
      eligible: caseRow.eligible,
      selection: {
        optionId: selection.optionId,
        probabilities: selection.probabilities,
        confidence: selection.confidence,
      },
    });
    bridgeOk = bridged.ok;
    bridgeReason = bridged.ok ? null : bridged.reason;
  }

  const { top, runnerUp, margin } = probabilityMargin(probabilities, jevOptionId);
  const expected = caseRow.reference.expectedOptionId;
  const matchesReference =
    expected === null
      ? null
      : jevOptionId !== null && jevOptionId === expected;

  const record: JevRunRecord = {
    caseId: caseRow.caseId,
    corpusSource: caseRow.corpusSource,
    caseShape: caseRow.caseShape,
    candidateCount: caseRow.eligible.length,
    candidateIds: caseRow.eligible.map((o) => o.optionId),
    factsSummary: caseRow.factsSummary,
    referenceKind: caseRow.reference.kind,
    expectedOptionId: expected,
    jevOptionId,
    jevKind: selection.kind,
    probabilities,
    confidence,
    topProbability: top,
    runnerUpProbability: runnerUp,
    margin,
    confidentlyWrong: false,
    matchesReference,
    bridgeOk,
    bridgeReason,
    incumbentOptionId: caseRow.incumbent?.selectedOptionId ?? null,
    incumbentComparison: compareToIncumbent(
      expected,
      jevOptionId,
      caseRow.incumbent?.selectedOptionId ?? null,
      caseRow.reference.kind,
    ),
    failureClass: null,
    latencyMs: Date.now() - t0,
    usage: { inputTokens: null, outputTokens: null, totalTokens: null },
    marketCostUsd: null,
    detail: selection.kind === "selected" ? null : selection.detail,
  };

  record.confidentlyWrong = isConfidentlyWrong(record);
  record.failureClass = classifyFailure(caseRow, record);

  const usage = extractUsage(rawGateway);
  record.usage = {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
  record.marketCostUsd = usage.marketCostUsd;

  return { record, rawGateway };
}
