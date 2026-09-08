import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const proof = readFileSync(path.join(root, "examples/full-platform-rc/proof.ts"), "utf8");
const blockers = readFileSync(path.join(root, "docs/production/LIVE_GATE_BLOCKERS.md"), "utf8");
for (const invariant of ["publisher.authenticated", "application.public", "host.external", "supply.trusted", "run.cross-surface", "execution.protected", "ledger.verified", "acquisition.selected", "usage.priced", "settlement.allocated", "reconciliation.matched", "PROVISIONAL_CODE_COMPLETE", "liveReleaseGates", "releaseAuthority"]) if (!proof.includes(invariant)) throw new Error(`full-platform invariant missing: ${invariant}`);
for (const liveGate of ["Vercel", "Railway", "backup/restore", "design-partner UAT", "load/soak"]) if (!blockers.includes(liveGate)) throw new Error(`live blocker missing: ${liveGate}`);
process.stdout.write("FULL_PLATFORM_RC_PROVISIONAL_CODE_COMPLETE_LIVE_RELEASE_GATES_OPEN\n");
