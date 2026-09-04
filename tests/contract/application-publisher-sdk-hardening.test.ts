import { describe, expect, it } from "vitest";
import {
  prepareViraApplicationDistribution,
  type ViraApplicationPublisherDigestInput,
} from "../../packages/application-publisher-sdk/src/index.js";

const DIGEST = "e".repeat(64);

function application() {
  return {
    schemaVersion: "1",
    identity: { id: "vira.publisher-hardening" },
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    experiences: [],
    capabilities: [{ id: "vira.publisher-capability", versionRef: "1" }],
    contextTypes: [],
    actions: [],
    flows: [],
    brandRef: null,
    governanceRequirements: [],
    hostCompatibility: { minViraVersion: "1.0.0", requiredCapabilities: [] },
    protocolProjections: [],
    distribution: { name: "Publisher hardening", tags: [], visibility: "private", discoverable: false },
    commercial: { entitlementRefs: [], meteringRefs: [] },
  };
}

describe("Vira Application Publisher SDK hardening", () => {
  it("does not invoke the digest provider for publisher mismatch or invalid Application input", async () => {
    let calls = 0;
    const provider = () => {
      calls += 1;
      return DIGEST;
    };

    const mismatch = await prepareViraApplicationDistribution(
      { publisherId: "other", application: application() },
      provider,
    );
    expect(mismatch).toMatchObject({ ok: false, issue: { code: "PUBLISHER_MISMATCH" } });

    const invalid = await prepareViraApplicationDistribution(
      { publisherId: "vira", application: { ...application(), version: "latest" } },
      provider,
    );
    expect(invalid).toMatchObject({ ok: false, issue: { code: "INVALID_APPLICATION" } });
    expect(calls).toBe(0);
  });

  it("gives the digest provider only canonical artifact identity data and no transport or credential authority", async () => {
    let keys: string[] = [];
    const result = await prepareViraApplicationDistribution(
      { publisherId: "vira", application: application() },
      (input: ViraApplicationPublisherDigestInput) => {
        keys = Object.keys(input).sort();
        return DIGEST;
      },
    );
    expect(result.ok).toBe(true);
    expect(keys).toEqual([
      "algorithm",
      "applicationId",
      "applicationVersion",
      "canonicalArtifact",
      "publisherId",
    ]);
  });

  it("rejects object-shaped digest claims instead of accepting provider-owned verification metadata", async () => {
    const result = await prepareViraApplicationDistribution(
      { publisherId: "vira", application: application() },
      () => ({ digest: DIGEST, verified: true }) as never,
    );
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_DIGEST" } });
  });
});
