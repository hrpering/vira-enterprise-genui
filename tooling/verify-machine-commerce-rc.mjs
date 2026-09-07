import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "packages/machine-commerce/src/index.ts"), "utf8");
for (const token of ["ViraNetworkTrustEvidence", "ViraExactCommercialOffer", "ViraDelegatedCommercialMandate", "ViraMachineAcquisitionIntent", "selected", "declined", "challenge-required", "external-only", "PROTECTED_ACTION_BYPASS", "REPLAY_REJECTED"]) if (!source.includes(token)) throw new Error(`machine commerce invariant missing: ${token}`);
for (const forbidden of ["capturePayment", "moveFunds", "walletBalance", "taxRate", "exchangeRate"]) if (source.includes(forbidden)) throw new Error(`machine commerce core owns forbidden funds semantics: ${forbidden}`);
process.stdout.write("MACHINE_COMMERCE_RC_PROVISIONAL_OK\n");
