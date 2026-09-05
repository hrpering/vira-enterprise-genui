import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { evaluateViraApplicationForAiHost } from "@vira-enterprise-genui/application-ai-host-sdk";
import type { ViraApplicationDistributionVerifierInput } from "@vira-enterprise-genui/application-distribution";
import {
  lookupViraFederatedApplication,
  parseViraApplicationFederationSnapshot,
} from "@vira-enterprise-genui/application-federation";
import { prepareViraApplicationDistribution } from "@vira-enterprise-genui/application-publisher-sdk";
import {
  lookupViraCapabilitySupply,
  parseViraCapabilitySupplySnapshot,
} from "@vira-enterprise-genui/capability-supply";
import { invokeViraHostedCapability } from "@vira-enterprise-genui/hosted-capability-runtime";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function capability(version = "1.0.0") {
  return {
    schemaVersion: "1",
    id: "acme.catalog-search",
    version,
    publisher: { id: "acme", name: "Acme" },
    metadata: { name: "Catalog search" },
    input: { typeRef: { id: "type.catalog-query", versionRef: "1" } },
    output: { typeRef: { id: "type.catalog-result", versionRef: "1" } },
    contextRequirements: [],
    invocation: { kind: "query" as const },
  };
}

function actionCapability(version = "1.0.0") {
  return {
    ...capability(version),
    invocation: { kind: "action" as const, actionType: "catalog.purchase" },
  };
}

function binding(capabilityVersion = "1.0.0") {
  return {
    version: "1",
    bindingRef: { id: "binding.acme.catalog-search", versionRef: "1" },
    capabilityRef: { id: "acme.catalog-search", versionRef: capabilityVersion },
    providerId: "acme.provider",
    locationId: "region.eu",
  };
}

function application(capabilityVersion = "1.0.0") {
  return {
    schemaVersion: "1",
    identity: { id: "acme.network-rc" },
    version: "1.0.0",
    publisher: { id: "acme", name: "Acme" },
    experiences: [{
      id: "acme.network-rc.main",
      packId: "acme/network-rc",
      packVersion: "1.0.0",
      entrypoint: "main",
    }],
    capabilities: [{ id: "acme.catalog-search", versionRef: capabilityVersion }],
    contextTypes: [],
    actions: [],
    flows: [],
    brandRef: null,
    governanceRequirements: [],
    hostCompatibility: {
      minViraVersion: "1.0.0",
      maxViraVersion: "2.0.0",
      requiredCapabilities: ["host.streaming"],
    },
    protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
    distribution: {
      name: "Acme Application Network RC",
      tags: ["network", "rc"],
      visibility: "public" as const,
      discoverable: true,
    },
    commercial: { entitlementRefs: [], meteringRefs: [] },
  };
}

function host(protocolVersion = "1") {
  return {
    viraVersion: "1.5.0",
    capabilities: ["host.streaming"],
    protocolProjections: [{ id: "protocol.mcp-apps", versionRef: protocolVersion }],
  };
}

function federationSnapshot(envelope: unknown) {
  return {
    schemaVersion: "1",
    sources: [{ sourceId: "network.acme", applications: [envelope] }],
  };
}

function supplySnapshot(capabilityVersion = "1.0.0") {
  return {
    schemaVersion: "1",
    sources: [{
      sourceId: "provider.acme.catalog",
      supplies: [{
        capability: capability(capabilityVersion),
        binding: binding(capabilityVersion),
      }],
    }],
  };
}

function request() {
  return {
    version: "1",
    invocationId: "network-rc-invocation-1",
    principal: { version: "1", kind: "user", id: "user-1", organizationId: "contoso" },
    scope: { version: "1", organizationId: "contoso", projectId: "catalog", environment: "production" },
    input: {
      typeRef: { id: "type.catalog-query", versionRef: "1" },
      value: { query: "espresso" },
    },
    contexts: [],
  };
}

async function prepare(capabilityVersion = "1.0.0") {
  const prepared = await prepareViraApplicationDistribution(
    { publisherId: "acme", application: application(capabilityVersion) },
    (input) => sha256(input.canonicalArtifact),
  );
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) throw new Error(prepared.issue.code);
  return prepared.value.envelope;
}

function verifyDistribution(input: ViraApplicationDistributionVerifierInput): boolean {
  return input.algorithm === "sha256" && sha256(input.canonicalArtifact) === input.digest;
}

async function discoverApplication(capabilityVersion = "1.0.0") {
  const envelope = await prepare(capabilityVersion);
  const federation = parseViraApplicationFederationSnapshot(federationSnapshot(envelope));
  expect(federation.ok).toBe(true);
  if (!federation.ok) throw new Error(federation.issue.code);

  const discovered = lookupViraFederatedApplication(federation.value, {
    applicationId: "acme.network-rc",
    applicationVersion: "1.0.0",
  });
  expect(discovered.ok).toBe(true);
  if (!discovered.ok || discovered.value.envelope === null) throw new Error("application not discovered");
  return discovered.value;
}

