// Application-owned input coverage checks for worker diagnosis.
//
// Workers may list catalog refs and request a coverage check for an accepted
// input obligation. Only NOT_AVAILABLE results (persisted as application
// observations) can support a validated missing-input proposal. Lookup errors
// and invalid references never invent scarcity.

import {
  COMPANY_RECORDS,
  companyRecord,
  type CompanyRecord,
} from "./policy";
import type { InputObligation } from "./inputDiagnosis";
import type { EvidenceRecord, SourceProof } from "./types";

export type InputAvailabilityStatus =
  | "AVAILABLE"
  | "NOT_AVAILABLE"
  | "INVALID_REQUEST"
  | "ERROR";

export type CompanyInputCatalogEntry = {
  recordRef: string;
  label: string;
};

export type CompanyRecordLookupResult =
  | {
      status: "AVAILABLE";
      record: CompanyRecord;
    }
  | {
      status: "INVALID_REQUEST";
      recordRef: string;
      detail: string;
    };

export type InputAvailabilityResult = {
  status: InputAvailabilityStatus;
  inputCheckId: string;
  detail: string;
  /** Durable observation text; includes status token for validators. */
  evidenceText: string;
  label: string;
};

const PROOF_ORIGIN = "application_observation";
const NOT_AVAILABLE_TOKEN = "availability: NOT_AVAILABLE";
const INVALID_REQUEST_TOKEN = "availability: INVALID_REQUEST";
const AVAILABLE_TOKEN = "availability: AVAILABLE";

export function listCompanyInputCatalog(): CompanyInputCatalogEntry[] {
  return COMPANY_RECORDS.map((record) => ({
    recordRef: record.ref,
    label: record.label,
  }));
}

export function lookupCompanyRecord(
  recordRef: string,
): CompanyRecordLookupResult {
  const trimmed = (recordRef ?? "").trim();
  if (!trimmed) {
    return {
      status: "INVALID_REQUEST",
      recordRef: "",
      detail: "recordRef is required",
    };
  }
  const record = companyRecord(trimmed);
  if (!record) {
    return {
      status: "INVALID_REQUEST",
      recordRef: trimmed,
      detail: `Unknown company record ref "${trimmed}". Use list_available_company_inputs for governed refs.`,
    };
  }
  return { status: "AVAILABLE", record };
}

function usableOwnedEvidence(
  evidence: readonly EvidenceRecord[],
  sourceProofs: readonly SourceProof[],
  runId: string,
): boolean {
  if (sourceProofs.length === 0) return true;
  const ownedObs = evidence.filter(
    (item) =>
      item.runId === runId &&
      item.origin === PROOF_ORIGIN &&
      (item.sourceClass === "company_record" || item.sourceClass === "public_web") &&
      !isNotAvailableObservation(item) &&
      !isInvalidRequestObservation(item),
  );
  for (const proof of sourceProofs) {
    const matching = ownedObs.filter((item) => item.sourceClass === proof.sourceClass);
    const distinct = new Set(
      matching.map((item) => item.recordRef ?? item.url ?? item.id),
    );
    if (distinct.size < proof.minDistinctSources) return false;
    const usable = matching.filter((item) => {
      const text = (item.text ?? "").trim().toLowerCase();
      if (!text) return false;
      if (text.includes("not found") || text.includes("no such record")) return false;
      if (text.includes("empty") && text.length < 80) return false;
      if (text.includes("zero usable") || text.includes("no usable")) return false;
      if (text.includes(NOT_AVAILABLE_TOKEN.toLowerCase())) return false;
      return text.length >= 8;
    });
    if (usable.length < proof.minDistinctSources) return false;
  }
  return true;
}

export function isNotAvailableObservation(item: {
  text?: string;
  label?: string;
}): boolean {
  const text = (item.text ?? "").toLowerCase();
  const label = (item.label ?? "").toLowerCase();
  return (
    text.includes(NOT_AVAILABLE_TOKEN.toLowerCase()) ||
    label.includes("input_check:not_available")
  );
}

export function isInvalidRequestObservation(item: {
  text?: string;
  label?: string;
}): boolean {
  const text = (item.text ?? "").toLowerCase();
  const label = (item.label ?? "").toLowerCase();
  return (
    text.includes(INVALID_REQUEST_TOKEN.toLowerCase()) ||
    label.includes("input_check:invalid_request")
  );
}

