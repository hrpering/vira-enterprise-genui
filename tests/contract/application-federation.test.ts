import { describe, expect, it } from "vitest";
import {
  lookupViraFederatedApplication,
  parseViraApplicationFederationSnapshot,
  serializeViraApplicationFederationSnapshot,
} from "../../packages/application-federation/src/index.js";

const DIGEST = "a".repeat(64);

function application(version = "1.0.0", visibility: "public" | "organization" | "private" = "public", discoverable = true) {
  return {
    schemaVersion: "1",
    identity: { id: "demo.federated-app" },
    version,
    publisher: { id: "demo", name: "Demo" },
    experiences: [{ id: "demo.main", packId: "demo/main", packVersion: "1.0.0", entrypoint: "main" }],
    capabilities: [],
    contextTypes: [],
    actions: [],
    flows: [],
    brandRef: null,
    governanceRequirements: [],
    hostCompatibility: { minViraVersion: "1.0.0", requiredCapabilities: [] },
    protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
    distribution: { name: "Federated App", tags: ["demo"], visibility, discoverable },
    commercial: { entitlementRefs: [], meteringRefs: [] },
  };
}

function envelope(version = "1.0.0", digest = DIGEST) {
  return {
    schemaVersion: "1",
    application: application(version),
    integrity: { algorithm: "sha256", digest },
  };
}

function snapshot() {
  return {
    schemaVersion: "1",
    sources: [
      { sourceId: "network.beta", applications: [envelope()] },
      { sourceId: "network.alpha", applications: [envelope()] },
    ],
  };
}

describe("Vira Application Federation v1", () => {
  it("parses public discoverable distribution envelopes into deterministic frozen source order", () => {
    const result = parseViraApplicationFederationSnapshot(snapshot());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sources.map((source) => source.sourceId)).toEqual(["network.alpha", "network.beta"]);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.sources)).toBe(true);
    expect(Object.isFrozen(result.value.sources[0])).toBe(true);
  });

  it("rejects private, organization and non-discoverable releases from public federation snapshots", () => {
    for (const app of [
      application("1.0.0", "private", true),
      application("1.0.0", "organization", true),
      application("1.0.0", "public", false),
    ]) {
      const result = parseViraApplicationFederationSnapshot({
        schemaVersion: "1",
        sources: [{
          sourceId: "network.alpha",
          applications: [{ schemaVersion: "1", application: app, integrity: { algorithm: "sha256", digest: DIGEST } }],
        }],
      });
      expect(result).toMatchObject({ ok: false, issue: { code: "NON_PUBLIC_APPLICATION" } });
    }
  });

  it("allows the same exact envelope from multiple sources and returns all provenance source ids", () => {
    const result = lookupViraFederatedApplication(snapshot(), {
      applicationId: "demo.federated-app",
      applicationVersion: "1.0.0",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.envelope?.application.version).toBe("1.0.0");
    expect(result.value.sourceIds).toEqual(["network.alpha", "network.beta"]);
  });

  it("fails closed when sources disagree on the same exact Application release", () => {
    const result = parseViraApplicationFederationSnapshot({
      schemaVersion: "1",
      sources: [
        { sourceId: "network.alpha", applications: [envelope("1.0.0", "a".repeat(64))] },
        { sourceId: "network.beta", applications: [envelope("1.0.0", "b".repeat(64))] },
      ],
    });
    expect(result).toMatchObject({ ok: false, issue: { code: "FEDERATION_CONFLICT" } });
  });

  it("rejects duplicate source ids and duplicate exact releases inside one source", () => {
    expect(parseViraApplicationFederationSnapshot({
      schemaVersion: "1",
      sources: [
        { sourceId: "network.alpha", applications: [] },
        { sourceId: "network.alpha", applications: [] },
      ],
    })).toMatchObject({ ok: false, issue: { code: "DUPLICATE_SOURCE" } });

    expect(parseViraApplicationFederationSnapshot({
      schemaVersion: "1",
      sources: [{ sourceId: "network.alpha", applications: [envelope(), envelope()] }],
    })).toMatchObject({ ok: false, issue: { code: "DUPLICATE_APPLICATION" } });
  });

  it("performs exact id+version lookup only and never resolves latest aliases", () => {
    const exact = lookupViraFederatedApplication(snapshot(), {
      applicationId: "demo.federated-app",
      applicationVersion: "1.0.0",
    });
    expect(exact.ok).toBe(true);

    const latest = lookupViraFederatedApplication(snapshot(), {
      applicationId: "demo.federated-app",
      applicationVersion: "latest",
    });
    expect(latest).toMatchObject({ ok: false, issue: { code: "INVALID_QUERY" } });
  });

  it("returns an explicit null result for a valid exact release that is absent", () => {
    const result = lookupViraFederatedApplication(snapshot(), {
      applicationId: "demo.federated-app",
      applicationVersion: "2.0.0",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.envelope).toBeNull();
    expect(result.value.sourceIds).toEqual([]);
  });

  it("serializes deterministically regardless of source and release input order", () => {
    const first = serializeViraApplicationFederationSnapshot({
      schemaVersion: "1",
      sources: [
        { sourceId: "network.beta", applications: [envelope("2.0.0"), envelope("1.0.0")] },
        { sourceId: "network.alpha", applications: [envelope("1.0.0")] },
      ],
    });
    const second = serializeViraApplicationFederationSnapshot({
      schemaVersion: "1",
      sources: [
        { sourceId: "network.alpha", applications: [envelope("1.0.0")] },
        { sourceId: "network.beta", applications: [envelope("1.0.0"), envelope("2.0.0")] },
      ],
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) expect(first.value).toBe(second.value);
  });

  it("does not claim source identity authentication or integrity verification", () => {
    const result = parseViraApplicationFederationSnapshot(snapshot());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("verified" in result.value).toBe(false);
    expect("authorized" in result.value).toBe(false);
    expect("execute" in result.value).toBe(false);
    expect("transport" in result.value).toBe(false);
  });
});