describe("MASTER-51 cross-surface exact Application Network semantics", () => {
  it("preserves one exact Capability reference from publisher discovery through AI host and provider execution", async () => {
    const discovered = await discoverApplication();
    expect(discovered.sourceIds).toEqual(["network.acme"]);

    const hosted = await evaluateViraApplicationForAiHost(
      { source: discovered.envelope, host: host() },
      verifyDistribution,
    );
    expect(hosted.ok).toBe(true);
    if (!hosted.ok) return;
    expect(hosted.value.compatibleProtocolProjections).toEqual([
      { id: "protocol.mcp-apps", versionRef: "1" },
    ]);

    const applicationCapabilityRef = hosted.value.source.application.capabilities[0];
    expect(applicationCapabilityRef).toEqual({ id: "acme.catalog-search", versionRef: "1.0.0" });

    const supply = lookupViraCapabilitySupply(supplySnapshot(), {
      capabilityId: applicationCapabilityRef!.id,
      capabilityVersion: applicationCapabilityRef!.versionRef,
      providerId: "acme.provider",
      locationId: "region.eu",
    });
    expect(supply.ok).toBe(true);
    if (!supply.ok) return;
    expect(supply.value.supplies).toHaveLength(1);
    expect(supply.value.supplies[0]!.sourceIds).toEqual(["provider.acme.catalog"]);

    const selected = supply.value.supplies[0]!;
    let calls = 0;
    const executed = await invokeViraHostedCapability(
      selected.capability,
      selected.binding,
      request(),
      () => {
        calls += 1;
        return {
          outcome: "success" as const,
          output: {
            typeRef: { id: "type.catalog-result", versionRef: "1" },
            value: { items: [{ id: "sku-1" }] },
          },
        };
      },
    );

    expect(calls).toBe(1);
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    expect(executed.value.capabilityRef).toEqual(applicationCapabilityRef);
    expect(executed.value).toMatchObject({
      bindingRef: { id: "binding.acme.catalog-search", versionRef: "1" },
      providerId: "acme.provider",
      locationId: "region.eu",
      outcome: "success",
    });

    for (const value of [discovered, hosted.value, supply.value, executed.value]) {
      for (const forbidden of [
        "authenticated",
        "attested",
        "authorized",
        "entitled",
        "trusted",
        "priority",
        "fallback",
        "endpoint",
        "credential",
        "deploy",
      ]) {
        expect(forbidden in value).toBe(false);
      }
    }
  });

  it("never substitutes a provider release when the exact Application Capability reference is unavailable", async () => {
    const discovered = await discoverApplication("1.0.1");
    const hosted = await evaluateViraApplicationForAiHost(
      { source: discovered.envelope, host: host() },
      verifyDistribution,
    );
    expect(hosted.ok).toBe(true);
    if (!hosted.ok) return;

    const applicationCapabilityRef = hosted.value.source.application.capabilities[0]!;
    expect(applicationCapabilityRef).toEqual({ id: "acme.catalog-search", versionRef: "1.0.1" });

    const exactMiss = lookupViraCapabilitySupply(supplySnapshot("1.0.0"), {
      capabilityId: applicationCapabilityRef.id,
      capabilityVersion: applicationCapabilityRef.versionRef,
      providerId: "acme.provider",
      locationId: "region.eu",
    });
    expect(exactMiss.ok).toBe(true);
    if (!exactMiss.ok) return;
    expect(exactMiss.value.supplies).toEqual([]);
    expect("fallback" in exactMiss.value).toBe(false);
    expect("selected" in exactMiss.value).toBe(false);
    expect("substitute" in exactMiss.value).toBe(false);
  });

  it("keeps protocol projection compatibility exact across the same discovered Distribution", async () => {
    const discovered = await discoverApplication();
    const result = await evaluateViraApplicationForAiHost(
      { source: discovered.envelope, host: host("2") },
      verifyDistribution,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.compatibleProtocolProjections).toEqual([]);
  });

  it("fails closed on divergent provider binding identity instead of executing a near match", async () => {
    let calls = 0;
    const result = await invokeViraHostedCapability(
      capability("1.0.0"),
      binding("1.0.1"),
      request(),
      () => {
        calls += 1;
        return { outcome: "empty" as const };
      },
    );
    expect(calls).toBe(0);
    expect(result).toMatchObject({ ok: false, issue: { code: "CAPABILITY_MISMATCH" } });
  });

  it("keeps action Capability supply behind the Action Boundary in the Network RC path", () => {
    const actionSnapshot = {
      schemaVersion: "1",
      sources: [{
        sourceId: "provider.acme.catalog",
        supplies: [{
          capability: actionCapability("1.0.0"),
          binding: binding("1.0.0"),
        }],
      }],
    };

    expect(parseViraCapabilitySupplySnapshot(actionSnapshot)).toMatchObject({
      ok: false,
      issue: { code: "ACTION_BOUNDARY_REQUIRED" },
    });
  });
});
