/** Durable, safe founder-visible payment previews for the local M3 driver. */
import fs from "node:fs";
import path from "node:path";

import type { PreviewQuote } from "./onchainOsExecutor";
import { paymentTermsEqual } from "./onchainOsExecutor";

/** A preview is evidence for confirmation, never execution authority. */
export type StoredPreviewQuote = Pick<PreviewQuote, "paymentId" | "selectedIndex" | "terms" | "acquiredAt" | "normalization">;

type PreviewLedgerFile = { version: 1; previews: Array<{ purchaseId: string; preview: StoredPreviewQuote }> };

export interface PreviewLedger {
  get(purchaseId: string): StoredPreviewQuote | null;
  put(purchaseId: string, preview: StoredPreviewQuote): StoredPreviewQuote;
}

export function resolvePreviewLedgerPath(root: string): string {
  if (!path.isAbsolute(root)) throw new Error("preview ledger root must be absolute");
  return path.join(path.normalize(root), ".m3-preview-quotes.json");
}

function read(file: string): PreviewLedgerFile {
  if (!fs.existsSync(file)) return { version: 1, previews: [] };
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<PreviewLedgerFile>;
  if (value.version !== 1 || !Array.isArray(value.previews)) throw new Error(`M3 preview ledger is malformed: ${file}`);
  return value as PreviewLedgerFile;
}

function samePreviewTerms(left: StoredPreviewQuote, right: StoredPreviewQuote): boolean {
  return paymentTermsEqual(left.terms, right.terms);
}

/** File-backed immutable preview ledger. A concurrent conflicting preview fails closed. */
export class FilePreviewLedger implements PreviewLedger {
  constructor(private readonly file: string) {}

  get(purchaseId: string): StoredPreviewQuote | null {
    const entry = read(this.file).previews.find((candidate) => candidate.purchaseId === purchaseId);
    return entry ? structuredClone(entry.preview) : null;
  }

  put(purchaseId: string, preview: StoredPreviewQuote): StoredPreviewQuote {
    const lock = `${this.file}.lock`;
    let descriptor: number;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      descriptor = fs.openSync(lock, "wx");
    } catch {
      throw new Error(`M3 preview ledger is busy: ${this.file}`);
    }
    try {
      const ledger = read(this.file);
      const index = ledger.previews.findIndex((candidate) => candidate.purchaseId === purchaseId);
      if (index >= 0) {
        if (!samePreviewTerms(ledger.previews[index].preview, preview)) {
          throw new Error("founder-visible preview is immutable for a purchase; create no new authority");
        }
        // A new preview handle for identical material terms is safe: preview
        // handles never sign, and confirmation binds the terms fingerprint.
        ledger.previews[index] = { purchaseId, preview: structuredClone(preview) };
      } else {
        ledger.previews.push({ purchaseId, preview: structuredClone(preview) });
      }
      const temporary = `${this.file}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(ledger, null, 2), "utf8");
      fs.renameSync(temporary, this.file);
      return structuredClone(preview);
    } finally {
      fs.closeSync(descriptor!);
      fs.unlinkSync(lock);
    }
  }
}
