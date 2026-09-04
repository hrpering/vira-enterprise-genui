import { describe, expect, it } from "vitest";
import {
  prepareViraApplicationDistribution,
  type ViraApplicationPublisherDigestInput,
} from "../../packages/application-publisher-sdk/src/index.js";

const DIGEST = "d".repeat(64);

function application() {
  return {
    schemaVersion: "1",
    identity: { id: "vira.publisher-demo" },
    version: "1.2.0",
    publisher: { id: "vira", name: "Vira" },
    experiences: [{
      id: "demo.main",
      packId: "vira/demo-pack",
      packVersion: "1.0.0",
      entrypoint: "main",
    }],
    capabilities: [{ id: "demo.search", versionRef: "1" }],
    contextTypes: [],
    actions: [],
    flows: [],
    brandRef: null,
    governanceRequirements: [],
    hostCompatibility: { minViraVersion: "1.0.0", requiredCapabilities: [] },
    protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
    distribution: {
      name: "Publisher Demo",
      tags: ["demo"],
      visibility: "public",
      discoverable: true,
    },
    commercial: { entitlementRefs: [], meteringRefs: [] },
  };
}

function input(app: unknown = application()) {
  return { publisherId: "vira", application: app };
}

const digest = () => DIGEST;

describe("Vira Application Publisher SDK v1", () => {
  it("prepares a canonical frozen distribution envelope without network publication authority", async () => {
    const result = await prepareViraApplicationDistribution(input(), digest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.publisherId).toBe("vira");
    expect(result.value.envelope.integrity).toEqual({ algorithm: "sha256", digest: DIGEST });
    expect(result.value.envelope.application.identity.id).toBe("vira.publisher-demo");
    expect(result.value.serializedEnvelope).toContain(`"digest":"${DIGEST}"`);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.envelope)).toBe(true);
    expect(Object.keys(result.value).sort()).toEqual([
      "envelope",
      "publisherId",
      "sdkVersion",
      "serializedEnvelope",
    ]);
    expect("upload" in result.value).toBe(false);
    expect("publish" in result.value).toBe(false);
    expect("verifiedPublisher" in result.value).toBe(false);
  });

  it("passes the canonical Application artifact and exact metadata to a frozen digest-provider input", async () => {
    let seen: ViraApplicationPublisherDigestInput | undefined;
    const result = await prepareViraApplicationDistribution(input(), (value: ViraApplicationPublisherDigestInput) => {
      seen = value;
      return DIGEST;
    });
    expect(result.ok).toBe(true);
    expect(seen).toBeDefined();
    if (!seen) return;
    expect(seen.algorithm).toBe("sha256");
    expect(seen.applicationId).toBe("vira.publisher-demo");
    expect(seen.applicationVersion).toBe("1.2.0");
    expect(seen.publisherId).toBe("vira");
    expect(seen.canonicalArtifact).toContain('"id":"vira.publisher-demo"');
    expect(Object.isFrozen(seen)).toBe(true);
  });

  it("requires host-asserted publisher id to exactly match the canonical Application publisher", async () => {
    const result = await prepareViraApplicationDistribution(
      { publisherId: "other", application: application() },
      digest,
    );
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "PUBLISHER_MISMATCH", path: "$.publisherId" },
    });
  });

  it("delegates malformed Application semantics to the canonical Application owner", async () => {
    const app = application();
    const result = await prepareViraApplicationDistribution(
      input({ ...app, version: "latest" }),
      digest,
    );
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_APPLICATION" },
    });
  });

  it("rejects upload, transport, registry, credential and execution authority smuggling", async () => {
    for (const field of ["url", "endpoint", "transport", "registry", "credential", "token", "upload", "publish", "execute", "authorize", "deploy"]) {
      const result = await prepareViraApplicationDistribution(
        { ...input(), [field]: "forbidden" },
        digest,
      );
      expect(result).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
  });

  it("fails closed when the digest provider is absent, throws, or returns malformed data", async () => {
    const missing = await prepareViraApplicationDistribution(input(), undefined);
    expect(missing).toMatchObject({ ok: false, issue: { code: "INVALID_DIGEST_PROVIDER" } });

    const thrown = await prepareViraApplicationDistribution(input(), () => {
      throw new Error("offline");
    });
    expect(thrown).toMatchObject({ ok: false, issue: { code: "DIGEST_PROVIDER_FAILED" } });

    for (const malformed of ["A".repeat(64), "d".repeat(63), "latest", 123, null]) {
      const result = await prepareViraApplicationDistribution(input(), () => malformed as never);
      expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_DIGEST" } });
    }
  });

  it("supports async digest providers without changing the canonical output contract", async () => {
    const result = await prepareViraApplicationDistribution(input(), async () => DIGEST);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.envelope.integrity.digest).toBe(DIGEST);
  });

  it("produces deterministic canonical artifact input regardless of caller key order", async () => {
    let firstArtifact = "";
    let secondArtifact = "";
    const first = await prepareViraApplicationDistribution(input(application()), (value: ViraApplicationPublisherDigestInput) => {
      firstArtifact = value.canonicalArtifact;
      return DIGEST;
    });

    const app = application();
    const reordered = {
      commercial: app.commercial,
      distribution: app.distribution,
      protocolProjections: app.protocolProjections,
      hostCompatibility: app.hostCompatibility,
      governanceRequirements: app.governanceRequirements,
      brandRef: app.brandRef,
      flows: app.flows,
      actions: app.actions,
      contextTypes: app.contextTypes,
      capabilities: app.capabilities,
      experiences: app.experiences,
      publisher: app.publisher,
      version: app.version,
      identity: app.identity,
      schemaVersion: app.schemaVersion,
    };
    const second = await prepareViraApplicationDistribution(input(reordered), (value: ViraApplicationPublisherDigestInput) => {
      secondArtifact = value.canonicalArtifact;
      return DIGEST;
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(firstArtifact).toBe(secondArtifact);
    if (first.ok && second.ok) expect(first.value.serializedEnvelope).toBe(second.value.serializedEnvelope);
  });

  it("detaches canonical output from caller-owned mutable input", async () => {
    const app = application();
    const result = await prepareViraApplicationDistribution(input(app), digest);
    expect(result.ok).toBe(true);
    app.distribution.name = "Mutated later";
    if (result.ok) expect(result.value.envelope.application.distribution.name).toBe("Publisher Demo");
  });

  it("fails closed on unsafe accessors and custom-prototype preparation inputs before invoking the digest provider", async () => {
    let calls = 0;
    const provider = () => {
      calls += 1;
      return DIGEST;
    };

    const accessor: Record<string, unknown> = { application: application() };
    Object.defineProperty(accessor, "publisherId", {
      enumerable: true,
      get() {
        throw new Error("must not execute");
      },
    });
    expect(await prepareViraApplicationDistribution(accessor, provider)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT" },
    });

    const custom = Object.assign(Object.create({ inherited: true }) as Record<string, unknown>, input());
    expect(await prepareViraApplicationDistribution(custom, provider)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT" },
    });
    expect(calls).toBe(0);
  });

  it("does not silently compute, replace, or verify integrity without the caller-supplied digest provider", async () => {
    const result = await prepareViraApplicationDistribution(input(), null);
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_DIGEST_PROVIDER" } });
  });
});
