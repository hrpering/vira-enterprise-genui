import { describe, expect, it } from "vitest";
import { composeExperience } from "../../packages/composer/src/index.js";
import { mountExperience } from "../../packages/runtime-web/src/index.js";
import type {
  RuntimeWebDomComponentHandle,
  RuntimeWebDomPort,
  RuntimeWebDomRegion,
  RuntimeWebDomRoot,
} from "../../packages/runtime-web/src/index.js";

const capability = (id: string) => ({ version: "1", id });
const disclosure = { primary: "immediate", supporting: "progressive", deferred: "on-demand" };

function plan() {
  return {
    version: "1",
    id: "plan-1",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: {},
    capabilities: {
      required: [capability("select-date")],
      available: [capability("submit-search")],
      future: [],
    },
  };
}

function componentAdapter() {
  return {
    version: "1",
    id: "acme.web.components",
    mappings: [
      { capability: capability("select-date"), component: "acme.component.date-picker" },
      { capability: capability("submit-search"), component: "acme.component.search-button" },
    ],
  };
}

function input() {
  const composition = composeExperience({ plan: plan(), layout: { family: "flow" }, disclosure });
  if (!composition.ok) throw new Error(composition.issue.message);
  return { composition: composition.value, plan: plan(), componentAdapter: componentAdapter() };
}

function host(log: string[], failComponent?: string, failCommit = false): RuntimeWebDomPort {
  return {
    begin(model) {
      log.push(`begin:${model.planId}`);
      const root: RuntimeWebDomRoot = {
        createRegion(region) {
          log.push(`region:${region.id}`);
          const domRegion: RuntimeWebDomRegion = {
            mountComponent(binding) {
              log.push(`mount:${binding.component}`);
              if (binding.component === failComponent) throw new Error("SECRET_HOST_EXCEPTION");
              const handle: RuntimeWebDomComponentHandle = {
                dispose() {
                  log.push(`dispose:${binding.component}`);
                },
              };
              return handle;
            },
          };
          return domRegion;
        },
        commit() {
          log.push("commit");
          if (failCommit) throw new Error("SECRET_COMMIT_EXCEPTION");
        },
        dispose() {
          log.push("dispose:root");
        },
      };
      return root;
    },
  };
}

describe("runtime-web DOM lifecycle", () => {
  it("mounts in semantic order, commits after all mounts, and disposes in reverse order", () => {
    const log: string[] = [];
    const result = mountExperience(input(), host(log));
    expect(result.ok).toBe(true);
    expect(log).toEqual([
      "begin:plan-1",
      "region:primary",
      "mount:acme.component.date-picker",
      "region:supporting",
      "mount:acme.component.search-button",
      "commit",
    ]);
    if (!result.ok) return;
    result.value.dispose();
    result.value.dispose();
    expect(log).toEqual([
      "begin:plan-1",
      "region:primary",
      "mount:acme.component.date-picker",
      "region:supporting",
      "mount:acme.component.search-button",
      "commit",
      "dispose:acme.component.search-button",
      "dispose:acme.component.date-picker",
      "dispose:root",
    ]);
  });

  it("rolls back a partial mount and never commits", () => {
    const log: string[] = [];
    const result = mountExperience(input(), host(log, "acme.component.search-button"));
    expect(result).toEqual({
      ok: false,
      issue: { code: "DOM_MOUNT_FAILED", path: "$", message: "DOM host failed while mounting experience" },
    });
    expect(log).toEqual([
      "begin:plan-1",
      "region:primary",
      "mount:acme.component.date-picker",
      "region:supporting",
      "mount:acme.component.search-button",
      "dispose:acme.component.date-picker",
      "dispose:root",
    ]);
    if (!result.ok) expect(result.issue.message).not.toContain("SECRET_HOST_EXCEPTION");
  });

  it("rolls back all mounted components if commit fails", () => {
    const log: string[] = [];
    const result = mountExperience(input(), host(log, undefined, true));
    expect(result).toMatchObject({ ok: false, issue: { code: "DOM_MOUNT_FAILED" } });
    expect(log.slice(-3)).toEqual([
      "dispose:acme.component.search-button",
      "dispose:acme.component.date-picker",
      "dispose:root",
    ]);
    if (!result.ok) expect(result.issue.message).not.toContain("SECRET_COMMIT_EXCEPTION");
  });

  it("does not call the DOM Port when render preparation fails", () => {
    const log: string[] = [];
    const invalid = input();
    invalid.componentAdapter.mappings = [];
    expect(mountExperience(invalid, host(log))).toMatchObject({ ok: false, issue: { code: "INVALID_RENDER_INPUT" } });
    expect(log).toEqual([]);
  });
});
