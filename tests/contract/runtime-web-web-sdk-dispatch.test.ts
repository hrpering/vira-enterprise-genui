import { describe, expect, it } from "vitest";
import { composeExperience } from "../../packages/composer/src/index.js";
import { createViraGenUI } from "../../packages/runtime-web/src/index.js";
import type { RuntimeWebDomPort } from "../../packages/runtime-web/src/index.js";

const capability = (id: string) => ({ version: "1", id });

function plan() {
  return {
    version: "1",
    id: "dispatch-plan-1",
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

function domPort(): RuntimeWebDomPort {
  return {
    measureContainerInlineSizePx() { return 320; },
    begin() {
      return {
        createRegion() {
          return { mountComponent() { return { dispose() {} }; } };
        },
        commit() {},
        dispose() {},
      };
    },
  };
}

function config(idCalls: { value: number }) {
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
        { event: "booking.confirm", actionType: "travel.booking.confirm" },
        { event: "restricted.try", actionType: "travel.restricted.try" },
      ],
    },
    permissionPolicy: {
      version: "1",
      rules: [
        { subject: "action", id: "travel.flight.search.submit", effect: "allow" },
        { subject: "action", id: "runtime.patch.apply", effect: "allow" },
        { subject: "action", id: "travel.booking.confirm", effect: "confirm" },
        { subject: "action", id: "travel.restricted.try", effect: "deny" },
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
    domPort: domPort(),
    idFactory: {
      nextId() {
        idCalls.value += 1;
        return `dispatch-action-${idCalls.value}`;
      },
    },
  };
}

function mountedSdk(idCalls: { value: number }) {
  const created = createViraGenUI(config(idCalls));
  if (!created.ok) throw new Error(created.issue.message);
  const mounted = created.value.mount({ experienceId: "dispatch-experience-1", plan: plan(), composition: composition() });
  if (!mounted.ok) throw new Error(mounted.issue.message);
  return created.value;
}

describe("runtime-web public Web SDK dispatch", () => {
  it("fails before ID allocation when no experience is mounted or SDK is disposed", () => {
    const ids = { value: 0 };
    const created = createViraGenUI(config(ids));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.dispatch({ event: "search.submit" })).toMatchObject({
      ok: false,
      stage: "sdk",
      issue: { code: "NOT_MOUNTED" },
    });
    expect(ids.value).toBe(0);
    created.value.dispose();
    expect(created.value.dispatch({ event: "search.submit" })).toMatchObject({
      ok: false,
      stage: "sdk",
      issue: { code: "SDK_DISPOSED" },
    });
    expect(ids.value).toBe(0);
  });

  it("returns an allowed host action as data without changing state", () => {
    const ids = { value: 0 };
    const sdk = mountedSdk(ids);
    const before = sdk.currentState();
    const result = sdk.dispatch({ event: "search.submit", payload: { query: "BER" } });
    expect(result).toMatchObject({
      ok: true,
      value: {
        action: { id: "dispatch-action-1", source: "user", type: "travel.flight.search.submit" },
        stateChanged: false,
        effects: [{ type: "host-action", action: { type: "travel.flight.search.submit" } }],
      },
    });
    expect(sdk.currentState()).toBe(before);
  });

  it("advances authoritative state only through an allowed Runtime Core patch", () => {
    const ids = { value: 0 };
    const sdk = mountedSdk(ids);
    const result = sdk.dispatch({
      event: "state.ready",
      payload: {
        patch: { version: "1", operations: [{ op: "replace", path: "/state/status", value: "ready" }] },
      },
    });
    expect(result).toMatchObject({
      ok: true,
      value: { stateChanged: true, state: { revision: 1, plan: { state: { status: "ready" } } }, effects: [] },
    });
    expect(sdk.currentState()).toMatchObject({ revision: 1, plan: { state: { status: "ready" } } });
  });

  it("keeps state unchanged for confirm and deny paths", () => {
    const ids = { value: 0 };
    const sdk = mountedSdk(ids);
    const before = sdk.currentState();
    expect(sdk.dispatch({ event: "booking.confirm", payload: { bookingId: "B1" } })).toMatchObject({
      ok: true,
      value: { stateChanged: false, effects: [{ type: "confirmation-required" }] },
    });
    expect(sdk.currentState()).toBe(before);

    expect(sdk.dispatch({ event: "restricted.try" })).toMatchObject({
      ok: false,
      stage: "runtime",
      error: { code: "runtime.permission.denied" },
    });
    expect(sdk.currentState()).toBe(before);
  });

  it("preserves event-stage failures and does not allocate an ID for unmapped events", () => {
    const ids = { value: 0 };
    const sdk = mountedSdk(ids);
    expect(sdk.dispatch({ event: "unknown.event" })).toMatchObject({ ok: false, stage: "event" });
    expect(ids.value).toBe(0);
  });

  it("rejects dispatch after unmount before ID allocation", () => {
    const ids = { value: 0 };
    const sdk = mountedSdk(ids);
    sdk.unmount();
    expect(sdk.dispatch({ event: "search.submit" })).toMatchObject({
      ok: false,
      stage: "sdk",
      issue: { code: "NOT_MOUNTED" },
    });
    expect(ids.value).toBe(0);
  });
});