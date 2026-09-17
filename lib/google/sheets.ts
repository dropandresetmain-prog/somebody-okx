import type { Mission } from "../procurement/types";
import type { GoogleWorkspaceConfig } from "./config";
import { sheetsClient } from "./client";

export type SheetsProjectionRow = {
  vendorId: string;
  vendor: string;
  channel: string;
  requiredQuantity: string;
  orderQuantity: string;
  unitPrice: string;
  setupCharges: string;
  delivery: string;
  tax: string;
  landedTotal: string;
  moq: string;
  confirmedStock: string;
  branding: string;
  deliveryCommitment: string;
  eligibility: string;
  missingOrConflicts: string;
  recommendation: string;
};

const HEADERS = [
  "Vendor ID",
  "Vendor",
  "Channel",
  "Required qty",
  "Order qty",
  "Unit price (SGD)",
  "Setup (SGD)",
  "Delivery (SGD)",
  "Tax (SGD)",
  "Landed total (SGD)",
  "MOQ",
  "Confirmed stock",
  "Branding",
  "Delivery commitment",
  "Eligibility",
  "Missing / conflicts",
  "Recommendation",
] as const;

function cents(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return (value / 100).toFixed(2);
}

function ts(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return new Date(value).toISOString();
}

export function buildSheetsProjectionRows(mission: Mission): SheetsProjectionRow[] {
  return mission.vendors.map((vendor) => {
    const evaluation = vendor.evaluation;
    const quote = evaluation.quote;
    const recommended =
      mission.recommendation?.vendorId === vendor.id
        ? `v${mission.recommendation.version}: ${mission.recommendation.rationale}`
        : "";
    const missingOrConflicts = [
      ...evaluation.missing.map((field) => `missing:${field}`),
      ...evaluation.conflicts.map((field) => `conflict:${field}`),
      ...evaluation.reasons,
    ].join("; ");
    return {
      vendorId: vendor.id,
      vendor: vendor.name,
      channel: vendor.channel,
      requiredQuantity:
        evaluation.requiredQuantity?.toString() ??
        mission.requirements.quantity?.toString() ??
        "",
      orderQuantity: evaluation.orderQuantity?.toString() ?? "",
      unitPrice: cents(quote.unitCents),
      setupCharges: cents(quote.setupCents),
      delivery: cents(quote.deliveryCents),
      tax: cents(quote.taxCents),
      landedTotal: cents(evaluation.totalCents),
      moq: quote.moq?.toString() ?? "",
      confirmedStock: quote.stock?.toString() ?? "",
      branding:
        quote.branded === undefined ? "" : quote.branded ? "yes" : "no",
      deliveryCommitment: ts(quote.deliveryAt),
      eligibility: evaluation.status,
      missingOrConflicts,
      recommendation: recommended,
    };
  });
}

function rowValues(row: SheetsProjectionRow): string[] {
  return [
    row.vendorId,
    row.vendor,
    row.channel,
    row.requiredQuantity,
    row.orderQuantity,
    row.unitPrice,
    row.setupCharges,
    row.delivery,
    row.tax,
    row.landedTotal,
    row.moq,
    row.confirmedStock,
    row.branding,
    row.deliveryCommitment,
    row.eligibility,
    row.missingOrConflicts,
    row.recommendation,
  ];
}

export type SheetsProjectionResult = {
  spreadsheetId: string;
  sheetName: string;
  updatedRows: number;
  readBack: string[][];
};

/**
 * Idempotent projection: replaces the comparison sheet range for current vendors.
 * Convex remains SSOT; this is user-visible only.
 */
export async function projectMissionToSheet(args: {
  config: GoogleWorkspaceConfig;
  mission: Mission;
}): Promise<SheetsProjectionResult> {
  const rows = buildSheetsProjectionRows(args.mission);
  const sheets = sheetsClient(args.config);
  const sheetName = args.config.sheetsSheetName;
  const values = [Array.from(HEADERS), ...rows.map(rowValues)];
  const range = `${sheetName}!A1:Q${Math.max(values.length, 1)}`;

  await sheets.spreadsheets.values.clear({
    spreadsheetId: args.config.sheetsSpreadsheetId,
    range: `${sheetName}!A:Q`,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: args.config.sheetsSpreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });

  const readBack = await sheets.spreadsheets.values.get({
    spreadsheetId: args.config.sheetsSpreadsheetId,
    range,
  });
  const observed = readBack.data.values ?? [];
  if (observed.length < values.length)
    throw new Error("Sheets read-back row count mismatch");
  for (let i = 0; i < values.length; i++) {
    for (let j = 0; j < values[i]!.length; j++) {
      if (String(observed[i]?.[j] ?? "") !== String(values[i]![j]))
        throw new Error(`Sheets read-back mismatch at ${i},${j}`);
    }
  }
  return {
    spreadsheetId: args.config.sheetsSpreadsheetId,
    sheetName,
    updatedRows: rows.length,
    readBack: observed.map((row) => row.map((cell) => String(cell))),
  };
}
