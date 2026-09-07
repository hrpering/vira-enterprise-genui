import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const verifier = "tooling/verify-live-recovery-evidence.mjs";

function cleanEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env = { ...process.env, ...overrides };
  for (const key of [
    "VIRA_RECOVERY_MANIFEST_JSON",
    "VIRA_RAILWAY_READ_TOKEN",
    "RAILWAY_TOKEN",
    "VIRA_RECOVERY_SOURCE_DATABASE_URL",
    "VIRA_RECOVERY_RESTORED_DATABASE_URL",
  ]) {
    delete env[key];
  }
  return { ...env, ...overrides };
}

function run(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [verifier], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
}

function parseFailure(stderr: string): Record<string, unknown> {
  return JSON.parse(stderr) as Record<string, unknown>;
}

function manifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: "1",
    environment: "staging",
    owner: "release-engineering",
    candidateSha: "0123456789abcdef0123456789abcdef01234567",
    sourceVolumeInstanceId: "11111111-1111-4111-8111-111111111111",
    restoredVolumeInstanceId: "22222222-2222-4222-8222-222222222222",
    backupId: "33333333-3333-4333-8333-333333333333",
    sourceServiceName: "vira-postgres-staging",
    restoredServiceName: "vira-postgres-restore-drill",
    beforeMarker: "44444444-4444-4444-8444-444444444444",
    afterMarker: "55555555-5555-4555-8555-555555555555",
    restoreStartedAt: "2026-09-07T17:00:00.000Z",
    restoreCompletedAt: "2026-09-07T17:05:00.000Z",
    ...overrides,
  });
}

describe("live PostgreSQL recovery evidence gate", () => {
  it("fails closed before network or database access when the recovery manifest is missing", () => {
    const result = run(cleanEnv());
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    const failure = parseFailure(result.stderr);
    expect(failure).toMatchObject({
      gate: "live-postgres-backup-restore",
      authority: "live-railway-api+postgres",
      closureEligible: false,
      releaseRecoveryClosureEligible: false,
      message: "VIRA_RECOVERY_MANIFEST_JSON is required",
      requiredEnvironment: ["VIRA_RECOVERY_MANIFEST_JSON"],
    });
  });

  it("rejects non-staging recovery rehearsals before reading provider authority", () => {
    const result = run(cleanEnv({
      VIRA_RECOVERY_MANIFEST_JSON: manifest({ environment: "production" }),
    }));
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(parseFailure(result.stderr)).toMatchObject({
      closureEligible: false,
      releaseRecoveryClosureEligible: false,
      message: "recovery rehearsal must run in the isolated staging environment",
      environmentObserved: "production",
    });
  });

  it("rejects a restore that reuses the source volume identity before network access", () => {
    const source = "11111111-1111-4111-8111-111111111111";
    const result = run(cleanEnv({
      VIRA_RECOVERY_MANIFEST_JSON: manifest({ restoredVolumeInstanceId: source }),
    }));
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(parseFailure(result.stderr)).toMatchObject({
      closureEligible: false,
      releaseRecoveryClosureEligible: false,
      message: "source and restored volume instances must be independent resources",
    });
  });
});
