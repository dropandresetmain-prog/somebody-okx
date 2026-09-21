// CompanyArtifact: generic owned mutable company state. The canonical launch
// page/message is only seeded DATA; this module provides the pure primitives
// for versioning, history and completion gating (M2 §3).

export type CompanyArtifactVersion = {
  version: number; // monotonic per key, starts at 1
  content: string; // ≤ 8000 chars
  changedByRunId: string;
  changedAt: number;
  changeNote: string; // ≤ 500 chars, why this version differs
  // M6.1 causal provenance: the verified external acquisition evidence ids this
  // revision actually used, validated by the application before persistence.
  // Absent for versions created before any acquisition existed.
  usedAcquisitionEvidenceIds?: string[];
};

export type CompanyArtifact = {
  key: string; // stable artifact identity within an objective/company
  objectiveKey: string;
  label: string; // ≤ 120
  content: string; // current content, ≤ 8000
  version: number; // current version number
  updatedAt: number;
  provenanceRunId: string | null;
  history: CompanyArtifactVersion[]; // append-only, newest last
};

export const MAX_CONTENT_CHARS = 8000;
const MAX_CHANGE_NOTE_CHARS = 500;
const MAX_LABEL_CHARS = 120;

export function createArtifact(input: {
  key: string;
  objectiveKey: string;
  label: string;
  content: string;
  runId: string;
  at: number;
}): CompanyArtifact {
  const key = input.key.trim();
  if (!key) throw new Error("createArtifact requires a non-empty key");
  const objectiveKey = input.objectiveKey.trim();
  if (!objectiveKey) throw new Error("createArtifact requires a non-empty objectiveKey");
  const label = input.label;
  if (label.length > MAX_LABEL_CHARS)
    throw new Error(`createArtifact label exceeds ${MAX_LABEL_CHARS} chars`);
  if (!label.trim()) throw new Error("createArtifact requires a non-empty label");
  if (input.content.length > MAX_CONTENT_CHARS)
    throw new Error(`createArtifact content exceeds ${MAX_CONTENT_CHARS} chars`);
  if (!input.content) throw new Error("createArtifact requires non-empty content");
  if (!input.runId) throw new Error("createArtifact requires a runId");
  const version: CompanyArtifactVersion = {
    version: 1,
    content: input.content,
    changedByRunId: input.runId,
    changedAt: input.at,
    changeNote: "initial",
  };
  return {
    key,
    objectiveKey,
    label,
    content: input.content,
    version: 1,
    updatedAt: input.at,
    provenanceRunId: input.runId,
    history: [version],
  };
}

export function applyArtifactChange(
  artifact: CompanyArtifact,
  input: {
    content: string;
    changeNote: string;
    runId: string;
    at: number;
    usedAcquisitionEvidenceIds?: string[];
  },
): CompanyArtifact {
  if (input.content.length > MAX_CONTENT_CHARS)
    throw new Error(`applyArtifactChange content exceeds ${MAX_CONTENT_CHARS} chars`);
  if (!input.content) throw new Error("applyArtifactChange requires non-empty content");
  if (input.changeNote.length > MAX_CHANGE_NOTE_CHARS)
    throw new Error(
      `applyArtifactChange changeNote exceeds ${MAX_CHANGE_NOTE_CHARS} chars`,
    );
  if (!input.changeNote)
    throw new Error("applyArtifactChange requires a non-empty changeNote");
  if (!input.runId) throw new Error("applyArtifactChange requires a runId");
  if (input.content === artifact.content)
    throw new Error("applyArtifactChange refuses no-op: content unchanged");
  const nextVersion = artifact.version + 1;
  const historyEntry: CompanyArtifactVersion = {
    version: nextVersion,
    content: input.content,
    changedByRunId: input.runId,
    changedAt: input.at,
    changeNote: input.changeNote,
    ...(input.usedAcquisitionEvidenceIds && input.usedAcquisitionEvidenceIds.length > 0
      ? { usedAcquisitionEvidenceIds: [...new Set(input.usedAcquisitionEvidenceIds)] }
      : {}),
  };
  return {
    ...artifact,
    content: input.content,
    version: nextVersion,
    updatedAt: input.at,
    provenanceRunId: input.runId,
    history: [...artifact.history, historyEntry],
  };
}

// Pure predicate: has the artifact's version advanced beyond `sinceVersion`?
// Used by the growth-worker completion rule to require an actual artifact
// version bump, not merely advice or a submitted result.
export function hasArtifactChanged(
  artifact: CompanyArtifact,
  sinceVersion: number,
): boolean {
  return artifact.version > sinceVersion;
}
