import { describe, expect, it } from "vitest";
import { createWebSdkConfiguration } from "../../packages/runtime-web/src/index.js";

const capability = (id: string) => ({ version: "1", id });

function componentAdapter() {
  return {
    version: "1",
    id: "acme.web.components",
    mappings: [{ capability: capability("submit-search"), component: "acme.component.search-button" }],
  };
}

function actionAdapter() {
  return {
    version: "1",
    id: "acme.web.actions",
    mappings: [{ event: "search.submit", actionType: "travel.flight.search.submit" }],
  };
}

function permissionPolicy() {
  return {
    version: "1",
    rules: [{ subject: "action", id: "travel.flight.search.submit", effect: "allow" }],
  };
}

function capabilityAllowlist() {
  return { version: "1", allowed: ["submit-search"] };
}

function accessibility() {
  return {
    version: "1",
    focusOnMount: "first-primary",
    focusOnUpdate: "primary-if-lost",
    statusAnnouncements: "polite",
    errorAnnouncements: "assertive",
  };
}

function responsive() {
  return {
    version: "1",
    strategy: "container",
    bands: [{ id: "compact", minInlineSizePx: 0 }],
  };
}

function config(overrides: Record<string, unknown> = {}) {
  return {
    componentAdapter: componentAdapter(),
    actionAdapter: actionAdapter(),
    permissionPolicy: permissionPolicy(),
    capabilityAllowlist: capabilityAllowlist(),
    accessibility: accessibility(),
    responsive: responsive(),
    domPort: {
      measureContainerInlineSizePx() { return 320; },
      begin() { throw new Error("not invoked during configuration"); },
    },
    idFactory: {
      nextId() { return "action-1"; },
    },
    ...overrides,
  };
}

describe("runtime-web public Web SDK configuration", () => {
  it("normalizes data owners and freezes the configuration without executing trusted methods", () => {
    let measureCalls = 0;
    let beginCalls = 0;
    let idCalls = 0;
    const input = config({
      domPort: {
        measureContainerInlineSizePx() { measureCalls += 1; return 320; },
        begin() { beginCalls += 1; throw new Error("not used"); },
      },
      idFactory: {
        nextId() { idCalls += 1; return "action-1"; },
      },
    });
    const result = createWebSdkConfiguration(input);
    expect(result.ok).toBe(true);
    expect({ measureCalls, beginCalls, idCalls }).toEqual({ measureCalls: 0, beginCalls: 0, idCalls: 0 });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.componentAdapter)).toBe(true);
    expect(Object.isFrozen(result.value.actionAdapter)).toBe(true);
    expect(Object.isFrozen(result.value.permissionPolicy)).toBe(true);
    expect(Object.isFrozen(result.value.capabilityAllowlist)).toBe(true);
    expect(Object.isFrozen(result.value.capabilityAllowlist.allowed)).toBe(true);
    expect(Object.isFrozen(result.value.accessibility)).toBe(true);
    expect(Object.isFrozen(result.value.responsive)).toBe(true);
    expect(Object.isFrozen(result.value.domPort)).toBe(true);
    expect(Object.isFrozen(result.value.idFactory)).toBe(true);
  });

  it("snapshots trusted methods instead of following later caller method replacement", () => {
    const host = {
      measureContainerInlineSizePx() { return 320; },
      begin() { return { createRegion() { throw new Error("unused"); }, commit() {}, dispose() {} }; },
    };
    const ids = { nextId() { return "original-id"; } };
    const result = createWebSdkConfiguration(config({ domPort: host, idFactory: ids }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    host.measureContainerInlineSizePx = () => 999;
    ids.nextId = () => "replacement-id";
    expect(result.value.domPort.measureContainerInlineSizePx()).toBe(320);
    expect(result.value.idFactory.nextId()).toBe("original-id");
  });

  it("normalizes caller-owned data instead of retaining mutable configuration references", () => {
    const components = componentAdapter();
    const actions = actionAdapter();
    const policy = permissionPolicy();
    const allowlist = capabilityAllowlist();
    const a11y = accessibility();
    const responsivePolicy = responsive();
    const result = createWebSdkConfiguration(config({
      componentAdapter: components,
      actionAdapter: actions,
      permissionPolicy: policy,
      capabilityAllowlist: allowlist,
      accessibility: a11y,
      responsive: responsivePolicy,
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    components.mappings[0]!.component = "mutated.component.ref";
    actions.mappings[0]!.actionType = "admin.delete";
    policy.rules[0]!.effect = "deny";
    allowlist.allowed[0] = "admin.delete";
    a11y.errorAnnouncements = "polite";
    responsivePolicy.bands[0]!.id = "mutated";

    expect(result.value.componentAdapter.mappings[0]?.component).toBe("acme.component.search-button");
    expect(result.value.actionAdapter.mappings[0]?.actionType).toBe("travel.flight.search.submit");
    expect(result.value.permissionPolicy.rules[0]?.effect).toBe("allow");
    expect(result.value.capabilityAllowlist.allowed).toEqual(["submit-search"]);
    expect(result.value.accessibility.errorAnnouncements).toBe("assertive");
    expect(result.value.responsive.bands[0]?.id).toBe("compact");
  });

  it("rejects malformed owner configs at their public paths", () => {
    expect(createWebSdkConfiguration(config({ componentAdapter: { ...componentAdapter(), mappings: [] } }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_COMPONENT_ADAPTER", path: "$.componentAdapter.mappings" },
    });
    expect(createWebSdkConfiguration(config({ capabilityAllowlist: { version: "1", allowed: ["submit-search", "submit-search"] } }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_CAPABILITY_ALLOWLIST", path: "$.capabilityAllowlist.allowed[1]" },
    });
    expect(createWebSdkConfiguration(config({ accessibility: { ...accessibility(), errorAnnouncements: "off" } }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ACCESSIBILITY_POLICY", path: "$.accessibility.errorAnnouncements" },
    });
    expect(createWebSdkConfiguration(config({ responsive: { ...responsive(), strategy: "viewport" } }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_RESPONSIVE_POLICY", path: "$.responsive.strategy" },
    });
  });

  it("rejects getter-backed trusted methods without executing getters", () => {
    let calls = 0;
    const domPort: Record<string, unknown> = {
      begin() { throw new Error("unused"); },
    };
    Object.defineProperty(domPort, "measureContainerInlineSizePx", {
      enumerable: true,
      get() {
        calls += 1;
        return () => 320;
      },
    });
    expect(createWebSdkConfiguration(config({ domPort }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_DOM_PORT", path: "$.domPort" },
    });
    expect(calls).toBe(0);
  });

  it("rejects unknown root fields", () => {
    expect(createWebSdkConfiguration({ ...config(), network: "forbidden" })).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.network" },
    });
  });
});