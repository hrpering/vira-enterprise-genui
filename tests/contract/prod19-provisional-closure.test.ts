import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("PROD-19 provisional code closure", () => {
  it("composes source trust, bounded transport, explicit provider routing and protocol conformance while forbidding release authority", () => {
    const result = spawnSync(process.execPath, [path.join(root, "tooling/verify-prod19-provisional.mjs")], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const evidence = JSON.parse(result.stdout);
    expect(evidence).toMatchObject({
      version: "1",
      gate: "prod19-provisional",
      status: "PROVISIONAL_CODE_COMPLETE",
      releaseAuthority: "forbidden",
      closureEligible: true,
    });
    expect(evidence.verified).toEqual([
      "authenticated-application-source",
      "bounded-network-transport",
      "explicit-provider-routing",
      "network-protocol-conformance",
      "application-projection-proof",
    ]);
    expect(evidence.liveEvidenceDeferred).toEqual([
      "public-network-live-endpoints",
      "cdn-cache-production-behavior",
      "publisher-key-rotation-revocation-live",
      "provider-slo-region-commercial-evidence",
      "provider-live-failover-drill",
      "external-protocol-interoperability",
      "prod17-prod18-live-release-authority",
    ]);
  });
});
