import { describe, expect, it } from "vitest";
import {
  parseViraApplicationProtocolProjection,
  serializeViraApplicationProtocolProjection,
} from "../../packages/application-protocol-projection/src/index.js";

const DIGEST = "b".repeat(64);
const PROJECTION = { id: "protocol.mcp-apps", versionRef: "1" } as const;

function application() {
  return {
    schemaVersion: "1",
    identity: { id: "vira.flight-assistant" },
    version: "1.2.0",
    publisher: { id: "vira", name: "Vira" },
    experiences: [{
      id: "travel.flight.search",
      packId: "vira/flight-booking",
      packVersion: "2.1.0",
      entrypoint: "main",
    }],
    capabilities: [{ id: "travel.flight.search-capability", versionRef: "1" }],
    contextTypes: [{ id: "travel.flight.work-context", versionRef: "1" }],
    actions: [{ actionType: "travel.flight.book" }],
    flows: [{ id: "travel.flight.booking-flow", versionRef: "1" }],
    brandRef: { id: "brand.vira", versionRef: "1" },
    governanceRequirements: [{ id: "governance.booking-approval", versionRef: "1" }],
    hostCompatibility: {
      minViraVersion: "1.0.0",
      maxViraVersion: "2.0.0",
      requiredCapabilities: ["host.date-picker"],
    },
    protocolProjections: [PROJECTION],
    distribution: {
      name: "Flight Assistant",
      description: "A governed flight application.",
      tags: ["travel", "booking"],
      visibility: "public",
      discoverable: true,
    },
    commercial: {
      entitlementRefs: [{ id: "entitlement.flight-assistant", versionRef: "1" }],
      meteringRefs: [{ id: "metering.flight-assistant", versionRef: "1" }],
    },
  };
}

function source() {
  return {
    schemaVersion: "1",
    application: application(),
    integrity: { algorithm: "sha256", digest: DIGEST },
  };
}

function artifact(result: unknown = { fidelity: "lossless", payload: { type: "app", version: 1 } }) {
  return {
    schemaVersion: "1",
    source: source(),
    projectionRef: PROJECTION,
    result,
  };
}

