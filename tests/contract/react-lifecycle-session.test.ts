import { describe, expect, it } from "vitest";
import { composeExperience } from "../../packages/composer/src/index.js";
import { createViraReactSession } from "../../packages/react/src/session.js";
import type { RuntimeWebDomPort } from "../../packages/runtime-web/src/index.js";

const capability = (id: string) => ({ version: "1", id });

function plan() {
  return {
    version: "1",
    id: "react-plan-1",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: { status: "draft" },
    capabilities: { required: [capability("submit-search")], available: [], future: [] },
  };
}

function composition() {
  const result = composeExperience({
    plan: plan(),
    layout: { family: "single-focus" },
    disclosure: { primary: "immediate", supporting: "progressive", deferred: "on-demand" },
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

function patch() {
  return {
    version: "1",
    operations: [{ op: "replace", path: "/state/status", value: "ready" }],
  };
}

function configuration(log: string[], ids: { value: number }) {
  const domPort: RuntimeWebDomPort = {
    measureContainerInlineSizePx() { log.push("measure"); return 400; },
    begin() {
      log.push("begin");
      return {
        createRegion() {
          return {
            mountComponent() {
              log.push("mount");
              return { dispose() { log.push("dispose:component"); } };
            },
          };
        },
        commit() { log.push("commit"); },
        dispose() { log.push("dispose:root"); },
      };
    },
  };
  return {
    componentAdapter: {
      version: "1",
      id: "react.web.components",
      mappings: [{ capability: capability("submit-search"), component: "react.component.search-button" }],
    },
    actionAdapter: {
      version: "1",
      id: "react.web.actions",
      mappings: [{ event: "search.submit", actionType: "travel.flight.search.submit" }],
    },
    permissionPolicy: {
      version: "1",
      rules: [
        { subject: "action", id: "travel.flight.search.submit", effect: "allow" },
        { subject: "action", id: "runtime.patch.apply", effect: "allow" },
      ],
    },
    capabilityAllowlist: { version: "1", allowed: ["submit-search"] },
    accessibility: {
      version: "1",
      focusOnMount: "first-primary",
      focusOnUpdate: "primary-if-lost",
      statusAnnouncements: "polite",
      errorAnnouncements: "assertive",
    },
    responsive: { version: "1", strategy: "container", bands: [{ id: "compact", minInlineSizePx: 0 }] },
    domPort,
    idFactory: { nextId() { ids.value += 1; return `react-action-${ids.value}`; } },
  };
}

const noopCallbacks = {
  onAction() {},
  onEffect() {},
  onStateChange() {},
  onError() {},
};

describe("react wrapper lifecycle session", () => {
  it("delegates mount/state/actions to the exact Runtime Web SDK and forwards notifications", () => {
    const log: string[] = [];
    const ids = { value: 0 };
    const notifications: string[] = [];
    const session = createViraReactSession(
      configuration(log, ids),
      { experienceId: "react-experience-1", plan: plan(), composition: composition() },
      {
        onAction: (action) => notifications.push(`action:${action.source}:${action.type}`),
        onEffect: (effect) => notifications.push(`effect:${effect.type}`),
        onStateChange: (state) => notifications.push(`state:${state.revision}`),
        onError: (failure) => notifications.push(`error:${failure.stage}`),
      },
    );
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    expect(log).toEqual(["measure", "begin", "mount", "commit"]);

    expect(session.value.sdk.dispatch({ event: "search.submit" }).ok).toBe(true);
    expect(session.value.sdk.currentState()?.revision).toBe(0);
    expect(session.value.sdk.patch(patch()).ok).toBe(true);
    expect(session.value.sdk.currentState()?.revision).toBe(1);
    expect(notifications).toEqual([
      "action:user:travel.flight.search.submit",
      "effect:host-action",
      "action:host:runtime.patch.apply",
      "state:1",
    ]);
    expect(ids.value).toBe(2);

    session.value.dispose();
    session.value.dispose();
    expect(session.value.sdk.isDisposed()).toBe(true);
    expect(log.slice(-2)).toEqual(["dispose:component", "dispose:root"]);
  });

  it("fails configuration without touching DOM and returns mount failure after cleaning up the SDK", () => {
    const log: string[] = [];
    const ids = { value: 0 };
    const invalidConfig = createViraReactSession(
      { ...configuration(log, ids), permissionPolicy: { version: "1", rules: [], defaultEffect: "allow" } },
      { experienceId: "react-experience-1", plan: plan(), composition: composition() },
      noopCallbacks,
    );
    expect(invalidConfig).toMatchObject({ ok: false, stage: "configuration" });
    expect(log).toEqual([]);

    const mountLog: string[] = [];
    const mountIds = { value: 0 };
    const forged = { ...composition(), planId: "forged-plan" };
    const invalidMount = createViraReactSession(
      configuration(mountLog, mountIds),
      { experienceId: "react-experience-2", plan: plan(), composition: forged },
      noopCallbacks,
    );
    expect(invalidMount).toMatchObject({ ok: false, stage: "mount", result: { ok: false } });
    expect(mountLog).toEqual([]);
  });
});
