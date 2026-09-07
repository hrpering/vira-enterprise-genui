import { readFileSync } from "node:fs";
import process from "node:process";
import { URL } from "node:url";
const source = readFileSync(new URL("../packages/production-mvp/src/index.ts", import.meta.url), "utf8");
for (const required of ["github.query", "google.query", "durable.wait-handoff", "transaction.protected", "postcondition.verified", "action-ledger.anchored", "billing-export.sealed", "PROVISIONAL_CODE_COMPLETE", "releaseAuthority: \"forbidden\""]) if (!source.includes(required)) throw new Error(`PROD-17 proof requirement missing: ${required}`);
if (/status:\s*["'](?:RC|PRODUCTION_READY)["']/.test(source)) throw new Error("PROD-17 must not claim release authority");
process.stdout.write("PRODUCTION_MVP_RC_PROVISIONAL_OK\n");
