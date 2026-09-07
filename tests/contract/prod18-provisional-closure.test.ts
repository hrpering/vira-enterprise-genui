import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("PROD-18 provisional code closure", () => {
  it("composes identity, continuity, adapter and native evidence while explicitly forbidding release authority", () => {
    const result = spawnSync(process.execPath, [path.join(root, "tooling/verify-prod18-provisional.mjs")], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const evidence = JSON.parse(result.stdout);
    expect(evidence).toMatchObject({
      version: "1",
      gate: "prod18-provisional",
      status: "PROVISIONAL_CODE_COMPLETE",
      releaseAuthority: "forbidden",
      closureEligible: true,
    });
    expect(evidence.verified).toEqual([
      "external-host-identity",
      "cross-surface-continuity",
      "external-ai-host-adapters",
      "ios-native-gate",
      "android-native-gate",
      "external-ai-host-proof",
    ]);
    expect(evidence.liveEvidenceDeferred).toEqual([
      "production-device-matrix",
      "external-host-live-connectivity",
      "cross-device-recovery",
      "prod17-live-release-authority",
    ]);
  });
});