export function checkInputAvailability(input: {
  inputCheckId: string;
  obligations: readonly InputObligation[];
  sourceProofs: readonly SourceProof[];
  controlledResourceClasses: readonly string[];
  evidence: readonly EvidenceRecord[];
  runId: string;
}): InputAvailabilityResult {
  const inputCheckId = (input.inputCheckId ?? "").trim();
  if (!inputCheckId) {
    return {
      status: "INVALID_REQUEST",
      inputCheckId: "",
      detail: "inputCheckId is required",
      evidenceText: `${INVALID_REQUEST_TOKEN}. inputCheckId is required.`,
      label: "input_check:INVALID_REQUEST",
    };
  }

  const obligation = resolveCheckObligation(inputCheckId, input.obligations);
  if (!obligation) {
    const detail = `inputCheckId "${inputCheckId}" is not an accepted obligation for this Requirement`;
    return {
      status: "INVALID_REQUEST",
      inputCheckId,
      detail,
      evidenceText: `${INVALID_REQUEST_TOKEN}. ${detail}. Accepted ids: ${input.obligations
        .map((o) => o.inputCheckId)
        .join(", ") || "(none)"}.`,
      label: "input_check:INVALID_REQUEST",
    };
  }

  if (obligation.kind === "required_resource_class" && obligation.resourceClass) {
    const owned = input.controlledResourceClasses.includes(obligation.resourceClass);
    if (owned) {
      const detail = `controlled inventory includes ${obligation.resourceClass}`;
      return {
        status: "AVAILABLE",
        inputCheckId: obligation.inputCheckId,
        detail,
        evidenceText: `${AVAILABLE_TOKEN}. ${detail}.`,
        label: "input_check:AVAILABLE",
      };
    }
    const detail = `required class ${obligation.resourceClass} is not company-controlled`;
    return {
      status: "NOT_AVAILABLE",
      inputCheckId: obligation.inputCheckId,
      detail,
      evidenceText: `${NOT_AVAILABLE_TOKEN}. ${detail}. zero usable owned sources for this obligation.`,
      label: "input_check:NOT_AVAILABLE",
    };
  }

  const covered = usableOwnedEvidence(
    input.evidence,
    input.sourceProofs,
    input.runId,
  );
  if (covered) {
    const detail = "owned/accepted evidence already covers work-contract proofs";
    return {
      status: "AVAILABLE",
      inputCheckId: obligation.inputCheckId,
      detail,
      evidenceText: `${AVAILABLE_TOKEN}. ${detail}.`,
      label: "input_check:AVAILABLE",
    };
  }

  const catalog = listCompanyInputCatalog()
    .map((e) => e.recordRef)
    .join(", ");
  const detail =
    "required evidence is not available from owned observations for this obligation";
  return {
    status: "NOT_AVAILABLE",
    inputCheckId: obligation.inputCheckId,
    detail,
    evidenceText: `${NOT_AVAILABLE_TOKEN}. ${detail}. zero usable owned sources for obligation ${obligation.inputCheckId}. Catalog refs (read via read_company_record): ${catalog || "(none)"}.`,
    label: "input_check:NOT_AVAILABLE",
  };
}

function resolveCheckObligation(
  inputCheckId: string,
  obligations: readonly InputObligation[],
): InputObligation | null {
  const exact = obligations.find((o) => o.inputCheckId === inputCheckId);
  if (exact) return exact;
  if (
    inputCheckId === "evidence_sufficiency" ||
    inputCheckId.startsWith("evidence_")
  ) {
    return obligations.find((o) => o.kind === "evidence_sufficiency") ?? null;
  }
  if (inputCheckId.startsWith("req_class:")) {
    const cls = inputCheckId.slice("req_class:".length);
    return (
      obligations.find(
        (o) => o.kind === "required_resource_class" && o.resourceClass === cls,
      ) ?? null
    );
  }
  return null;
}

export function formatAvailabilityToolResult(result: InputAvailabilityResult): string {
  return JSON.stringify({
    status: result.status,
    inputCheckId: result.inputCheckId,
    detail: result.detail,
  });
}
