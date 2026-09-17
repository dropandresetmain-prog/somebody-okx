/**
 * Application-owned Google Workspace configuration.
 * Models never supply recipient addresses or arbitrary Calendar/Drive IDs.
 */
export type GoogleWorkspaceConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Stable Calendar event id for the active procurement mission context. */
  calendarEventId: string;
  calendarId: string;
  /** Bounded Drive folder that holds event/sponsor/branding materials. */
  driveFolderId: string;
  /** User-visible comparison spreadsheet (projection only). */
  sheetsSpreadsheetId: string;
  sheetsSheetName: string;
  /**
   * Maps opaque vendor endpointRef values to controlled Gmail addresses.
   * Example: { "dev.gmail.paper-pine": "vendor-b@example.com" }
   */
  gmailRecipientsByEndpointRef: Record<string, string>;
  /** Optional From override; defaults to the authorized Google account. */
  gmailFrom?: string;
};

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required Google Workspace env: ${name}`);
  return value;
}

function parseRecipientMap(
  raw: string | undefined,
): Record<string, string> {
  if (!raw?.trim()) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("GMAIL_RECIPIENTS_JSON must be a JSON object");
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string" || !value.includes("@"))
      throw new Error(`Invalid Gmail recipient for endpointRef ${key}`);
    out[key] = value.trim().toLowerCase();
  }
  return out;
}

export function isGoogleWorkspaceLive(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.GOOGLE_WORKSPACE_LIVE === "true";
}

export function loadGoogleConfig(
  env: Record<string, string | undefined> = process.env,
): GoogleWorkspaceConfig {
  const recipients = parseRecipientMap(env.GMAIL_RECIPIENTS_JSON);
  // Convenience single-vendor binding used by the locked Gmail Vendor B path.
  if (env.GMAIL_VENDOR_STUDIO_TO?.trim()) {
    recipients["dev.gmail.paper-pine"] =
      env.GMAIL_VENDOR_STUDIO_TO.trim().toLowerCase();
  }
  return {
    clientId: required(env, "GOOGLE_CLIENT_ID"),
    clientSecret: required(env, "GOOGLE_CLIENT_SECRET"),
    refreshToken: required(env, "GOOGLE_REFRESH_TOKEN"),
    calendarEventId: required(env, "GOOGLE_CALENDAR_EVENT_ID"),
    calendarId: env.GOOGLE_CALENDAR_ID?.trim() || "primary",
    driveFolderId: required(env, "GOOGLE_DRIVE_FOLDER_ID"),
    sheetsSpreadsheetId: required(env, "GOOGLE_SHEETS_SPREADSHEET_ID"),
    sheetsSheetName: env.GOOGLE_SHEETS_SHEET_NAME?.trim() || "Comparison",
    gmailRecipientsByEndpointRef: recipients,
    gmailFrom: env.GMAIL_FROM?.trim() || undefined,
  };
}

export function resolveGmailRecipient(
  config: GoogleWorkspaceConfig,
  endpointRef: string,
): string {
  const to = config.gmailRecipientsByEndpointRef[endpointRef];
  if (!to)
    throw new Error(
      `No application-owned Gmail recipient configured for endpointRef ${endpointRef}`,
    );
  return to;
}
