import { describe, expect, it } from "vitest";
import { composeExperience } from "../../packages/composer/src/index.js";
import { createViraGenUI } from "../../packages/runtime-web/src/index.js";
import type { RuntimeWebDomPort } from "../../packages/runtime-web/src/index.js";

const capability = (id: string) => ({ version: "1", id });

function plan() {
  return {
    version: "1",
    id: "host-patch-plan-1",
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

function patch(status = "ready") {
  return {
    version: "1",
    operations: [{ op: "replace", path: "/state/status", value: status }],
  };
}

function createSdk(effect: "allow" | "deny" | "confirm" = "allow") {
  const ids = { value: 0 };
  const domPort: RuntimeWebDomPort = {
    measureContainerInlineSizePx() { return 320; },
    begin() {
      return {
        createRegion() { return { mountComponent() { return { dispose() {} }; } }; },
        commit() {},
        dispose() {},
      };
    },
  };
  const created = createViraGenUI({
    componentAdapter: {
      version: "1",
      id: "acme.web.components",
      mappings: [{ capability: capability("submit-search"), component: "acme.component.search-button" }],
    },
    actionAdapter: {
      version: "1",
      id: "acme.web.actions",
      mappings: [{ event: "search.submit", actionType: "travel.flight.search.submit" }],
    },
    permissionPolicy: {
      version: "1",
      rules: [
        { subject: "action", id: "runtime.patch.apply", effect },
        { subject: "action", id: "travel.flight.search.submit", effect: "allow" },
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
    idFactory: { nextId() { ids.value += 1; return `host-patch-action-${ids.value}`; } },
  });
  if (!created.ok) throw new Error(created.issue.message);
  expect(created.value.mount({ experienceId: "host-patch-experience-1", plan: plan(), composition: composition() }).ok).toBe(true);
  return { sdk: created.value, ids };
}

describe("runtime-web public Web SDK host patch", () => {
  it("applies a valid patch as a fixed host RuntimeAction through Runtime Core", () => {
    const { sdk, ids } = createSdk("allow");
    const notifications: string[] = [];
    sdk.on("action", (action) => notifications.push(`action:${action.source}:${action.type}`));
    sdk.on("statechange", (state) => notifications.push(`state:${state.revision}:${String(state.plan.state.status)}`));

    const before = sdk.currentState();
    const result = sdk.patch(patch());
    expect(result).toMatchObject({
      ok: true,
      value: {
        action: { id: "host-patch-action-1", source: "host", type: "runtime.patch.apply" },
        stateChanged: true,
        state: { revision: 1, plan: { state: { status: "ready" } } },
        effects: [],
      },
    });
    expect(ids.value).toBe(1);
    expect(before?.revision).toBe(0);
    expect(before?.plan.state.status).toBe("draft");
    expect(sdk.currentState()?.revision).toBe(1);
    expect(notifications).toEqual(["action:host:runtime.patch.apply", "state:1:ready"]);
  });

  it("rejects an invalid patch before action-ID allocation, preserves state, and reports the direct patch path", () => {
    const { sdk, ids } = createSdk("allow");
    const before = sdk.currentState();
    const errors: string[] = [];
    sdk.on("error", (failure) => errors.push(failure.stage));

    const result = sdk.patch({ version: "1", operations: [{ op: "replace", path: "not-a-pointer", value: "ready" }] });
    expect(result).toMatchObject({
      ok: false,
      stage: "host",
      issue: { code: "INVALID_PATCH", path: "$.operations[0].path" },
    });
    expect(ids.value).toBe(0);
    expect(sdk.currentState()).toBe(before);
    expect(errors).toEqual(["host"]);
  });

  it("does not let host origin bypass Runtime Core deny or confirmation policy", () => {
    const denied = createSdk("deny");
    const deniedBefore = denied.sdk.currentState();
    expect(denied.sdk.patch(patch())).toMatchObject({
      ok: false,
      stage: "runtime",
      error: { code: "runtime.permission.denied" },
    });
    expect(denied.ids.value).toBe(1);
    expect(denied.sdk.currentState()).toBe(deniedBefore);

    const confirmed = createSdk("confirm");
    const confirmedBefore = confirmed.sdk.currentState();
    const effects: string[] = [];
    confirmed.sdk.on("effect", (effect) => effects.push(effect.type));
    const result = confirmed.sdk.patch(patch());
    expect(result).toMatchObject({
      ok: true,
      value: {
        action: { source: "host", type: "runtime.patch.apply" },
        stateChanged: false,
        effects: [{ type: "confirmation-required" }],
      },
    });
    expect(confirmed.sdk.currentState()).toBe(confirmedBefore);
    expect(effects).toEqual(["confirmation-required"]);
  });

  it("rejects reentrant patch from SDK notification before allocating another ID", () => {
    const { sdk, ids } = createSdk("allow");
    let nested: ReturnType<typeof sdk.patch> | undefined;
    sdk.on("action", () => {
      nested = sdk.patch(patch("nested"));
    });

    const outer = sdk.dispatch({ event: "search.submit" });
    expect(outer.ok).toBe(true);
    expect(nested).toMatchObject({ ok: false, stage: "sdk", issue: { code: "REENTRANT_PATCH" } });
    expect(ids.value).toBe(1);
    expect(sdk.currentState()?.revision).toBe(0);
  });

  it("fails before ID allocation when no experience is mounted or the SDK is disposed", () => {
    const { sdk, ids } = createSdk("allow");
    sdk.unmount();
    expect(sdk.patch(patch())).toMatchObject({ ok: false, stage: "sdk", issue: { code: "NOT_MOUNTED" } });
    expect(ids.value).toBe(0);

    sdk.dispose();
    expect(sdk.patch(patch())).toMatchObject({ ok: false, stage: "sdk", issue: { code: "SDK_DISPOSED" } });
    expect(ids.value).toBe(0);
  });
});
