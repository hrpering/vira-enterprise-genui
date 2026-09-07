import { createHash } from "node:crypto";

export interface ViraRestorePlan {
  readonly version: "1";
  readonly mode: "dry-run";
  readonly backupRef: string;
  readonly backupSha256: string;
  readonly sourceEnvironment: "production";
  readonly targetEnvironment: "restore-verification";
  readonly steps: readonly string[];
  readonly planSha256: string;
}

export function createRestoreDryRunPlan(input: { backupRef: string; backupSha256: string }): ViraRestorePlan {
  if (!/^[A-Za-z0-9._:/-]{1,256}$/.test(input.backupRef) || input.backupRef.includes("latest")) throw new Error("backupRef must be exact and bounded");
  if (!/^[a-f0-9]{64}$/.test(input.backupSha256)) throw new Error("backup checksum must be SHA-256");
  const steps = Object.freeze([
    "verify-backup-checksum",
    "create-isolated-restore-database",
    "restore-with-no-owner-and-no-privileges",
    "apply-forward-migrations",
    "run-integrity-and-tenant-isolation-checks",
    "destroy-isolated-restore-database",
  ]);
  const canonical = JSON.stringify({ backupRef: input.backupRef, backupSha256: input.backupSha256, steps });
  return Object.freeze({
    version: "1",
    mode: "dry-run",
    backupRef: input.backupRef,
    backupSha256: input.backupSha256,
    sourceEnvironment: "production",
    targetEnvironment: "restore-verification",
    steps,
    planSha256: createHash("sha256").update(canonical).digest("hex"),
  });
}
