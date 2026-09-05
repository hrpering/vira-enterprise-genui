import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { evaluateViraApplicationForAiHost } from "@vira-enterprise-genui/application-ai-host-sdk";
import type { ViraApplicationDistributionVerifierInput } from "@vira-enterprise-genui/application-distribution";
import {
  prepareViraApplicationDistribution,
  type ViraApplicationPublisherDigestInput,
} from "@vira-enterprise-genui/application-publisher-sdk";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function application() {
  return {
    schemaVersion: "1",
    identity: { id: "acme.external-ai-host" },
    version: "1.3.0",
    publisher: { id: "acme", name: "Acme" },
    experiences: [{
      id: "acme.main",
      packId: "acme/external-host",
      packVersion: "1.0.0",
      entrypoint: "main",
    }],
    capabilities: [],
    contextTypes: [],
    actions: [],
    flows: [],
    brandRef: null,
    governanceRequirements: [],
    hostCompatibility: {
      minViraVersion: "1.2.0",
      maxViraVersion: "2.0.0",
      requiredCapabilities: ["host.streaming"],
    },
    protocolProjections: [
      { id: "protocol.a2ui", versionRef: "2" },
      { id: "protocol.mcp-apps", versionRef: "1" },
    ],
    distribution: {
      name: "Acme External AI Host Proof",
      tags: ["proof"],
      visibility: "public",
      discoverable: true,
    },
    commercial: { entitlementRefs: [], meteringRefs: [] },
  };
}

function host() {
  return {
    viraVersion: "1.5.0",
    capabilities: ["host.streaming", "host.tools"],
    protocolProjections: [
      { id: "protocol.ag-ui", versionRef: "1" },
      { id: "protocol.mcp-apps", versionRef: "1" },
    ],
  };
}

async function preparedEnvelope() {
  const prepared = await prepareViraApplicationDistribution(
    { publisherId: "acme", application: application() },
    (input: ViraApplicationPublisherDigestInput) => sha256(input.canonicalArtifact),
  );
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) throw new Error(prepared.issue.code);
  return prepared.value.envelope;
}

function externalVerifier(input: ViraApplicationDistributionVerifierInput): boolean {
  return input.algorithm === "sha256" && sha256(input.canonicalArtifact) === input.digest;
}

describe("MASTER-49 independent external AI-host proof", () => {
  it("verifies a canonical external Distribution artifact before producing a frozen compatibility plan", async () => {
    const source = await preparedEnvelope();
    let verifierCalls = 0;
    let verifiedApplicationId = "";

    const result = await evaluateViraApplicationForAiHost(
      { source, host: host() },
      (input: ViraApplicationDistributionVerifierInput) => {
        verifierCalls += 1;
        verifiedApplicationId = input.applicationId;
        return externalVerifier(input);
      },
    );

    expect(result.ok).toBe(true);
    expect(verifierCalls).toBe(1);
    expect(verifiedApplicationId).toBe("acme.external-ai-host");
    if (!result.ok) return;
    expect(result.value.source.application.identity.id).toBe("acme.external-ai-host");
    expect(result.value.compatibleProtocolProjections).toEqual([
      { id: "protocol.mcp-apps", versionRef: "1" },
    ]);
    expect(Object.isFrozen(result.value)).toBe(true);
    for (const forbidden of ["execute", "authorize", "entitled", "deploy", "credential", "verifiedHost"]) {
      expect(forbidden in result.value).toBe(false);
    }
  });

  it("fails closed when the external verifier rejects a tampered Distribution digest", async () => {
    const source = await preparedEnvelope();
    const tampered = {
      ...source,
      integrity: { ...source.integrity, digest: "0".repeat(64) },
    };

    const result = await evaluateViraApplicationForAiHost(
      { source: tampered, host: host() },
      externalVerifier,
    );
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "SOURCE_INTEGRITY_FAILED", distributionCode: "INTEGRITY_VERIFICATION_FAILED" },
    });
  });

  it("cannot succeed without an explicit external integrity verifier", async () => {
    const source = await preparedEnvelope();
    const result = await evaluateViraApplicationForAiHost({ source, host: host() }, undefined);
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_INTEGRITY_VERIFIER" } });
  });

  it("rejects floating host projection references before invoking integrity verification", async () => {
    const source = await preparedEnvelope();
    let verifierCalls = 0;
    const result = await evaluateViraApplicationForAiHost(
      {
        source,
        host: {
          ...host(),
          protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "latest" }],
        },
      },
      (input: ViraApplicationDistributionVerifierInput) => {
        verifierCalls += 1;
        return externalVerifier(input);
      },
    );
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_HOST", path: "$.host.protocolProjections[0].versionRef" },
    });
    expect(verifierCalls).toBe(0);
  });

  it("fails closed when host runtime compatibility requirements are not satisfied", async () => {
    const source = await preparedEnvelope();

    const tooOld = await evaluateViraApplicationForAiHost(
      { source, host: { ...host(), viraVersion: "1.1.9" } },
      externalVerifier,
    );
    expect(tooOld).toMatchObject({ ok: false, issue: { code: "HOST_VERSION_UNSUPPORTED" } });

    const missingCapability = await evaluateViraApplicationForAiHost(
      { source, host: { ...host(), capabilities: ["host.tools"] } },
      externalVerifier,
    );
    expect(missingCapability).toMatchObject({ ok: false, issue: { code: "MISSING_HOST_CAPABILITY" } });
  });

  it("keeps protocol projection compatibility exact without fallback or same-id version substitution", async () => {
    const source = await preparedEnvelope();
    const result = await evaluateViraApplicationForAiHost(
      {
        source,
        host: {
          ...host(),
          protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "2" }],
        },
      },
      externalVerifier,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.compatibleProtocolProjections).toEqual([]);
  });
});
