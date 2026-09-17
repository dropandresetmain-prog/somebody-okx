/**
 * Creates bounded demo Calendar/Drive/Sheets resources on the OAuth account.
 * Writes IDs into .env.local. Does not print secrets.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadGoogleConfig } from "../lib/google/config";
import { calendarClient, driveClient, sheetsClient } from "../lib/google/client";

const ENV_PATH = resolve(process.cwd(), ".env.local");

function upsertEnv(key: string, value: string) {
  const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  const line = `${key}=${value}`;
  const next = existing.match(new RegExp(`^${key}=.*$`, "m"))
    ? existing.replace(new RegExp(`^${key}=.*$`, "m"), line)
    : `${existing.replace(/\s*$/, "")}\n${line}\n`;
  writeFileSync(ENV_PATH, next, "utf8");
}

async function main() {
  const config = loadGoogleConfig(process.env);
  const calendar = calendarClient(config);
  const drive = driveClient(config);
  const sheets = sheetsClient(config);

  const start = new Date();
  start.setDate(start.getDate() + ((4 - start.getDay() + 7) % 7 || 7)); // next Thursday
  start.setHours(18, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const event = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: "Somebody demo — sponsor gifts for Thursday event",
      description:
        "About 25 attendees. Sponsor approved ~S$500 for branded corporate gifts. Receiving at venue lobby before 5pm. Logistics: drop-off at reception.",
      location: "Drop & Reset studio, Singapore",
      start: { dateTime: start.toISOString(), timeZone: "Asia/Singapore" },
      end: { dateTime: end.toISOString(), timeZone: "Asia/Singapore" },
    },
  });
  if (!event.data.id) throw new Error("Calendar event create returned no id");

  const folder = await drive.files.create({
    requestBody: {
      name: "Somebody — procurement mission context",
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id,name",
  });
  if (!folder.data.id) throw new Error("Drive folder create returned no id");

  const { Readable } = await import("node:stream");
  await drive.files.create({
    requestBody: {
      name: "Event brief — sponsor gifts.txt",
      parents: [folder.data.id],
      mimeType: "text/plain",
    },
    media: {
      mimeType: "text/plain",
      body: Readable.from([
        "Sponsor brief: branded gifts for ~25 attendees. Logo required. Delivery before Thursday event receiving window.",
      ]),
    },
    fields: "id,name",
  });

  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: "Somebody — vendor comparison projection" },
      sheets: [{ properties: { title: "Comparison" } }],
    },
  });
  const spreadsheetId = spreadsheet.data.spreadsheetId;
  if (!spreadsheetId) throw new Error("Sheets create returned no id");

  upsertEnv("GOOGLE_CALENDAR_ID", "primary");
  upsertEnv("GOOGLE_CALENDAR_EVENT_ID", event.data.id);
  upsertEnv("GOOGLE_DRIVE_FOLDER_ID", folder.data.id);
  upsertEnv("GOOGLE_SHEETS_SPREADSHEET_ID", spreadsheetId);
  upsertEnv("GOOGLE_SHEETS_SHEET_NAME", "Comparison");

  console.log(
    JSON.stringify(
      {
        calendarEventId: event.data.id,
        driveFolderId: folder.data.id,
        sheetsSpreadsheetId: spreadsheetId,
        eventStart: start.toISOString(),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    "SETUP_FAILED",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
