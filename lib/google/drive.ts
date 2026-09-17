import type { GoogleWorkspaceConfig } from "./config";
import { driveClient } from "./client";

export type DriveContextFile = {
  fileId: string;
  name: string;
  mimeType: string;
  modifiedAt: string | null;
  webViewLink: string | null;
  sizeBytes: number | null;
  relevance: "brief" | "sponsor" | "branding" | "other";
};

export type DriveMissionContext = {
  folderId: string;
  files: DriveContextFile[];
};

function classify(name: string, mimeType: string): DriveContextFile["relevance"] {
  const lower = name.toLowerCase();
  if (
    /logo|brand|branding|mark|wordmark|lockup/.test(lower) ||
    mimeType.startsWith("image/")
  )
    return "branding";
  if (/sponsor|funding|approval|budget/.test(lower)) return "sponsor";
  if (/brief|event|agenda|run[- ]?of[- ]?show|roster/.test(lower)) return "brief";
  return "other";
}

/**
 * Bounded Drive listing inside the configured mission folder only.
 * No broad crawl of My Drive.
 */
export async function readDriveMissionContext(
  config: GoogleWorkspaceConfig,
): Promise<DriveMissionContext> {
  const drive = driveClient(config);
  const response = await drive.files.list({
    q: `'${config.driveFolderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
    pageSize: 25,
    fields:
      "files(id,name,mimeType,modifiedTime,webViewLink,size,shortcutDetails)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const files = (response.data.files ?? [])
    .filter((file) => file.id && file.name && file.mimeType)
    .map((file) => {
      const name = file.name!;
      const mimeType = file.mimeType!;
      return {
        fileId: file.id!,
        name,
        mimeType,
        modifiedAt: file.modifiedTime ?? null,
        webViewLink: file.webViewLink ?? null,
        sizeBytes: file.size ? Number(file.size) : null,
        relevance: classify(name, mimeType),
      } satisfies DriveContextFile;
    })
    .filter((file) => file.relevance !== "other" || /gift|procure|quote|vendor/.test(file.name.toLowerCase()))
    .slice(0, 20);
  return { folderId: config.driveFolderId, files };
}
