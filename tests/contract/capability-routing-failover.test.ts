import { describe, expect, it } from "vitest";
import {
  advanceViraCapabilitySupplyRoute,
  planViraCapabilitySupplyRoute,
} from "../../packages/capability-supply/src/index.js";

const now = 2_000_000_000_000;
const capabilityRef = Object.freeze({ id: "capability.search.web", versionRef: "1.2.3" });
const bindingA = Object.freeze({ id: "binding.search.primary", versionRef: "1.0.0" });
const bindingB = Object.freeze({ id: "binding.search.failover", versionRef: "1.0.0" });
const bindingHidden = Object.freeze({ id: "binding.search.hidden", versionRef: "1.0.0" });

const lookup = Object.freeze({
  capabilityId: capabilityRef.id,
  capabilityVersion: capabilityRef.versionRef,
  providerId: null,
  locationId: null,
  supplies: Object.freeze([
    Object.freeze({ capability: {}, binding: Object.freeze({ version: "1", bindingRef: bindingA, capabilityRef, providerId: "provider.alpha", locationId: "region.eu-west" }), sourceIds: Object.freeze(["source.alpha"]) }),
    Object.freeze({ capability: {}, binding: Object.freeze({ version: "1", bindingRef: bindingB, capabilityRef, providerId: "provider.beta", locationId: "region.eu-west" }), sourceIds: Object.freeze(["source.beta"]) }),
    Object.freeze({ capability: {}, binding: Object.freeze({ version: "1", bindingRef: bindingHidden, capabilityRef, providerId: "provider.hidden", locationId: "region.eu-west" }), sourceIds: Object.freeze(["source.hidden"]) }),
  ]),
});

const scope = Object.freeze({ version: "1", organizationId: "org.acme", projectId: "project.search", environment: "production" });

function candidate(bindingRef: { readonly id: string; readonly versionRef: string }, providerId: string, overrides: Record<string, unknown> = {}) {
  return {
    bindingRef,
    trust: {
      trusted: true,
      evidenceId: `trust.${providerId}`,
      connectionId: `connection.${providerId}`,
      providerId,
      scope,
      validUntilEpochMs: now + 60_000,
    },
    availabilityBps: 9_990,
    p95LatencyMs: 250,
    commercial: { currency: "USD", unitCostMicros: 200 },
    ...overrides,
  };
}

const policy = Object.freeze({
  version: "1",
  capabilityRef,
  orderedBindingRefs: Object.freeze([bindingA, bindingB]),
  allowedLocationIds: Object.freeze(["region.eu-west"]),
  minAvailabilityBps: 9_900,
  maxP95LatencyMs: 500,
  currency: "USD",
  maxUnitCostMicros: 500,
  allowedFailoverReasons: Object.freeze(["timeout", "rate-limited"]),
});

function plan(options: { lookup?: unknown; policy?: unknown; evidence?: unknown[] } = {}) {
  return planViraCapabilitySupplyRoute({
    lookup: options.lookup ?? lookup,
    policy: options.policy ?? policy,
    evidence: options.evidence ?? [candidate(bindingA, "provider.alpha"), candidate(bindingB, "provider.beta")],
    nowEpochMs: now,
  });
}

describe("PROD-19C explicit Capability provider routing and failover", () => {
  it("builds only the explicitly ordered trusted route and does not substitute an unlisted supply", () => {
    const result = plan();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.routes.map((entry) => entry.providerId)).toEqual(["provider.alpha", "provider.beta"]);
    expect(result.value.routes.some((entry) => entry.providerId === "provider.hidden")).toBe(false);
    expect(result.value.routes[0]).not.toHaveProperty("credential");
    expect(result.value.routes[0]).not.toHaveProperty("endpoint");
    expect(result.value.routes[0]).not.toHaveProperty("execute");
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  it("advances only to the next declared binding for an explicitly allowed failure reason", () => {
    const result = plan();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(advanceViraCapabilitySupplyRoute({ plan: result.value, currentBindingRef: bindingA, reason: "timeout" }))
      .toMatchObject({ ok: true, value: { providerId: "provider.beta", bindingRef: bindingB } });
    expect(advanceViraCapabilitySupplyRoute({ plan: result.value, currentBindingRef: bindingA, reason: "provider-error" }))
      .toMatchObject({ ok: false, issue: { code: "FAILOVER_REASON_NOT_ALLOWED" } });
  });

  it("fails closed when provider trust does not bind the exact provider or has expired", () => {
    expect(plan({ evidence: [candidate(bindingA, "provider.other"), candidate(bindingB, "provider.beta")] }))
      .toMatchObject({ ok: false, issue: { code: "PROVIDER_TRUST_MISMATCH" } });
    const expired = candidate(bindingA, "provider.alpha", { trust: { ...candidate(bindingA, "provider.alpha").trust, validUntilEpochMs: now } });
    expect(plan({ evidence: [expired, candidate(bindingB, "provider.beta")] }))
      .toMatchObject({ ok: false, issue: { code: "PROVIDER_TRUST_EXPIRED" } });
  });

  it("rejects mixed enterprise scope instead of composing cross-project provider trust", () => {
    const otherScope = { ...scope, projectId: "project.other" };
    const beta = candidate(bindingB, "provider.beta", { trust: { ...candidate(bindingB, "provider.beta").trust, scope: otherScope } });
    expect(plan({ evidence: [candidate(bindingA, "provider.alpha"), beta] }))
      .toMatchObject({ ok: false, issue: { code: "SCOPE_MISMATCH" } });
  });

  it("rejects location, SLA and commercial violations instead of silently skipping the declared route", () => {
    expect(plan({ policy: { ...policy, allowedLocationIds: ["region.us-east"] } }))
      .toMatchObject({ ok: false, issue: { code: "LOCATION_NOT_ALLOWED" } });
    expect(plan({ evidence: [candidate(bindingA, "provider.alpha", { p95LatencyMs: 501 }), candidate(bindingB, "provider.beta")] }))
      .toMatchObject({ ok: false, issue: { code: "SLA_NOT_MET" } });
    expect(plan({ evidence: [candidate(bindingA, "provider.alpha", { commercial: { currency: "USD", unitCostMicros: 501 } }), candidate(bindingB, "provider.beta")] }))
      .toMatchObject({ ok: false, issue: { code: "COMMERCIAL_CONSTRAINT_NOT_MET" } });
    expect(plan({ evidence: [candidate(bindingA, "provider.alpha", { commercial: { currency: "EUR", unitCostMicros: 200 } }), candidate(bindingB, "provider.beta")] }))
      .toMatchObject({ ok: false, issue: { code: "COMMERCIAL_CONSTRAINT_NOT_MET" } });
  });

  it("rejects undeclared/duplicate route references and cannot fail over past the explicit end", () => {
    expect(plan({ policy: { ...policy, orderedBindingRefs: [bindingA, { id: "binding.missing", versionRef: "1.0.0" }] } }))
      .toMatchObject({ ok: false, issue: { code: "UNDECLARED_SUPPLY" } });
    expect(plan({ policy: { ...policy, orderedBindingRefs: [bindingA, bindingA] } }))
      .toMatchObject({ ok: false, issue: { code: "INVALID_POLICY" } });
    const result = plan();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(advanceViraCapabilitySupplyRoute({ plan: result.value, currentBindingRef: bindingB, reason: "timeout" }))
      .toMatchObject({ ok: false, issue: { code: "NO_FAILOVER_AVAILABLE" } });
  });
});
