import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "packages/commercial-settlement/src/reconciliation.ts"), "utf8");
for (const required of ["publisher", "provider", "model", "node", "platform", "allocation-only", "reconciliation-only", "INVALID_SIGNATURE", "DUPLICATE_EVENT", "OUT_OF_ORDER_EVENT", "CURRENCY_MISMATCH"]) if (!source.includes(required)) throw new Error(`PROD-21 invariant missing: ${required}`);
for (const forbidden of ["taxRate", "exchangeRate", "bankAccount", "accountingLedger", "capturePayment", "moveFunds"]) if (source.includes(forbidden)) throw new Error(`PROD-21 owns forbidden financial authority: ${forbidden}`);
process.stdout.write("PROD21_SETTLEMENT_RECONCILIATION_PROVISIONAL_OK\n");
