import { loadGoogleConfig } from "../lib/google/config";
import { listGmailVendorReplies } from "../lib/google/gmail";
import { gmailMessageToEvidenceInput } from "../lib/google/evidence";
import { applyCommand, ingestEvidence } from "../lib/procurement/domain";
import { createMission } from "../lib/procurement/fixtures";
import { projectMissionToSheet } from "../lib/google/sheets";

async function main() {
  const config = loadGoogleConfig(process.env);
  const replies = await listGmailVendorReplies({
    config,
    endpointRef: "dev.gmail.paper-pine",
  });
  const quote = replies.find((r) =>
    r.bodyText.includes("QUOTE_CLAIMS_JSON"),
  );
  if (!quote) throw new Error("Structured quote reply not found");

  // Mission deadline after the vendor's confirmed delivery commitment.
  const deliveryAt = 1789635600000;
  const mission = createMission(`eligible-${Date.now()}`, "Sponsor gifts", Date.now());
  applyCommand(
    mission,
    {
      type: "answer_requirements",
      quantity: 25,
      budgetCents: 75000,
      deadlineAt: deliveryAt + 3600000,
      branded: true,
    },
    Date.now(),
  );

  // Out-of-order: newer quote first, then older spam note, then duplicate quote.
  const older = replies.find((r) => r.messageId === "1a09c7e6d7111f20");
  ingestEvidence(
    mission,
    gmailMessageToEvidenceInput({ vendorId: "studio", message: quote }),
  );
  if (older) {
    ingestEvidence(
      mission,
      gmailMessageToEvidenceInput({ vendorId: "studio", message: older }),
    );
  }
  ingestEvidence(
    mission,
    gmailMessageToEvidenceInput({ vendorId: "studio", message: quote }),
  );

  const studio = mission.vendors.find((v) => v.id === "studio")!;
  const sheet = await projectMissionToSheet({ config, mission });
  console.log(
    JSON.stringify(
      {
        replyMessageId: quote.messageId,
        threadId: quote.threadId,
        evidenceCount: mission.evidence.length,
        status: studio.evaluation.status,
        quote: studio.evaluation.quote,
        totalCents: studio.evaluation.totalCents,
        orderQuantity: studio.evaluation.orderQuantity,
        sheet: sheet.spreadsheetId,
      },
      null,
      2,
    ),
  );
  if (studio.evaluation.status !== "eligible")
    throw new Error(`Expected eligible, got ${studio.evaluation.status}`);
  console.log("STRUCTURED_QUOTE_PROOF_PASSED");
}

main().catch((error) => {
  console.error(
    "STRUCTURED_QUOTE_PROOF_FAILED",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
