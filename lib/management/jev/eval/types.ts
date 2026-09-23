import type { GroundedOption } from "../../types";
import type { JevRequirementContext } from "../types";

export type CorpusSource = "REAL" | "REAL_DERIVED_VARIANT";

export type CaseShape =
  | "ONE_CANDIDATE"
  | "MULTI_CANDIDATE_CLEAR"
  | "MULTI_CANDIDATE_AMBIGUOUS";

export type ReferenceLabelKind =
  | "DETERMINISTIC_DOMINANCE"
  | "ACCEPTED_RUNTIME_OUTCOME"
  | "HUMAN_REVIEW"
  | "AMBIGUOUS";

export type IncumbentComparison =
  | "both_correct"
  | "jev_only_correct"
  | "incumbent_only_correct"
  | "both_wrong"
  | "ambiguous_disagreement"
  | "agreement_without_independent_truth"
  | "no_incumbent";

export type FailureClass =
  | "STATE_SHAPING"
  | "MISSING_FACT"
  | "QUESTION_DESIGN"
  | "MODEL_LIMITATION"
  | "GROUND_TRUTH_AMBIGUOUS"
  | "DATA_QUALITY"
  | "OTHER";

export type EvalCase = {
  caseId: string;
  corpusSource: CorpusSource;
  provenance: string;
  caseShape: CaseShape;
  reference: {
    kind: ReferenceLabelKind;
    expectedOptionId: string | null;
    notes: string;
  };
  requirement: JevRequirementContext;
  contractRevision: number;
  eligible: GroundedOption[];
  incumbent?: {
    selectedOptionId: string;
    strategy: string | null;
    rationaleSnippet: string | null;
    source: string;
  };
  factsSummary: string;
};

export type JevRunRecord = {
  caseId: string;
  corpusSource: CorpusSource;
  caseShape: CaseShape;
  candidateCount: number;
  candidateIds: string[];
  factsSummary: string;
  referenceKind: ReferenceLabelKind;
  expectedOptionId: string | null;
  jevOptionId: string | null;
  jevKind: string;
  probabilities: Record<string, number>;
  confidence: number | null;
  topProbability: number | null;
  runnerUpProbability: number | null;
  margin: number | null;
  confidentlyWrong: boolean;
  matchesReference: boolean | null;
  bridgeOk: boolean;
  bridgeReason: string | null;
  incumbentOptionId: string | null;
  incumbentComparison: IncumbentComparison;
  failureClass: FailureClass | null;
  latencyMs: number;
  usage: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null };
  marketCostUsd: number | null;
  detail: string | null;
};

export type EvalSummary = {
  startingSha: string;
  branch: string;
  generatedAt: string;
  caseCounts: {
    total: number;
    real: number;
    realDerivedVariant: number;
    oneCandidate: number;
    multiClear: number;
    multiAmbiguous: number;
  };
  multiCandidateByReference: Record<
    string,
    { total: number; jevMatchesReference: number; confidentlyWrong: number }
  >;
  singleCandidateControl: { total: number; validSelection: number; bridgeOk: number };
  incumbentComparisons: Record<IncumbentComparison, number>;
  latencyMs: { median: number; p95: number; max: number };
  tokens: { input: number; output: number; total: number };
  marketCostUsd: number;
  failuresByClass: Record<string, number>;
  verdict: "PROCEED_TO_J4" | "MORE_EVIDENCE_REQUIRED" | "DO_NOT_ACTIVATE";
  j4RoutingNote: string;
};
