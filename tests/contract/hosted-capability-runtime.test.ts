import { describe, expect, it } from "vitest";
import {
  invokeViraHostedCapability,
  parseViraHostedCapabilityBinding,
} from "../../packages/hosted-capability-runtime/src/index.js";

function capability(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1",
    id: "refund.analysis",
    version: "1.0.0",
    publisher: { id: "demo", name: "Demo" },
    metadata: { name: "Refund analysis" },
    input: { typeRef: { id: "type.refund-query", versionRef: "1" } },
    output: { typeRef: { id: "type.refund-result", versionRef: "1" } },
    contextRequirements: [{ id: "context.refund-case", versionRef: "1" }],
    invocation: { kind: "query" as const },
    ...overrides,
  };
}

function binding(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    bindingRef: { id: "binding.refund.reference", versionRef: "1" },
    capabilityRef: { id: "refund.analysis", versionRef: "1.0.0" },
    providerId: "provider.reference",
    locationId: "eu",
    ...overrides,
  };
}

function context(typeRef = { id: "context.refund-case", versionRef: "1" }, id = "case-1") {
  return {
    schemaVersion: "1",
    id,
    typeRef,
    items: [
      {
        id: "claim",
        kind: "state",
        typeRef: null,
        value: { amount: 125 },
        provenance: { sourceRefs: [], observedAtUnixMs: null },
      },
    ],
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    invocationId: "invocation-1",
    principal: { version: "1", kind: "user", id: "user-1", organizationId: "contoso" },
    scope: { version: "1", organizationId: "contoso", projectId: "refunds", environment: "production" },
    input: {
      typeRef: { id: "type.refund-query", versionRef: "1" },
      value: { question: "analyze" },
    },
    contexts: [context()],
    ...overrides,
  };
}

function success(value: unknown = { approvedAmount: 100 }) {
  return {
    outcome: "success",
    output: {
      typeRef: { id: "type.refund-result", versionRef: "1" },
      value,
    },
  };
}

