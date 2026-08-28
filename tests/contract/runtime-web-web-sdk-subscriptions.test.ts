import { describe, expect, it } from "vitest";
import { composeExperience } from "../../packages/composer/src/index.js";
import { createViraGenUI } from "../../packages/runtime-web/src/index.js";
import type { RuntimeWebDomPort } from "../../packages/runtime-web/src/index.js";

const capability = (id: string) => ({ version: "1", id });

function plan() {
  return {
    version: "1",
    id: "subscription-plan-1",
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

function config(ids: { value: number }) {
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
  return {
    componentAdapter: {
      version: "1",
      id: "acme.web.components",
      mappings: [{ capability: capability("submit-search"), component: "acme.component.search-button" }],
    },
    actionAdapter: {
      version: "1",
      id: "acme.web.actions",
      mappings: [
        { event: "search.submit", actionType: "travel.flight.search.submit" },
        { event: "state.ready", actionType: "runtime.patch.apply" },
        { event: "restricted.try", actionType: "travel.restricted.try" },
      ],
    },
    permissionPolicy: {
      version: "1",
      rules: [
        { subject: "action", id: "travel.flight.search.submit", effect: "allow" },
        { subject: "action", id: "runtime.patch.apply", effect: "allow" },
        { subject: "action", id: "travel.restricted.try", effect: "deny" },
      ],
    },
    accessibility: {
      version: "1",
      focusOnMount: "first-primary",
      focusOnUpdate: "primary-if-lost",
      statusAnnouncements: "polite",
      errorAnnouncements: "assertive",
    },
    responsive: { version: "1", strategy: "container", bands: [{ id: "compact", minInlineSizePx: 0 }] },
    domPort,
    idFactory: { nextId() { ids.value += 1; return `subscription-action-${ids.value}`; } },
  };
}

function sdk(ids = { value: 0 }) {
  const created = createViraGenUI(config(ids));
  if (!created.ok) throw new Error(created.issue.message);
  return { instance: created.value, ids };
}

function mount(instance: ReturnType<typeof sdk>["instance"], experienceId = "subscription-experience-1") {
  const result = instance.mount({ experienceId, plan: plan(), composition: composition() });
  if (!result.ok) throw new Error(result.issue.message);
}

describe("runtime-web public Web SDK subscriptions", () => {
  it("notifies action then effects without allowing listener exceptions to alter dispatch", () => {
    const { instance } = sdk();
    const log: string[] = [];
    const first = instance.on("action", (action) => { log.push(`action-a:${action.type}`); throw new Error("listener failure"); });
    const second = instance.on("action", (action) => { log.push(`action-b:${action.type}`); });
    const effect = instance.on("effect", (value) => { log.push(`effect:${value.type}`); });
    expect(first.ok && second.ok && effect.ok).toBe(true);
    mount(instance);

    const result = instance.dispatch({ event: "search.submit" });
    expect(result).toMatchObject({ ok: true, value: { effects: [{ type: "host-action" }] } });
    expect(log).toEqual([
      "action-a:travel.flight.search.submit",
      "action-b:travel.flight.search.submit",
      "effect:host-action",
    ]);
  });

  it("rejects reentrant dispatch during notification without consuming another action ID", () => {
    const ids = { value: 0 };
    const { instance } = sdk(ids);
    let nested: unknown;
    instance.on("action", () => {
      nested = instance.dispatch({
        event: "state.ready",
        payload: { patch: { version: "1", operations: [{ op: "replace", path: "/state/status", value: "ready" }] } },
      });
    });
    mount(instance);
    const outer = instance.dispatch({ event: "search.submit" });
    expect(outer).toMatchObject({ ok: true });
    expect(nested).toMatchObject({ ok: false, stage: "sdk", issue: { code: "REENTRANT_DISPATCH" } });
    expect(ids.value).toBe(1);
    expect(instance.currentState()).toMatchObject({ revision: 0, plan: { state: { status: "draft" } } });
  });

  it("emits statechange only for a revision-advancing reduction", () => {
    const { instance } = sdk();
    const log: string[] = [];
    instance.on("statechange", (state) => { log.push(`revision:${state.revision}:${String(state.plan.state.status)}`); });
    mount(instance);

    instance.dispatch({ event: "search.submit" });
    expect(log).toEqual([]);

    instance.dispatch({
      event: "state.ready",
      payload: { patch: { version: "1", operations: [{ op: "replace", path: "/state/status", value: "ready" }] } },
    });
    expect(log).toEqual(["revision:1:ready"]);
  });

  it("notifies original dispatch failures on the error channel", () => {
    const { instance } = sdk();
    const failures: string[] = [];
    instance.on("error", (failure) => { failures.push(failure.stage); });

    expect(instance.dispatch({ event: "search.submit" })).toMatchObject({ ok: false, stage: "sdk" });
    mount(instance);
    expect(instance.dispatch({ event: "restricted.try" })).toMatchObject({ ok: false, stage: "runtime" });
    expect(instance.dispatch({ event: "unknown.event" })).toMatchObject({ ok: false, stage: "event" });
    expect(failures).toEqual(["sdk", "runtime", "event"]);
  });

  it("supports idempotent unsubscribe and preserves subscriptions across remount", () => {
    const { instance } = sdk();
    let calls = 0;
    const subscription = instance.on("action", () => { calls += 1; });
    expect(subscription.ok).toBe(true);
    if (!subscription.ok) return;

    mount(instance);
    instance.dispatch({ event: "search.submit" });
    instance.unmount();
    mount(instance, "subscription-experience-2");
    instance.dispatch({ event: "search.submit" });
    expect(calls).toBe(2);

    subscription.value.unsubscribe();
    subscription.value.unsubscribe();
    instance.dispatch({ event: "search.submit" });
    expect(calls).toBe(2);
  });

  it("fails closed for invalid registration and clears subscriptions on dispose", () => {
    const { instance } = sdk();
    let calls = 0;
    instance.on("action", () => { calls += 1; });
    const unsafeOn = instance.on as unknown as (event: string, listener: unknown) => unknown;
    expect(unsafeOn("unknown", () => {})).toMatchObject({ ok: false, issue: { code: "INVALID_EVENT" } });
    expect(unsafeOn("action", null)).toMatchObject({ ok: false, issue: { code: "INVALID_LISTENER" } });

    mount(instance);
    instance.dispose();
    expect(instance.on("action", () => {})).toMatchObject({ ok: false, issue: { code: "SDK_DISPOSED" } });
    expect(instance.dispatch({ event: "search.submit" })).toMatchObject({ ok: false, stage: "sdk" });
    expect(calls).toBe(0);
  });
});