import { describe, expect, it } from "vitest";
import {
  lookupViraFederatedApplication,
  parseViraApplicationFederationSnapshot,
} from "@vira-enterprise-genui/application-federation";
import {
  prepareViraApplicationDistribution,
} from "@vira-enterprise-genui/application-publisher-sdk";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

function application(
  version = "1.0.0",
  visibility: "public" | "organization" | "private" = "public",
  discoverable = true,
) {
  return {
    schemaVersion: "1",
    identity: { id: "acme.publisher-proof" },
    version,
    publisher: { id: "acme", name: "Acme" },
    experiences: [{
      id: "acme.publisher-proof.main",
      packId: "acme/publisher-proof",
      packVersion: "1.0.0",
      entrypoint: "main",
    }],
    capabilities: [],
    contextTypes: [],
    actions: [],
    flows: [],
    brandRef: null,
    governanceRequirements: [],
    hostCompatibility: { minViraVersion: "1.0.0", requiredCapabilities: [] },
    protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
    distribution: {
      name: "Acme External Publisher Proof",
      tags: ["external", "proof"],
      visibility,
      discoverable,
    },
    commercial: { entitlementRefs: [], meteringRefs: [] },
  };
}

async function prepared(
  digest: string = DIGEST_A,
  app: unknown = application(),
) {
  return prepareViraApplicationDistribution(
    { publisherId: "acme", application: app },
    () => digest,
  );
}

function snapshot(envelope: unknown) {
  return {
    schemaVersion: "1",
    sources: [{
      sourceId: "network.acme",
      applications: [envelope],
    }],
  };
}

describe("MASTER-48 independent external publisher proof", () => {
  it("uses only public package exports to prepare, federate and discover one exact external Application release", async () => {
    const publisher = await prepared();
    expect(publisher.ok).toBe(true);
    if (!publisher.ok) return;

    const federation = parseViraApplicationFederationSnapshot(snapshot(publisher.value.envelope));
    expect(federation.ok).toBe(true);
    if (!federation.ok) return;

    const lookup = lookupViraFederatedApplication(federation.value, {
      applicationId: "acme.publisher-proof",
      applicationVersion: "1.0.0",
    });
    expect(lookup.ok).toBe(true);
    if (!lookup.ok) return;

    expect(lookup.value.envelope).not.toBeNull();
    expect(lookup.value.envelope?.application.identity.id).toBe("acme.publisher-proof");
    expect(lookup.value.envelope?.application.version).toBe("1.0.0");
    expect(lookup.value.envelope?.application.publisher.id).toBe("acme");
    expect(lookup.value.sourceIds).toEqual(["network.acme"]);
  });

  it("fails closed when the external host asserts the wrong publisher identity", async () => {
    const result = await prepareViraApplicationDistribution(
      { publisherId: "other", application: application() },
      () => DIGEST_A,
    );
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "PUBLISHER_MISMATCH", path: "$.publisherId" },
    });
  });

  it("keeps private, organization and non-discoverable releases out of public federation discovery", async () => {
    for (const app of [
      application("1.0.0", "private", true),
      application("1.0.0", "organization", true),
      application("1.0.0", "public", false),
    ]) {
      const publisher = await prepared(DIGEST_A, app);
      expect(publisher.ok).toBe(true);
      if (!publisher.ok) continue;

      expect(parseViraApplicationFederationSnapshot(snapshot(publisher.value.envelope))).toMatchObject({
        ok: false,
        issue: { code: "NON_PUBLIC_APPLICATION" },
      });
    }
  });

  it("never resolves latest, implicit defaults or fallback versions", async () => {
    const publisher = await prepared();
    expect(publisher.ok).toBe(true);
    if (!publisher.ok) return;

    const exactSnapshot = snapshot(publisher.value.envelope);
    expect(lookupViraFederatedApplication(exactSnapshot, {
      applicationId: "acme.publisher-proof",
      applicationVersion: "latest",
    })).toMatchObject({ ok: false, issue: { code: "INVALID_QUERY" } });

    expect(lookupViraFederatedApplication(exactSnapshot, {
      applicationId: "acme.publisher-proof",
    })).toMatchObject({ ok: false, issue: { code: "INVALID_QUERY" } });

    const miss = lookupViraFederatedApplication(exactSnapshot, {
      applicationId: "acme.publisher-proof",
      applicationVersion: "2.0.0",
    });
    expect(miss.ok).toBe(true);
    if (!miss.ok) return;
    expect(miss.value.envelope).toBeNull();
    expect(miss.value.sourceIds).toEqual([]);
  });

  it("fails closed when independent sources disagree on the same exact external release", async () => {
    const first = await prepared(DIGEST_A);
    const second = await prepared(DIGEST_B);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(parseViraApplicationFederationSnapshot({
      schemaVersion: "1",
      sources: [
        { sourceId: "network.alpha", applications: [first.value.envelope] },
        { sourceId: "network.beta", applications: [second.value.envelope] },
      ],
    })).toMatchObject({
      ok: false,
      issue: { code: "FEDERATION_CONFLICT" },
    });
  });

  it("treats source ids and integrity digests as provenance declarations, not trust or execution authority", async () => {
    const publisher = await prepared();
    expect(publisher.ok).toBe(true);
    if (!publisher.ok) return;

    const federation = parseViraApplicationFederationSnapshot(snapshot(publisher.value.envelope));
    expect(federation.ok).toBe(true);
    if (!federation.ok) return;

    expect(publisher.value.envelope.integrity).toEqual({ algorithm: "sha256", digest: DIGEST_A });
    for (const field of [
      "verified",
      "authenticated",
      "authorized",
      "trusted",
      "execute",
      "deploy",
      "transport",
      "credential",
      "token",
    ]) {
      expect(field in federation.value).toBe(false);
    }
  });
});
