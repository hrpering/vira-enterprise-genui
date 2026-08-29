import { describe, expect, it } from "vitest";
import { composeExperience } from "../../packages/composer/src/index.js";
import { createViraGenUI, mountExperience } from "../../packages/runtime-web/src/index.js";
import type { RuntimeWebDomPort } from "../../packages/runtime-web/src/index.js";

const capability = (id: string) => ({ version: "1", id });

function plan() {
  return {
    version: "1",
    id: "security-gate-plan",
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
              log.push(`mount:${binding.capability.id}`);
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

function directInput(allowed: string[]) {
  return {
    composition: composition(),
    plan: plan(),
    componentAdapter: componentAdapter(),
    capabilityAllowlist: { version: "1", allowed },
    accessibility: accessibility(),
    responsive: responsive(),
  };
}

function sdkConfiguration(log: string[], allowlist: { version: string; allowed: string[] }) {
  return {
    componentAdapter: componentAdapter(),
    actionAdapter: { version: "1", id: "security.web.actions", mappings: [{ event: "search.submit", actionType: "travel.flight.search.submit" }] },
    permissionPolicy: { version: "1", rules: [{ subject: "action", id: "travel.flight.search.submit", effect: "allow" }] },
    capabilityAllowlist: allowlist,
    accessibility: accessibility(),
    responsive: responsive(),
    domPort: domPort(log),
    idFactory: { nextId() { return "security-action-1"; } },
  };
}

describe("runtime-web capability security gate", () => {
  it("allows only when every RenderModel capability is explicitly allowlisted", () => {
    const log: string[] = [];
    expect(mountExperience(directInput(["select-date", "submit-search"]), domPort(log))).toMatchObject({ ok: true });
    expect(log).toEqual(["measure", "begin", "region:primary", "mount:select-date", "region:supporting", "mount:submit-search", "commit"]);
  });

  it("rejects one denied binding atomically before the DOM Port is touched", () => {
    for (const allowed of [[], ["select-date"]]) {
      const log: string[] = [];
      const result = mountExperience(directInput(allowed), domPort(log));
      expect(result).toMatchObject({ ok: false, issue: { code: "CAPABILITY_DENIED" } });
      expect(log).toEqual([]);
    }
  });

  it("proves component mappings are implementation bindings, not authorization", () => {
    const log: string[] = [];
    const result = mountExperience(directInput([]), domPort(log));
    expect(result).toMatchObject({
      ok: false,
      issue: {
        code: "CAPABILITY_DENIED",
        path: "$.render.regions[0].bindings[0].capability.id",
      },
    });
    expect(log).toEqual([]);
  });

  it("revalidates malformed direct-mount policy before any DOM access", () => {
    const log: string[] = [];
    const invalid = { ...directInput(["select-date", "submit-search"]), capabilityAllowlist: { version: "1", allowed: ["select-date", "select-date"] } };
    expect(mountExperience(invalid, domPort(log))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_CAPABILITY_ALLOWLIST", path: "$.capabilityAllowlist.allowed[1]" },
    });
    expect(log).toEqual([]);
  });

  it("requires and snapshots the SDK allowlist instead of retaining caller mutation", () => {
    const missingLog: string[] = [];
    const missing = sdkConfiguration(missingLog, { version: "1", allowed: ["select-date", "submit-search"] }) as Record<string, unknown>;
    delete missing.capabilityAllowlist;
    expect(createViraGenUI(missing)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_CAPABILITY_ALLOWLIST", path: "$.capabilityAllowlist" },
    });
    expect(missingLog).toEqual([]);

    const log: string[] = [];
    const allowlist = { version: "1", allowed: ["select-date", "submit-search"] };
    const created = createViraGenUI(sdkConfiguration(log, allowlist));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    allowlist.allowed.length = 0;
    expect(created.value.mount({ experienceId: "security-experience", plan: plan(), composition: composition() })).toMatchObject({ ok: true });
    expect(log[0]).toBe("measure");
  });

  it("surfaces SDK denial distinctly and leaves no active session or DOM effects", () => {
    const log: string[] = [];
    const created = createViraGenUI(sdkConfiguration(log, { version: "1", allowed: ["select-date"] }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.mount({ experienceId: "security-experience", plan: plan(), composition: composition() })).toMatchObject({
      ok: false,
      issue: { code: "CAPABILITY_DENIED" },
    });
    expect(log).toEqual([]);
    expect(created.value.isMounted()).toBe(false);
    expect(created.value.currentState()).toBeUndefined();
  });
});
