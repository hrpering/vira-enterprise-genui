import { describe, expect, it } from "vitest";
import {
  VIRA_APPLICATION_FEDERATION_MAX_APPLICATIONS_PER_SOURCE,
  VIRA_APPLICATION_FEDERATION_MAX_SOURCES,
  lookupViraFederatedApplication,
  parseViraApplicationFederationSnapshot,
} from "../../packages/application-federation/src/index.js";

const DIGEST = "c".repeat(64);

function envelope() {
  return {
    schemaVersion: "1",
    application: {
      schemaVersion: "1",
      identity: { id: "demo.hardened-app" },
      version: "1.0.0",
      publisher: { id: "demo", name: "Demo" },
      experiences: [{ id: "demo.main", packId: "demo/main", packVersion: "1.0.0", entrypoint: "main" }],
      capabilities: [], contextTypes: [], actions: [], flows: [], brandRef: null,
      governanceRequirements: [],
      hostCompatibility: { minViraVersion: "1.0.0", requiredCapabilities: [] },
      protocolProjections: [],
      distribution: { name: "Hardened", tags: [], visibility: "public", discoverable: true },
      commercial: { entitlementRefs: [], meteringRefs: [] },
    },
    integrity: { algorithm: "sha256", digest: DIGEST },
  };
}

describe("Vira Application Federation hardening", () => {
  it("rejects URL, transport, credential, priority and execution fields at snapshot/source boundaries", () => {
    for (const field of ["url", "endpoint", "transport", "credential", "token", "priority", "execute", "authorize", "deploy"]) {
      const rootResult = parseViraApplicationFederationSnapshot({
        schemaVersion: "1",
        sources: [],
        [field]: "forbidden",
      });
      expect(rootResult).toMatchObject({ ok: false, issue: { code: "UNKNOWN_FIELD" } });

      const sourceResult = parseViraApplicationFederationSnapshot({
        schemaVersion: "1",
        sources: [{ sourceId: "network.alpha", applications: [], [field]: "forbidden" }],
      });
      expect(sourceResult).toMatchObject({ ok: false, issue: { code: "UNKNOWN_FIELD" } });
    }
  });

  it("fails closed on unsafe accessor and custom-prototype federation inputs", () => {
    const accessor: Record<string, unknown> = { schemaVersion: "1" };
    Object.defineProperty(accessor, "sources", {
      enumerable: true,
      get() { throw new Error("must not execute"); },
    });
    expect(parseViraApplicationFederationSnapshot(accessor)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT" },
    });

    const custom = Object.assign(Object.create({ inherited: true }) as Record<string, unknown>, {
      schemaVersion: "1",
      sources: [],
    });
    expect(parseViraApplicationFederationSnapshot(custom)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT" },
    });
  });

  it("enforces source and applications-per-source bounds", () => {
    const tooManySources = Array.from({ length: VIRA_APPLICATION_FEDERATION_MAX_SOURCES + 1 }, (_, index) => ({
      sourceId: `network.source-${index}`,
      applications: [],
    }));
    expect(parseViraApplicationFederationSnapshot({ schemaVersion: "1", sources: tooManySources })).toMatchObject({
      ok: false,
      issue: { code: "SOURCE_LIMIT_EXCEEDED" },
    });

    const tooManyApps = Array.from({ length: VIRA_APPLICATION_FEDERATION_MAX_APPLICATIONS_PER_SOURCE + 1 }, () => envelope());
    expect(parseViraApplicationFederationSnapshot({
      schemaVersion: "1",
      sources: [{ sourceId: "network.alpha", applications: tooManyApps }],
    })).toMatchObject({ ok: false, issue: { code: "APPLICATION_LIMIT_EXCEEDED" } });
  });

  it("rejects malformed source ids and exact-query authority smuggling", () => {
    expect(parseViraApplicationFederationSnapshot({
      schemaVersion: "1",
      sources: [{ sourceId: "https://registry.example", applications: [] }],
    })).toMatchObject({ ok: false, issue: { code: "INVALID_SOURCE" } });

    const snapshot = { schemaVersion: "1", sources: [{ sourceId: "network.alpha", applications: [envelope()] }] };
    expect(lookupViraFederatedApplication(snapshot, {
      applicationId: "demo.hardened-app",
      applicationVersion: "1.0.0",
      sourcePriority: "network.alpha",
    })).toMatchObject({ ok: false, issue: { code: "INVALID_QUERY" } });
  });
});
