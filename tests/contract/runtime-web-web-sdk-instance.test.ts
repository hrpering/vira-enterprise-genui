import { describe, expect, it } from "vitest";
import { composeExperience } from "../../packages/composer/src/index.js";
import { createViraGenUI } from "../../packages/runtime-web/src/index.js";
import type {
  RuntimeWebDomComponentHandle,
  RuntimeWebDomPort,
  RuntimeWebDomRegion,
  RuntimeWebDomRoot,
} from "../../packages/runtime-web/src/index.js";

const capability = (id: string) => ({ version: "1", id });

function plan() {
  return {
    version: "1",
    id: "sdk-plan-1",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: { status: "draft" },
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
    id: "acme.web.components",
    mappings: [
      { capability: capability("select-date"), component: "acme.component.date-picker" },
      { capability: capability("submit-search"), component: "acme.component.search-button" },
    ],
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
    bands: [{ id: "compact", minInlineSizePx: 0 }],
  };
}

interface HostControl {
  failBegin: boolean;
}

function domPort(log: string[], control: HostControl): RuntimeWebDomPort {
  return {
    measureContainerInlineSizePx() {
      log.push("measure");
      return 320;
    },
    begin(context) {
      log.push(`begin:${context.planId}`);
      if (control.failBegin) throw new Error("SECRET_BEGIN_FAILURE");
      const root: RuntimeWebDomRoot = {
        createRegion(region) {
          log.push(`region:${region.id}`);
          const domRegion: RuntimeWebDomRegion = {
            mountComponent(binding) {
              log.push(`mount:${binding.component}`);
              const handle: RuntimeWebDomComponentHandle = {
                dispose() { log.push(`dispose:${binding.component}`); },
              };
              return handle;
            },
          };
          return domRegion;
        },
        commit() { log.push("commit"); },
        dispose() { log.push("dispose:root"); },
      };
      return root;
    },
  };
}

function configuration(log: string[], control: HostControl, idCalls: { value: number }) {
  return {
    componentAdapter: componentAdapter(),
    actionAdapter: actionAdapter(),
    permissionPolicy: permissionPolicy(),
    capabilityAllowlist: capabilityAllowlist(),
    componentAllowlist: componentAllowlist(),
    accessibility: accessibility(),
    responsive: responsive(),
    domPort: domPort(log, control),
    idFactory: {
      nextId() {
        idCalls.value += 1;
        return `action-${idCalls.value}`;
      },
    },
  };
}

function mountInput(overrides: Record<string, unknown> = {}) {
  return {
    experienceId: "sdk-experience-1",
    plan: plan(),
    composition: composition(),
    ...overrides,
  };
}

describe("runtime-web public Web SDK instance mount lifecycle", () => {
  it("creates without executing trusted methods and mounts one normalized experience", () => {
    const log: string[] = [];
    const ids = { value: 0 };
    const control = { failBegin: false };
    const created = createViraGenUI(configuration(log, control, ids));
    expect(created.ok).toBe(true);
    expect(log).toEqual([]);
    expect(ids.value).toBe(0);
    if (!created.ok) return;

    const mounted = created.value.mount(mountInput());
    expect(mounted).toEqual({ ok: true, value: { experienceId: "sdk-experience-1", planId: "sdk-plan-1" } });
    expect(created.value.isMounted()).toBe(true);
    expect(created.value.currentState()).toMatchObject({ experienceId: "sdk-experience-1", revision: 0, plan: { id: "sdk-plan-1" } });
    expect(ids.value).toBe(0);
    expect(log).toEqual([
      "measure",
      "begin:sdk-plan-1",
      "region:primary",
      "mount:acme.component.date-picker",
      "region:supporting",
      "mount:acme.component.search-button",
      "commit",
    ]);
  });

  it("rejects a second active mount without touching the DOM Port", () => {
    const log: string[] = [];
    const created = createViraGenUI(configuration(log, { failBegin: false }, { value: 0 }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.mount(mountInput()).ok).toBe(true);
    const before = [...log];
    expect(created.value.mount({ ...mountInput(), experienceId: "sdk-experience-2" })).toMatchObject({
      ok: false,
      issue: { code: "ALREADY_MOUNTED" },
    });
    expect(log).toEqual(before);
  });

  it("validates RuntimeState before DOM access", () => {
    const log: string[] = [];
    const created = createViraGenUI(configuration(log, { failBegin: false }, { value: 0 }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.value.mount(mountInput({ experienceId: "bad id" }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_RUNTIME_STATE", path: "$.experienceId" },
    });
    expect(log).toEqual([]);
    expect(created.value.isMounted()).toBe(false);
  });

  it("distinguishes forged composition from trusted DOM host failure and touches no DOM", () => {
    const log: string[] = [];
    const created = createViraGenUI(configuration(log, { failBegin: false }, { value: 0 }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const forged = {
      ...composition(),
      regions: [
        ...composition().regions,
        { id: "injected", role: "supporting", capabilities: [capability("admin.delete")] },
      ],
    };
    expect(created.value.mount(mountInput({ composition: forged }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_RENDER_INPUT" },
    });
    expect(log).toEqual([]);
    expect(created.value.isMounted()).toBe(false);
  });

  it("leaves no active state when DOM mount fails and permits a later successful mount", () => {
    const log: string[] = [];
    const control = { failBegin: true };
    const created = createViraGenUI(configuration(log, control, { value: 0 }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.value.mount(mountInput())).toMatchObject({ ok: false, issue: { code: "DOM_MOUNT_FAILED" } });
    expect(created.value.isMounted()).toBe(false);
    expect(created.value.currentState()).toBeUndefined();

    control.failBegin = false;
    expect(created.value.mount(mountInput())).toMatchObject({ ok: true });
    expect(created.value.isMounted()).toBe(true);
  });

  it("unmounts session + DOM idempotently and allows remount", () => {
    const log: string[] = [];
    const created = createViraGenUI(configuration(log, { failBegin: false }, { value: 0 }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.mount(mountInput()).ok).toBe(true);

    created.value.unmount();
    created.value.unmount();
    expect(created.value.isMounted()).toBe(false);
    expect(created.value.currentState()).toBeUndefined();
    expect(log.slice(-3)).toEqual([
      "dispose:acme.component.search-button",
      "dispose:acme.component.date-picker",
      "dispose:root",
    ]);

    expect(created.value.mount({ ...mountInput(), experienceId: "sdk-experience-2" })).toMatchObject({ ok: true });
    expect(created.value.currentState()?.experienceId).toBe("sdk-experience-2");
  });

  it("dispose is permanent, idempotent, and cleans an active mount", () => {
    const log: string[] = [];
    const created = createViraGenUI(configuration(log, { failBegin: false }, { value: 0 }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.mount(mountInput()).ok).toBe(true);

    created.value.dispose();
    created.value.dispose();
    expect(created.value.isDisposed()).toBe(true);
    expect(created.value.isMounted()).toBe(false);
    expect(created.value.currentState()).toBeUndefined();
    const before = [...log];
    expect(created.value.mount(mountInput())).toMatchObject({ ok: false, issue: { code: "SDK_DISPOSED" } });
    expect(log).toEqual(before);
  });
});