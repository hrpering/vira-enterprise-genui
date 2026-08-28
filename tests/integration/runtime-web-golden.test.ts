import { describe, expect, it } from "vitest";
import { composeExperience } from "../../packages/composer/src/index.js";
import { createRuntimeState } from "../../packages/runtime-core/src/index.js";
import {
  createStateBindingSession,
  mountExperience,
} from "../../packages/runtime-web/src/index.js";
import type {
  RuntimeWebActionIdFactory,
  RuntimeWebDomComponentHandle,
  RuntimeWebDomPort,
  RuntimeWebDomRegion,
  RuntimeWebDomRoot,
} from "../../packages/runtime-web/src/index.js";

const capability = (id: string) => ({ version: "1", id });

function sourcePlan() {
  return {
    version: "1",
    id: "travel-plan-golden",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: { origin: "IST", destination: "BER", status: "draft" },
    capabilities: {
      required: [capability("select-date")],
      available: [capability("submit-search")],
      future: [capability("display.flight-results")],
    },
  };
}

function composition() {
  const result = composeExperience({
    plan: sourcePlan(),
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
      { capability: capability("display.flight-results"), component: "acme.component.flight-results" },
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

function actionAdapter() {
  return {
    version: "1",
    id: "acme.web.actions",
    mappings: [
      { event: "search.submit", actionType: "travel.flight.search.submit" },
      { event: "state.ready", actionType: "runtime.patch.apply" },
      { event: "booking.confirm", actionType: "travel.booking.confirm" },
      { event: "restricted.try", actionType: "travel.restricted.try" },
    ],
  };
}

function permissionPolicy() {
  return {
    version: "1",
    rules: [
      { subject: "action", id: "travel.flight.search.submit", effect: "allow" },
      { subject: "action", id: "runtime.patch.apply", effect: "allow" },
      { subject: "action", id: "travel.booking.confirm", effect: "confirm" },
      { subject: "action", id: "travel.restricted.try", effect: "deny" },
    ],
  };
}

function idFactory(calls: { value: number }): RuntimeWebActionIdFactory {
  return {
    nextId() {
      calls.value += 1;
      return `golden-action-${calls.value}`;
    },
  };
}

function domPort(log: string[]): RuntimeWebDomPort {
  return {
    measureContainerInlineSizePx() {
      log.push("measure:500");
      return 500;
    },
    begin(context) {
      log.push(`begin:${context.planId}:${context.responsiveBand.id}:${context.accessibility.errorAnnouncements}`);
      const root: RuntimeWebDomRoot = {
        createRegion(region) {
          log.push(`region:${region.role}:${region.id}`);
          const domRegion: RuntimeWebDomRegion = {
            mountComponent(binding) {
              log.push(`mount:${binding.capability.id}:${binding.component}`);
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
        },
        dispose() {
          log.push("dispose:root");
        },
      };
      return root;
    },
  };
}

describe("runtime-web deterministic golden integration", () => {
  it("locks mount + user-event + state-binding semantics from one source plan", () => {
    const plan = sourcePlan();
    const composed = composition();
    const mountLog: string[] = [];
    const mounted = mountExperience({
      composition: composed,
      plan,
      componentAdapter: componentAdapter(),
      accessibility: accessibility(),
      responsive: responsive(),
    }, domPort(mountLog));

    expect(mounted.ok).toBe(true);
    expect(mountLog).toEqual([
      "measure:500",
      "begin:travel-plan-golden:regular:assertive",
      "region:primary:primary",
      "mount:select-date:acme.component.date-picker",
      "region:supporting:supporting",
      "mount:submit-search:acme.component.search-button",
      "region:deferred:deferred",
      "mount:display.flight-results:acme.component.flight-results",
      "commit",
    ]);
    if (!mounted.ok) return;

    const initial = createRuntimeState("travel-experience-golden", plan);
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;

    const ids = { value: 0 };
    const sessionResult = createStateBindingSession({
      state: initial.value,
      policy: permissionPolicy(),
      actionAdapter: actionAdapter(),
    }, idFactory(ids));
    expect(sessionResult.ok).toBe(true);
    if (!sessionResult.ok) return;
    const session = sessionResult.value;
    const revisionZero = session.currentState();

    const hostAction = session.process({
      event: "search.submit",
      payload: { origin: "IST", destination: "BER" },
    });
    expect(hostAction).toMatchObject({
      ok: true,
      value: {
        action: { id: "golden-action-1", source: "user", type: "travel.flight.search.submit" },
        stateChanged: false,
        effects: [{ type: "host-action", action: { type: "travel.flight.search.submit" } }],
      },
    });
    expect(session.currentState()).toBe(revisionZero);

    const patched = session.process({
      event: "state.ready",
      payload: {
        patch: {
          version: "1",
          operations: [{ op: "replace", path: "/state/status", value: "ready" }],
        },
      },
    });
    expect(patched).toMatchObject({
      ok: true,
      value: { stateChanged: true, state: { revision: 1, plan: { state: { status: "ready" } } }, effects: [] },
    });
    if (!patched.ok) return;
    expect(session.currentState()).toBe(patched.value.state);

    const revisionOne = session.currentState();
    const confirmation = session.process({ event: "booking.confirm", payload: { bookingId: "B-1" } });
    expect(confirmation).toMatchObject({
      ok: true,
      value: { stateChanged: false, effects: [{ type: "confirmation-required" }] },
    });
    expect(session.currentState()).toBe(revisionOne);

    const denied = session.process({ event: "restricted.try" });
    expect(denied).toMatchObject({ ok: false, stage: "runtime", error: { code: "runtime.permission.denied" } });
    expect(session.currentState()).toBe(revisionOne);
    expect(ids.value).toBe(4);

    mounted.value.dispose();
    mounted.value.dispose();
    expect(mountLog.slice(-4)).toEqual([
      "dispose:acme.component.flight-results",
      "dispose:acme.component.search-button",
      "dispose:acme.component.date-picker",
      "dispose:root",
    ]);
  });

  it("keeps integrity and invalid-event failures closed before side effects", () => {
    const plan = sourcePlan();
    const forged = {
      ...composition(),
      regions: [
        ...composition().regions,
        { id: "injected", role: "supporting", capabilities: [capability("admin.delete")] },
      ],
    };
    const log: string[] = [];
    expect(mountExperience({
      composition: forged,
      plan,
      componentAdapter: componentAdapter(),
      accessibility: accessibility(),
      responsive: responsive(),
    }, domPort(log))).toMatchObject({ ok: false, issue: { code: "INVALID_RENDER_INPUT" } });
    expect(log).toEqual([]);

    const initial = createRuntimeState("travel-experience-golden", plan);
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    const ids = { value: 0 };
    const session = createStateBindingSession({
      state: initial.value,
      policy: permissionPolicy(),
      actionAdapter: actionAdapter(),
    }, idFactory(ids));
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const before = session.value.currentState();
    expect(session.value.process({ event: "unknown.event" })).toMatchObject({ ok: false, stage: "event" });
    expect(session.value.currentState()).toBe(before);
    expect(ids.value).toBe(0);
  });
});