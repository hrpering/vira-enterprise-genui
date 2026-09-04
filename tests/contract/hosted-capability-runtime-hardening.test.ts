import { describe, expect, it } from "vitest";
import {
  VIRA_HOSTED_CAPABILITY_MAX_CONTEXTS,
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

function context(typeId = "context.refund-case", id = "case-1") {
  return {
    schemaVersion: "1",
    id,
    typeRef: { id: typeId, versionRef: "1" },
    items: [],
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    invocationId: "invocation-1",
    principal: { version: "1", kind: "user", id: "user-1", organizationId: "contoso" },
    scope: { version: "1", organizationId: "contoso", projectId: "refunds", environment: "production" },
    input: { typeRef: { id: "type.refund-query", versionRef: "1" }, value: {} },
    contexts: [context()],
    ...overrides,
  };
}

function success(extra: Record<string, unknown> = {}) {
  return {
    outcome: "success",
    output: { typeRef: { id: "type.refund-result", versionRef: "1" }, value: {} },
    ...extra,
  };
}

describe("Vira Hosted Capability Runtime v1 hardening", () => {
  it("rejects floating binding and typed-value references", async () => {
    expect(parseViraHostedCapabilityBinding(binding({
      bindingRef: { id: "binding.refund.reference", versionRef: "latest" },
    }))).toMatchObject({ ok: false, issue: { code: "FLOATING_REFERENCE" } });

    const result = await invokeViraHostedCapability(
      capability(),
      binding(),
      request({ input: { typeRef: { id: "type.refund-query", versionRef: "1.x" }, value: {} } }),
      () => success(),
    );
    expect(result).toMatchObject({ ok: false, issue: { code: "FLOATING_REFERENCE" } });
  });

  it("rejects authority, commercial, endpoint and credential smuggling fields", async () => {
    expect(parseViraHostedCapabilityBinding({
      ...binding(),
      endpoint: "https://provider.invalid",
    })).toMatchObject({ ok: false, issue: { code: "INVALID_BINDING" } });

    const requestResult = await invokeViraHostedCapability(
      capability(),
      binding(),
      { ...request(), authorized: true, entitlement: "paid" },
      () => success(),
    );
    expect(requestResult).toMatchObject({ ok: false, issue: { code: "INVALID_REQUEST" } });

    const adapterResult = await invokeViraHostedCapability(
      capability(),
      binding(),
      request(),
      () => success({ authorized: true, price: 10, currency: "USD", token: "secret" }),
    );
    expect(adapterResult).toMatchObject({ ok: false, issue: { code: "INVALID_ADAPTER_RESULT" } });
  });

  it("fails closed on accessors and custom prototypes without invoking getters", async () => {
    let getterCalls = 0;
    const malicious: Record<string, unknown> = {};
    Object.defineProperty(malicious, "version", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "1";
      },
    });
    Object.assign(malicious, {
      bindingRef: { id: "binding.refund.reference", versionRef: "1" },
      capabilityRef: { id: "refund.analysis", versionRef: "1.0.0" },
      providerId: "provider.reference",
      locationId: "eu",
    });
    expect(parseViraHostedCapabilityBinding(malicious).ok).toBe(false);
    expect(getterCalls).toBe(0);

    const custom = Object.assign(Object.create({ inherited: true }), request());
    const result = await invokeViraHostedCapability(capability(), binding(), custom, () => success());
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_REQUEST" } });
  });

  it("rejects cross-organization principals", async () => {
    const result = await invokeViraHostedCapability(
      capability(),
      binding(),
      request({ principal: { version: "1", kind: "user", id: "user-1", organizationId: "other-org" } }),
      () => success(),
    );
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_PRINCIPAL_SCOPE" } });
  });

  it("rejects duplicate WorkContext type disclosures", async () => {
    const result = await invokeViraHostedCapability(
      capability(),
      binding(),
      request({ contexts: [context("context.refund-case", "case-1"), context("context.refund-case", "case-2")] }),
      () => success(),
    );
    expect(result).toMatchObject({ ok: false, issue: { code: "DUPLICATE_CONTEXT" } });
  });

  it("enforces the hosted Context count ceiling before forwarding data", async () => {
    let calls = 0;
    const contexts = Array.from({ length: VIRA_HOSTED_CAPABILITY_MAX_CONTEXTS + 1 }, (_, index) => (
      context(`context.extra-${index}`, `ctx-${index}`)
    ));
    const result = await invokeViraHostedCapability(
      capability(),
      binding(),
      request({ contexts }),
      () => {
        calls += 1;
        return success();
      },
    );
    expect(calls).toBe(0);
    expect(result).toMatchObject({ ok: false, issue: { code: "CONTEXT_LIMIT_EXCEEDED" } });
  });

  it("rejects invalid provider and location identifiers", () => {
    expect(parseViraHostedCapabilityBinding(binding({ providerId: "not valid provider" }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_BINDING" },
    });
    expect(parseViraHostedCapabilityBinding(binding({ locationId: "not valid location" }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_BINDING" },
    });
  });

  it("rejects malformed provider failure codes and result-shape conflicts", async () => {
    const invalidCode = await invokeViraHostedCapability(capability(), binding(), request(), () => ({
      outcome: "error",
      failure: { code: "bad failure code with spaces" },
    }));
    expect(invalidCode).toMatchObject({ ok: false, issue: { code: "INVALID_ADAPTER_RESULT" } });

    const conflict = await invokeViraHostedCapability(capability(), binding(), request(), () => ({
      outcome: "empty",
      output: { typeRef: { id: "type.refund-result", versionRef: "1" }, value: {} },
    }));
    expect(conflict).toMatchObject({ ok: false, issue: { code: "INVALID_ADAPTER_RESULT" } });
  });

  it("does not retry when the adapter returns malformed output", async () => {
    let calls = 0;
    const result = await invokeViraHostedCapability(capability(), binding(), request(), () => {
      calls += 1;
      return { outcome: "success", output: { typeRef: null, value: {} } };
    });
    expect(calls).toBe(1);
    expect(result).toMatchObject({ ok: false, issue: { code: "OUTPUT_TYPE_MISMATCH" } });
  });

  it("delegates malformed CapabilityDefinition rejection to the canonical owner", async () => {
    let calls = 0;
    const result = await invokeViraHostedCapability(
      capability({ version: "latest" }),
      binding(),
      request(),
      () => {
        calls += 1;
        return success();
      },
    );
    expect(calls).toBe(0);
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_CAPABILITY" } });
  });

  it("validates action-kind identity before refusing hosted execution", async () => {
    let calls = 0;
    const action = capability({ invocation: { kind: "action", actionType: "refund.approve" } });
    const mismatch = await invokeViraHostedCapability(
      action,
      binding({ capabilityRef: { id: "refund.other", versionRef: "1.0.0" } }),
      request(),
      () => {
        calls += 1;
        return success();
      },
    );
    expect(calls).toBe(0);
    expect(mismatch).toMatchObject({ ok: false, issue: { code: "CAPABILITY_MISMATCH" } });

    const refused = await invokeViraHostedCapability(action, binding(), request(), () => {
      calls += 1;
      return success();
    });
    expect(calls).toBe(0);
    expect(refused).toMatchObject({ ok: false, issue: { code: "ACTION_BOUNDARY_REQUIRED" } });
  });
});
