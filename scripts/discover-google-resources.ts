import { loadGoogleConfig } from "../lib/google/config";
import { calendarClient, driveClient } from "../lib/google/client";

async function main() {
  const config = loadGoogleConfig(process.env);
  const cal = calendarClient(config);
  const drive = driveClient(config);

  const about = await drive.about.get({ fields: "user" });
  console.log("AUTH_USER", about.data.user?.emailAddress);

  try {
    await cal.events.get({
      calendarId: config.calendarId,
      eventId: config.calendarEventId,
    });
    console.log("CONFIGURED_EVENT_OK", config.calendarEventId);
  } catch (error) {
    console.log(
      "CONFIGURED_EVENT_ERR",
      error instanceof Error ? error.message : error,
    );
  }

  const events = await cal.events.list({
    calendarId: "primary",
    maxResults: 10,
    singleEvents: true,
    orderBy: "startTime",
    timeMin: new Date(Date.now() - 90 * 86400000).toISOString(),
  });
  console.log(
    "RECENT_EVENTS",
    JSON.stringify(
      (events.data.items ?? []).map((e) => ({
        id: e.id,
        summary: e.summary,
        start: e.start,
        location: e.location,
      })),
      null,
      2,
    ),
  );

  const folders = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
    pageSize: 15,
    fields: "files(id,name)",
  });
  console.log("FOLDERS", JSON.stringify(folders.data.files, null, 2));

  const sheets = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    pageSize: 15,
    fields: "files(id,name)",
  });
  console.log("SHEETS", JSON.stringify(sheets.data.files, null, 2));
}

main().catch((error) => {
  console.error("DISCOVER_FAILED", error instanceof Error ? error.message : error);
  process.exit(1);
});
