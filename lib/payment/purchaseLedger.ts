/**
 * Durable M3 purchase truth for the local Node driver.
 *
 * Convex intentionally does not mirror PurchaseRecord: the financial record
 * belongs to M3. This ledger is rooted next to M3's execution-authority ledger
 * and is keyed by the stable purchase/intention identity, so restarting the
 * driver cannot mint a second purchase or forget a settled payment.
 */
import fs from "node:fs";
import path from "node:path";

import type { PurchaseRecord } from "./types";

type Ledger = { version: 1; purchases: PurchaseRecord[] };

export interface PurchaseLedger {
  get(purchaseId: string): PurchaseRecord | null;
  put(purchase: PurchaseRecord): PurchaseRecord;
}

export function resolvePurchaseLedgerPath(applicationRoot: string): string {
  if (!path.isAbsolute(applicationRoot)) throw new Error("M3 purchase ledger root must be an absolute application path");
  return path.join(path.normalize(applicationRoot), ".m3-purchase-ledger.json");
}

function read(file: string): Ledger {
  if (!fs.existsSync(file)) return { version: 1, purchases: [] };
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Ledger>;
  if (value.version !== 1 || !Array.isArray(value.purchases)) throw new Error(`M3 purchase ledger is malformed: ${file}`);
  return value as Ledger;
}

function write(file: string, ledger: Ledger): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(ledger, null, 2), "utf8");
  fs.renameSync(temporary, file);
}

function sameIdentity(left: PurchaseRecord, right: PurchaseRecord): boolean {
  return left.id === right.id
    && left.objectiveKey === right.objectiveKey
    && left.resourceNeedId === right.resourceNeedId
    && left.offeringId === right.offeringId
    && left.idempotencyKey === right.idempotencyKey;
}

/** File-backed M3 ledger. A lock makes concurrent local driver invocations fail closed. */
export class FilePurchaseLedger implements PurchaseLedger {
  constructor(private readonly file: string) {}

  get(purchaseId: string): PurchaseRecord | null {
    const purchase = read(this.file).purchases.find((candidate) => candidate.id === purchaseId);
    return purchase ? structuredClone(purchase) : null;
  }

  put(purchase: PurchaseRecord): PurchaseRecord {
    const lock = `${this.file}.lock`;
    let descriptor: number;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      descriptor = fs.openSync(lock, "wx");
    } catch {
      throw new Error(`M3 purchase ledger is busy: ${this.file}`);
    }
    try {
      const ledger = read(this.file);
      const index = ledger.purchases.findIndex((candidate) => candidate.id === purchase.id);
      if (index >= 0) {
        const current = ledger.purchases[index];
        if (!sameIdentity(current, purchase)) throw new Error(`M3 purchase identity collision: ${purchase.id}`);
        if (purchase.updatedAt < current.updatedAt) return structuredClone(current);
        ledger.purchases[index] = structuredClone(purchase);
      } else {
        if (ledger.purchases.some((candidate) => candidate.idempotencyKey === purchase.idempotencyKey)) {
          throw new Error(`M3 purchase idempotency collision: ${purchase.idempotencyKey}`);
        }
        ledger.purchases.push(structuredClone(purchase));
      }
      write(this.file, ledger);
      return structuredClone(purchase);
    } finally {
      fs.closeSync(descriptor!);
      fs.unlinkSync(lock);
    }
  }
}
