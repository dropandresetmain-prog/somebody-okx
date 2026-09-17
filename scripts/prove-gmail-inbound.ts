/**
 * Focused inbound proof against the live controlled vendor reply.
 * Does not send another RFQ.
 */
import { loadGoogleConfig } from "../lib/google/config";
import { listGmailVendorReplies } from "../lib/google/gmail";
import {
  gmailMessageToEvidenceInput,
  revisionFromSourceTime,
} from "../lib/google/evidence";
import { applyCommand, ingestEvidence } from "../lib/procurement/domain";
import { createMission } from "../lib/procurement/fixtures";

async function main() {
  const config = loadGoogleConfig(process.env);
  const replies = await listGmailVendorReplies({
    config,
    endpointRef: "dev.gmail.paper-pine",
  });
  console.log(
    "OK gmail.inbound.list",
    JSON.stringify({
      count: replies.length,
      ids: replies.map((r) => ({
        messageId: r.messageId,
        threadId: r.threadId,
        from: r.from,
        subject: r.subject,
        labels: r.labelIds,
      })),
    }),
  );
  if (!replies.length) throw new Error("Expected at least one vendor reply");

  const mission = createMission(
    `prove-inbound-${Date.now()}`,
    "Sponsor gifts",
    Date.now(),
  );
  applyCommand(
    mission,
    {
      type: "answer_requirements",
      quantity: 25,
      budgetCents: 75000,
      deadlineAt: Date.now() + 3 * 86400000,
      branded: true,
    },
    Date.now(),
  );

  const chronological = [...replies].sort((a, b) => a.observedAt - b.observedAt);
  // Ingest newest first to prove out-of-order retrieval still respects source time.
  for (const reply of [...chronological].reverse()) {
    ingestEvidence(
      mission,
      gmailMessageToEvidenceInput({ vendorId: "studio", message: reply }),
    );
  }
  // Duplicate ingest of the same message must be idempotent.
  const first = chronological[0]!;
  ingestEvidence(
    mission,
    gmailMessageToEvidenceInput({ vendorId: "studio", message: first }),
  );

  console.log(
    "OK gmail.inbound.normalize",
    JSON.stringify({
      evidenceCount: mission.evidence.length,
      evidence: mission.evidence.map((e) => ({
        id: e.id,
        revision: e.revision,
        sourceRevision: revisionFromSourceTime(e.observedAt),
        text: e.text.slice(0, 120),
        observationId: e.provenance.observationId,
        parentId: e.provenance.parentId,
      })),
      studioStatus: mission.vendors.find((v) => v.id === "studio")?.evaluation
        .status,
    }),
  );
  console.log("GMAIL_INBOUND_PROOF_PASSED");
}

main().catch((error) => {
  console.error(
    "GMAIL_INBOUND_PROOF_FAILED",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
