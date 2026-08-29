import { describe, expect, it } from "vitest";
import { composeExperience } from "../../packages/composer/src/index.js";
import { createViraGenUI, mountExperience } from "../../packages/runtime-web/src/index.js";
import type { RuntimeWebDomPort } from "../../packages/runtime-web/src/index.js";

const capability = (id: string) => ({ version: "1", id });

function plan() {
  return {
    version: "1",
    id: "component-security-gate-plan",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: {},
    capabilities: {
      required: [capability("select-date")],
      available: [capability("submit-search")],
      future: [],
    },
  };
}

function composition() {
  const result = composeExperience({
    plan: plan(),
    layout: { family: "flow" },
    disclosure: { primary: "immediate", supporting: "progressive", deferred: "on-demand" },
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

function componentAdapter() {
  return {
    version: "1",
    id: "security.web.components",
    mappings: [
      { capability: capability("select-date"), component: "security.component.date-picker" },
      { capability: capability("submit-search"), component: "security.component.search-button" },
    ],
  };
}

function capabilityAllowlist(allowed = ["select-date", "submit-search"]) {
  return { version: "1", allowed };
}

function componentAllowlist(allowed = ["security.component.date-picker", "security.component.search-button"]) {
  return { version: "1", allowed };
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
  return { version: "1", strategy: "container", bands: [{ id: "compact", minInlineSizePx: 0 }] };
}

function domPort(log: string[]): RuntimeWebDomPort {
  return {
    measureContainerInlineSizePx() { log.push("measure"); return 320; },
    begin() {
      log.push("begin");
      return {
        createRegion(region) {
          log.push(`region:${region.id}`);
          return {
            mountComponent(binding) {
              log.push(`mount:${binding.component}`);
              return { dispose() {} };
            },
          };
        },
        commit() { log.push("commit"); },
        dispose() {},
      };
    },
  };
}

function directInput(
  capabilityAllowed = ["select-date", "submit-search"],
  componentAllowed = ["security.component.date-picker", "security.component.search-button"],
) {
  return {
    composition: composition(),
    plan: plan(),
    componentAdapter: componentAdapter(),
    capabilityAllowlist: capabilityAllowlist(capabilityAllowed),
    componentAllowlist: componentAllowlist(componentAllowed),
    accessibility: accessibility(),
    responsive: responsive(),
  };
}

function sdkConfiguration(
  log: string[],
  componentPolicy: { version: string; allowed: string[] },
  capabilityPolicy = capabilityAllowlist(),
) {
  return {
    componentAdapter: componentAdapter(),
    actionAdapter: {
      version: "1",
      id: "security.web.actions",
      mappings: [{ event: "search.submit", actionType: "travel.flight.search.submit" }],
    },
    permissionPolicy: {
      version: "1",
      rules: [{ subject: "action", id: "travel.flight.search.submit", effect: "allow" }],
    },
    capabilityAllowlist: capabilityPolicy,
    componentAllowlist: componentPolicy,
    accessibility: accessibility(),
    responsive: responsive(),
    domPort: domPort(log),
    idFactory: { nextId() { return "component-security-action-1"; } },
  };
}

describe("runtime-web component security gate", () => {
  it("mounts only when every capability and resolved component is explicitly authorized", () => {
    const log: string[] = [];
    expect(mountExperience(directInput(), domPort(log))).toMatchObject({ ok: true });
    expect(log).toEqual([
      "measure",
      "begin",
      "region:primary",
      "mount:security.component.date-picker",
      "region:supporting",
      "mount:security.component.search-button",
      "commit",
    ]);
  });

  it("rejects one denied component atomically before any DOM Port method", () => {
    for (const allowed of [[], ["security.component.date-picker"]]) {
      const log: string[] = [];
      expect(mountExperience(directInput(undefined, allowed), domPort(log))).toMatchObject({
        ok: false,
        issue: { code: "COMPONENT_DENIED" },
      });
      expect(log).toEqual([]);
    }
  });

  it("proves a valid Component Adapter mapping is implementation, not authorization", () => {
    const log: string[] = [];
    expect(mountExperience(directInput(undefined, []), domPort(log))).toMatchObject({
      ok: false,
      issue: {
        code: "COMPONENT_DENIED",
        path: "$.render.regions[0].bindings[0].component",
      },
    });
    expect(log).toEqual([]);
  });

  it("revalidates malformed direct-mount component policy before DOM access", () => {
    const log: string[] = [];
    const invalid = {
      ...directInput(),
      componentAllowlist: {
        version: "1",
        allowed: ["security.component.date-picker", "security.component.date-picker"],
      },
    };
    expect(mountExperience(invalid, domPort(log))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_COMPONENT_ALLOWLIST", path: "$.componentAllowlist.allowed[1]" },
    });
    expect(log).toEqual([]);
  });

  it("gives capability authorization deterministic priority over component authorization", () => {
    const log: string[] = [];
    expect(mountExperience(directInput([], []), domPort(log))).toMatchObject({
      ok: false,
      issue: { code: "CAPABILITY_DENIED" },
    });
    expect(log).toEqual([]);
  });

  it("requires and snapshots SDK component policy instead of retaining caller mutation", () => {
    const missingLog: string[] = [];
    const missing = sdkConfiguration(missingLog, componentAllowlist()) as Record<string, unknown>;
    delete missing.componentAllowlist;
    expect(createViraGenUI(missing)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_COMPONENT_ALLOWLIST", path: "$.componentAllowlist" },
    });
    expect(missingLog).toEqual([]);

    const log: string[] = [];
    const policy = componentAllowlist();
    const created = createViraGenUI(sdkConfiguration(log, policy));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    policy.allowed.length = 0;
    expect(created.value.mount({
      experienceId: "component-security-experience",
      plan: plan(),
      composition: composition(),
    })).toMatchObject({ ok: true });
    expect(log[0]).toBe("measure");
  });

  it("surfaces SDK component denial distinctly and leaves no active session or DOM effects", () => {
    const log: string[] = [];
    const created = createViraGenUI(sdkConfiguration(log, componentAllowlist(["security.component.date-picker"])));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.mount({
      experienceId: "component-security-experience",
      plan: plan(),
      composition: composition(),
    })).toMatchObject({
      ok: false,
      issue: { code: "COMPONENT_DENIED" },
    });
    expect(log).toEqual([]);
    expect(created.value.isMounted()).toBe(false);
    expect(created.value.currentState()).toBeUndefined();
  });
});
