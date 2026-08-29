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

function capabilityAllowlist() {
  return { version: "1", allowed: ["select-date", "submit-search"] };
}

function componentAllowlist() {
  return { version: "1", allowed: ["acme.component.date-picker", "acme.component.search-button"] };
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
    bands: [
      { id: "compact", minInlineSizePx: 0 },
      { id: "regular", minInlineSizePx: 420 },
      { id: "wide", minInlineSizePx: 760 },
    ],
  };
}

function input() {
  const composition = composeExperience({ plan: plan(), layout: { family: "flow" }, disclosure });
  if (!composition.ok) throw new Error(composition.issue.message);
  return {
    composition: composition.value,
    plan: plan(),
    componentAdapter: componentAdapter(),
    capabilityAllowlist: capabilityAllowlist(),
    componentAllowlist: componentAllowlist(),
    accessibility: accessibility(),
    responsive: responsive(),
  };
}

interface HostOptions {
  readonly inlineSizePx?: number;
  readonly failMeasure?: boolean;
  readonly failComponent?: string;
  readonly failCommit?: boolean;
}

function host(log: string[], options: HostOptions = {}): RuntimeWebDomPort {
  return {
    measureContainerInlineSizePx() {
      log.push("measure");
      if (options.failMeasure) throw new Error("SECRET_MEASURE_EXCEPTION");
      return options.inlineSizePx ?? 500;
    },
    begin(context) {
      log.push(`begin:${context.planId}:${context.responsiveBand.id}:${context.accessibility.focusOnMount}`);
      const root: RuntimeWebDomRoot = {
        createRegion(region) {
          log.push(`region:${region.id}`);
          const domRegion: RuntimeWebDomRegion = {
            mountComponent(binding) {
              log.push(`mount:${binding.component}`);
              if (binding.component === options.failComponent) throw new Error("SECRET_HOST_EXCEPTION");
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
          if (options.failCommit) throw new Error("SECRET_COMMIT_EXCEPTION");
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
  it("mounts with mandatory accessibility + resolved container band and preserves transaction ordering", () => {
    const log: string[] = [];
    const result = mountExperience(input(), host(log));
    expect(result.ok).toBe(true);
    expect(log).toEqual([
      "measure",
      "begin:plan-1:regular:first-primary",
      "region:primary",
      "mount:acme.component.date-picker",
      "region:supporting",
      "mount:acme.component.search-button",
      "commit",
    ]);
    if (!result.ok) return;
    result.value.dispose();
    result.value.dispose();
    expect(log.slice(-3)).toEqual([
      "dispose:acme.component.search-button",
      "dispose:acme.component.date-picker",
      "dispose:root",
    ]);
  });

  it("resolves responsive bands from container measurements before begin", () => {
    const compact: string[] = [];
    expect(mountExperience(input(), host(compact, { inlineSizePx: 320 })).ok).toBe(true);
    expect(compact[1]).toBe("begin:plan-1:compact:first-primary");

    const wide: string[] = [];
    expect(mountExperience(input(), host(wide, { inlineSizePx: 900 })).ok).toBe(true);
    expect(wide[1]).toBe("begin:plan-1:wide:first-primary");
  });

  it("does not touch the DOM Port for invalid render, accessibility, or responsive input", () => {
    for (const invalid of [
      { ...input(), componentAdapter: { ...componentAdapter(), mappings: [] } },
      { ...input(), accessibility: { ...accessibility(), errorAnnouncements: "off" } },
      { ...input(), responsive: { ...responsive(), strategy: "viewport" } },
    ]) {
      const log: string[] = [];
      expect(mountExperience(invalid, host(log))).toMatchObject({ ok: false });
      expect(log).toEqual([]);
    }
  });

  it("fails before begin when container measurement throws or is invalid without reflecting host errors", () => {
    const thrownLog: string[] = [];
    const thrown = mountExperience(input(), host(thrownLog, { failMeasure: true }));
    expect(thrown).toMatchObject({ ok: false, issue: { code: "CONTAINER_MEASURE_FAILED" } });
    expect(thrownLog).toEqual(["measure"]);
    if (!thrown.ok) expect(thrown.issue.message).not.toContain("SECRET_MEASURE_EXCEPTION");

    const invalidLog: string[] = [];
    expect(mountExperience(input(), host(invalidLog, { inlineSizePx: -1 }))).toMatchObject({
      ok: false,
      issue: { code: "CONTAINER_MEASURE_FAILED" },
    });
    expect(invalidLog).toEqual(["measure"]);
  });

  it("rolls back a partial mount and never commits", () => {
    const log: string[] = [];
    const result = mountExperience(input(), host(log, { failComponent: "acme.component.search-button" }));
    expect(result).toEqual({
      ok: false,
      issue: { code: "DOM_MOUNT_FAILED", path: "$", message: "DOM host failed while mounting experience" },
    });
    expect(log.slice(-2)).toEqual(["dispose:acme.component.date-picker", "dispose:root"]);
    expect(log).not.toContain("commit");
    if (!result.ok) expect(result.issue.message).not.toContain("SECRET_HOST_EXCEPTION");
  });

  it("rolls back all mounted components if commit fails", () => {
    const log: string[] = [];
    const result = mountExperience(input(), host(log, { failCommit: true }));
    expect(result).toMatchObject({ ok: false, issue: { code: "DOM_MOUNT_FAILED" } });
    expect(log.slice(-3)).toEqual([
      "dispose:acme.component.search-button",
      "dispose:acme.component.date-picker",
      "dispose:root",
    ]);
    if (!result.ok) expect(result.issue.message).not.toContain("SECRET_COMMIT_EXCEPTION");
  });
});