describe("Vira Application Protocol Projection v1", () => {
  it("parses a declared lossless projection into detached deeply frozen data", () => {
    const input = artifact();
    const parsed = parseViraApplicationProtocolProjection(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).not.toBe(input);
    expect(parsed.value.source).not.toBe(input.source);
    expect(parsed.value.projectionRef).toEqual(PROJECTION);
    expect(parsed.value.result).toMatchObject({ fidelity: "lossless" });
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.source)).toBe(true);
    expect(Object.isFrozen(parsed.value.result)).toBe(true);
    if (parsed.value.result.fidelity === "lossless") {
      expect(Object.isFrozen(parsed.value.result.payload)).toBe(true);
    }
  });

  it("requires projectionRef to exactly match a projection declared by the source Application", () => {
    expect(parseViraApplicationProtocolProjection({
      ...artifact(),
      projectionRef: { id: "protocol.a2ui", versionRef: "1" },
    })).toMatchObject({
      ok: false,
      issue: { code: "UNDECLARED_PROJECTION", path: "$.projectionRef" },
    });

    expect(parseViraApplicationProtocolProjection({
      ...artifact(),
      projectionRef: { id: PROJECTION.id, versionRef: "latest" },
    })).toMatchObject({
      ok: false,
      issue: { code: "UNDECLARED_PROJECTION", path: "$.projectionRef" },
    });
  });

  it("delegates source Application Distribution validation and preserves the owner failure code", () => {
    const input = artifact();
    input.source.integrity.digest = "B".repeat(64);
    expect(parseViraApplicationProtocolProjection(input)).toMatchObject({
      ok: false,
      issue: {
        code: "INVALID_SOURCE",
        distributionCode: "INVALID_INTEGRITY",
        path: "$.source.integrity.digest",
      },
    });
  });

  it("accepts lossy projection only with explicit canonical Application loss paths", () => {
    const parsed = parseViraApplicationProtocolProjection(artifact({
      fidelity: "lossy",
      payload: { screen: "flight" },
      losses: [
        { path: "$.application.actions[0]", reason: "Target protocol cannot represent governed actions." },
        { path: "$.application.governanceRequirements[0]", reason: "Target protocol has no equivalent governance declaration." },
      ],
    }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.value.result.fidelity !== "lossy") return;
    expect(parsed.value.result.losses).toHaveLength(2);
    expect(parsed.value.result.losses[0]?.path).toBe("$.application.actions[0]");
  });

  it("rejects empty, duplicate, unbounded or non-Application loss paths", () => {
    expect(parseViraApplicationProtocolProjection(artifact({
      fidelity: "lossy",
      payload: {},
      losses: [],
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_LOSSES" } });

    expect(parseViraApplicationProtocolProjection(artifact({
      fidelity: "lossy",
      payload: {},
      losses: [
        { path: "$.application.actions[0]", reason: "first" },
        { path: "$.application.actions[0]", reason: "second" },
      ],
    }))).toMatchObject({ ok: false, issue: { code: "DUPLICATE_LOSS" } });

    expect(parseViraApplicationProtocolProjection(artifact({
      fidelity: "lossy",
      payload: {},
      losses: [{ path: "$.runtime.state", reason: "not semantic" }],
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_LOSS_PATH" } });
  });

  it("requires unsupported projections to carry reason only and no payload", () => {
    const accepted = parseViraApplicationProtocolProjection(artifact({
      fidelity: "unsupported",
      reason: "The target protocol cannot represent the required semantic surface.",
    }));
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(accepted.value.result).toEqual({
      fidelity: "unsupported",
      reason: "The target protocol cannot represent the required semantic surface.",
    });

    expect(parseViraApplicationProtocolProjection(artifact({
      fidelity: "unsupported",
      reason: "unsupported",
      payload: { execute: true },
    }))).toMatchObject({ ok: false, issue: { code: "UNKNOWN_FIELD", path: "$.result.payload" } });
  });

  it("rejects silent loss claims and unknown fidelity variants", () => {
    expect(parseViraApplicationProtocolProjection(artifact({
      fidelity: "lossless",
      payload: {},
      losses: [{ path: "$.application.actions[0]", reason: "hidden loss" }],
    }))).toMatchObject({ ok: false, issue: { code: "UNKNOWN_FIELD", path: "$.result.losses" } });

    expect(parseViraApplicationProtocolProjection(artifact({
      fidelity: "partial",
      payload: {},
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_FIDELITY", path: "$.result.fidelity" } });
  });

  it("rejects transport, provider, credential and execution authority smuggling", () => {
    for (const field of ["url", "endpoint", "transport", "provider", "credential", "execute", "authorize", "deploy"]) {
      expect(parseViraApplicationProtocolProjection({ ...artifact(), [field]: "forbidden" })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }

    expect(parseViraApplicationProtocolProjection(artifact({
      fidelity: "lossless",
      payload: {},
      execute: true,
    }))).toMatchObject({ ok: false, issue: { code: "UNKNOWN_FIELD", path: "$.result.execute" } });
  });

  it("does not duplicate Application distribution, compatibility or protocol metadata at projection root", () => {
    for (const field of ["distribution", "hostCompatibility", "protocolProjections", "commercial"]) {
      expect(parseViraApplicationProtocolProjection({ ...artifact(), [field]: {} })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
  });

  it("serializes deterministically across payload key order and lossy loss input order", () => {
    const first = serializeViraApplicationProtocolProjection(artifact({
      fidelity: "lossy",
      payload: { z: 1, a: { y: 2, x: 3 } },
      losses: [
        { path: "$.application.governanceRequirements[0]", reason: "governance loss" },
        { path: "$.application.actions[0]", reason: "action loss" },
      ],
    }));
    const second = serializeViraApplicationProtocolProjection(artifact({
      fidelity: "lossy",
      payload: { a: { x: 3, y: 2 }, z: 1 },
      losses: [
        { path: "$.application.actions[0]", reason: "action loss" },
        { path: "$.application.governanceRequirements[0]", reason: "governance loss" },
      ],
    }));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value).toBe(second.value);
  });

  it("preserves prototype-sensitive payload names as inert protocol data", () => {
    const payload = JSON.parse('{"__proto__":{"polluted":true},"safe":1}') as unknown;
    const parsed = parseViraApplicationProtocolProjection(artifact({ fidelity: "lossless", payload }));
    expect(parsed.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const serialized = serializeViraApplicationProtocolProjection(artifact({ fidelity: "lossless", payload }));
    expect(serialized.ok).toBe(true);
    if (serialized.ok) expect(serialized.value).toContain('"__proto__"');
  });

  it("fails closed on unsafe accessors and custom-prototype inputs", () => {
    const accessor = artifact() as Record<string, unknown>;
    Object.defineProperty(accessor, "transport", {
      enumerable: true,
      get() {
        throw new Error("must not execute");
      },
    });
    expect(parseViraApplicationProtocolProjection(accessor)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT" },
    });

    const custom = Object.assign(Object.create({ inherited: true }) as Record<string, unknown>, artifact());
    expect(parseViraApplicationProtocolProjection(custom)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT" },
    });
  });

  it("does not claim source integrity verification or execution authority in the artifact shape", () => {
    const parsed = parseViraApplicationProtocolProjection(artifact());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(Object.keys(parsed.value).sort()).toEqual(["projectionRef", "result", "schemaVersion", "source"]);
    expect("verified" in parsed.value).toBe(false);
    expect("execute" in parsed.value).toBe(false);
  });
});