describe("Vira Hosted Capability Runtime v1", () => {
  it("parses exact provider-neutral hosted bindings", () => {
    const result = parseViraHostedCapabilityBinding(binding());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(binding());
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.bindingRef)).toBe(true);
    expect(Object.isFrozen(result.value.capabilityRef)).toBe(true);
  });

  it("executes a canonical query Capability once and returns non-authority evidence", async () => {
    let calls = 0;
    const result = await invokeViraHostedCapability(capability(), binding(), request(), (input) => {
      calls += 1;
      expect(input.capability.id).toBe("refund.analysis");
      expect(input.binding.providerId).toBe("provider.reference");
      expect(input.principal.organizationId).toBe("contoso");
      expect(input.scope.projectId).toBe("refunds");
      expect(input.contexts).toHaveLength(1);
      expect(Object.isFrozen(input.contexts)).toBe(true);
      expect(Object.isFrozen(input.input)).toBe(true);
      expect(Object.isFrozen(input.input.value)).toBe(true);
      return success();
    });

    expect(calls).toBe(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      version: "1",
      invocationId: "invocation-1",
      capabilityRef: { id: "refund.analysis", versionRef: "1.0.0" },
      bindingRef: { id: "binding.refund.reference", versionRef: "1" },
      providerId: "provider.reference",
      locationId: "eu",
      outcome: "success",
      output: {
        typeRef: { id: "type.refund-result", versionRef: "1" },
        value: { approvedAmount: 100 },
      },
    });
    expect("authorized" in result.value).toBe(false);
    expect("allow" in result.value).toBe(false);
    expect("entitled" in result.value).toBe(false);
    expect("charge" in result.value).toBe(false);
  });

  it("supports explicit empty provider outcomes without inventing output", async () => {
    const result = await invokeViraHostedCapability(capability(), binding(), request(), () => ({ outcome: "empty" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ outcome: "empty" });
    expect("output" in result.value).toBe(false);
    expect("failure" in result.value).toBe(false);
  });

  it("preserves bounded provider error evidence without converting it to governance", async () => {
    const result = await invokeViraHostedCapability(capability(), binding(), request(), () => ({
      outcome: "error",
      failure: { code: "UPSTREAM_TIMEOUT" },
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ outcome: "error", failure: { code: "UPSTREAM_TIMEOUT" } });
    expect("deny" in result.value).toBe(false);
  });

  it("never sends action Capabilities to the hosted query adapter", async () => {
    let calls = 0;
    const actionCapability = capability({ invocation: { kind: "action", actionType: "refund.approve" } });
    const result = await invokeViraHostedCapability(actionCapability, binding(), request(), () => {
      calls += 1;
      return success();
    });
    expect(calls).toBe(0);
    expect(result).toMatchObject({ ok: false, issue: { code: "ACTION_BOUNDARY_REQUIRED" } });
  });

  it("requires the hosted binding to target the exact Capability id and version", async () => {
    const wrongVersion = await invokeViraHostedCapability(
      capability(),
      binding({ capabilityRef: { id: "refund.analysis", versionRef: "2.0.0" } }),
      request(),
      () => success(),
    );
    expect(wrongVersion).toMatchObject({ ok: false, issue: { code: "CAPABILITY_MISMATCH" } });
  });

  it("requires every declared WorkContext type exactly once", async () => {
    const multi = capability({
      contextRequirements: [
        { id: "context.refund-case", versionRef: "1" },
        { id: "context.customer", versionRef: "1" },
      ],
    });
    const result = await invokeViraHostedCapability(
      multi,
      binding(),
      request({
        contexts: [
          context({ id: "context.customer", versionRef: "1" }, "customer-1"),
          context({ id: "context.refund-case", versionRef: "1" }, "case-1"),
        ],
      }),
      (input) => {
        expect(input.contexts.map((item) => item.typeRef.id)).toEqual([
          "context.customer",
          "context.refund-case",
        ]);
        return success();
      },
    );
    expect(result.ok).toBe(true);
  });

  it("fails closed when a required Context is missing", async () => {
    const result = await invokeViraHostedCapability(capability(), binding(), request({ contexts: [] }), () => success());
    expect(result).toMatchObject({ ok: false, issue: { code: "MISSING_CONTEXT" } });
  });

  it("rejects undeclared extra Context instead of forwarding ambient data", async () => {
    const result = await invokeViraHostedCapability(
      capability(),
      binding(),
      request({ contexts: [context(), context({ id: "context.chat-history", versionRef: "1" }, "chat-1")] }),
      () => success(),
    );
    expect(result).toMatchObject({ ok: false, issue: { code: "UNDECLARED_CONTEXT" } });
  });

  it("requires exact input and output type references", async () => {
    const badInput = await invokeViraHostedCapability(
      capability(),
      binding(),
      request({ input: { typeRef: { id: "type.other", versionRef: "1" }, value: {} } }),
      () => success(),
    );
    expect(badInput).toMatchObject({ ok: false, issue: { code: "INPUT_TYPE_MISMATCH" } });

    const badOutput = await invokeViraHostedCapability(capability(), binding(), request(), () => ({
      outcome: "success",
      output: { typeRef: { id: "type.other", versionRef: "1" }, value: {} },
    }));
    expect(badOutput).toMatchObject({ ok: false, issue: { code: "OUTPUT_TYPE_MISMATCH" } });
  });

  it("turns adapter throws/rejections into explicit failure without retry", async () => {
    let calls = 0;
    const result = await invokeViraHostedCapability(capability(), binding(), request(), async () => {
      calls += 1;
      throw new Error("provider exploded");
    });
    expect(calls).toBe(1);
    expect(result).toMatchObject({ ok: false, issue: { code: "ADAPTER_FAILED" } });
  });
});
