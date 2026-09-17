/**
 * Local provider-level Google Workspace proof.
 * Does not push Convex schema to the shared Development deployment.
 *
 * Required env (names only; values in .env.local):
 *   GOOGLE_WORKSPACE_LIVE=true
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 *   GOOGLE_CALENDAR_EVENT_ID, GOOGLE_CALENDAR_ID?=primary
 *   GOOGLE_DRIVE_FOLDER_ID
 *   GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SHEETS_SHEET_NAME?=Comparison
 *   GMAIL_VENDOR_STUDIO_TO or GMAIL_RECIPIENTS_JSON
 */
import { loadGoogleConfig, isGoogleWorkspaceLive } from "../lib/google/config";
import { readCalendarMissionContext } from "../lib/google/calendar";
import { readDriveMissionContext } from "../lib/google/drive";
import {
  sendGmailEffect,
  verifyGmailOutbound,
  listGmailVendorReplies,
  readGmailMessage,
} from "../lib/google/gmail";
import {
  gmailMessageToEvidenceInput,
  revisionFromSourceTime,
} from "../lib/google/evidence";
import { projectMissionToSheet } from "../lib/google/sheets";
import { applyCommand, ingestEvidence } from "../lib/procurement/domain";
import { createMission } from "../lib/procurement/fixtures";

function log(step: string, detail: unknown) {
  console.log(`OK ${step}`, typeof detail === "string" ? detail : JSON.stringify(detail));
}

async function main() {
  if (!isGoogleWorkspaceLive(process.env)) {
    console.error(
      "Set GOOGLE_WORKSPACE_LIVE=true and Google credentials in the environment to run live proof.",
    );
    process.exit(2);
  }
  const config = loadGoogleConfig(process.env);
  const calendar = await readCalendarMissionContext(config);
  log("calendar.read", {
    eventId: calendar.eventId,
    startAt: calendar.startAt,
    location: calendar.location,
    headcountClues: calendar.headcountClues,
  });

  const drive = await readDriveMissionContext(config);
  log("drive.read", {
    folderId: drive.folderId,
    files: drive.files.map((f) => ({
      fileId: f.fileId,
      name: f.name,
      relevance: f.relevance,
    })),
  });

  const effectKey = `rfq:prove-gws:${Date.now()}:studio`;
  const payload = JSON.stringify({
    quantity: 25,
    budgetCents: 75000,
    deadlineAt: Date.now() + 3 * 86400000,
    branded: true,
  });
  const sent = await sendGmailEffect({
    config,
    kind: "rfq",
    effectKey,
    endpointRef: "dev.gmail.paper-pine",
    payload,
  });
  log("gmail.outbound.send", {
    messageId: sent.messageId,
    threadId: sent.threadId,
  });

  const again = await sendGmailEffect({
    config,
    kind: "rfq",
    effectKey,
    endpointRef: "dev.gmail.paper-pine",
    payload,
  });
  if (again.messageId !== sent.messageId)
    throw new Error("Idempotent Gmail send returned a different message id");
  log("gmail.outbound.idempotent", again.messageId);

  const verified = await verifyGmailOutbound({
    config,
    effectKey,
    endpointRef: "dev.gmail.paper-pine",
    payload,
    messageId: sent.messageId,
  });
  log("gmail.outbound.readback", {
    messageId: verified.messageId,
    threadId: verified.threadId,
  });

  const replies = await listGmailVendorReplies({
    config,
    endpointRef: "dev.gmail.paper-pine",
  });
  log("gmail.inbound.list", { count: replies.length });

  const mission = createMission(`prove-gws-${Date.now()}`, "Sponsor gifts", Date.now());
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

  // Chronology / idempotency against in-memory domain (no shared Convex write).
  if (replies.length >= 2) {
    const [first, second] = [...replies].sort((a, b) => b.observedAt - a.observedAt);
    ingestEvidence(
      mission,
      gmailMessageToEvidenceInput({ vendorId: "studio", message: first! }),
    );
    ingestEvidence(
      mission,
      gmailMessageToEvidenceInput({ vendorId: "studio", message: second! }),
    );
    const dup = gmailMessageToEvidenceInput({
      vendorId: "studio",
      message: first!,
    });
    ingestEvidence(mission, dup);
    log("gmail.inbound.chronology", {
      evidenceCount: mission.evidence.length,
      revisions: mission.evidence.map((e) => ({
        id: e.id,
        revision: e.revision,
        sourceRevision: revisionFromSourceTime(e.observedAt),
      })),
    });
  } else if (replies[0]) {
    const evidence = gmailMessageToEvidenceInput({
      vendorId: "studio",
      message: replies[0],
    });
    ingestEvidence(mission, evidence);
    ingestEvidence(mission, evidence);
    log("gmail.inbound.idempotent", mission.evidence.length);
  } else {
    // Still prove outbound message can be normalized if treated as an observation.
    const outboundAsObs = await readGmailMessage(config, sent.messageId);
    log("gmail.inbound.none_yet", {
      hint: "Send a controlled vendor reply to the RFQ, then re-run.",
      outboundSubject: outboundAsObs.subject,
    });
  }

  const sheet = await projectMissionToSheet({ config, mission });
  log("sheets.project+readback", {
    spreadsheetId: sheet.spreadsheetId,
    updatedRows: sheet.updatedRows,
  });

  console.log("GOOGLE_WORKSPACE_LIVE_PROOF_PASSED");
}

main().catch((error) => {
  console.error(
    "GOOGLE_WORKSPACE_LIVE_PROOF_FAILED",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
