import { describe, expect, it } from "vitest";
import { resolveComponentForCapability } from "../../packages/adapter-sdk/src/index.js";
import { composeExperience } from "../../packages/composer/src/index.js";
import { planExperience } from "../../packages/planner/src/index.js";
import { parseDomainData } from "../../packages/protocol/src/index.js";
import { createRuntimeState } from "../../packages/runtime-core/src/index.js";
import {
  createStateBindingSession,
  mountExperience,
} from "../../packages/runtime-web/src/index.js";
import type {
  RuntimeWebActionIdFactory,
  RuntimeWebDomPort,
} from "../../packages/runtime-web/src/index.js";
import {
  createNetworkPolicy,
  evaluateNetworkRequest,
} from "../../packages/security/src/index.js";
import { createTelemetryChannel } from "../../packages/telemetry/src/index.js";
import type { TelemetryEvent } from "../../packages/telemetry/src/index.js";
import {
  normalizeToolResultToDomainData,
  parseExternalToolResult,
} from "../../packages/tool-bridge/src/index.js";

const capability = (id: string) => ({ version: "1", id });

function plannerInput() {
  return {
    id: "mvp-travel-plan",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: {
      origin: "IST",
      destination: "BER",
      "departure-date": "2026-09-03",
    },
    requiredState: ["origin", "destination", "departure-date"],
    capabilityRequirements: [
      { field: "departure-date", capability: capability("select-date") },
    ],
    availableCapabilities: [
      capability("search-flights"),
      capability("edit-passengers"),
    ],
    futureCapabilities: [capability("display.flight-results")],
  };
}

function componentAdapter() {
  return {
    version: "1",
    id: "mvp.web.components",
    mappings: [
      { capability: capability("search-flights"), component: "mvp.component.search-button" },
      { capability: capability("edit-passengers"), component: "mvp.component.passenger-editor" },
      { capability: capability("display.flight-results"), component: "mvp.component.flight-results" },
    ],
  };
}

function capabilityAllowlist() {
  return {
    version: "1",
    allowed: ["search-flights", "edit-passengers", "display.flight-results"],
  };
}

function componentAllowlist() {
  return {
    version: "1",
    allowed: [
      "mvp.component.search-button",
      "mvp.component.passenger-editor",
      "mvp.component.flight-results",
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
    ],
  };
}

function domPort(log: string[]): RuntimeWebDomPort {
  return {
    measureContainerInlineSizePx() {
      log.push("measure");
      return 600;
    },
    begin(context) {
      log.push(`begin:${context.planId}:${context.responsiveBand.id}`);
      return {
        createRegion(region) {
          log.push(`region:${region.role}`);
          return {
            mountComponent(binding) {
              log.push(`mount:${binding.capability.id}:${binding.component}`);
              return {
                dispose() {
                  log.push(`dispose:${binding.component}`);
                },
              };
            },
          };
        },
        commit() {
          log.push("commit");
        },
        dispose() {
          log.push("dispose:root");
        },
      };
    },
  };
}

function actionAdapter() {
  return {
    version: "1",
    id: "mvp.web.actions",
    mappings: [
      { event: "search.submit", actionType: "travel.flight.search.submit" },
      { event: "restricted.try", actionType: "travel.flight.restricted" },
    ],
  };
}

function permissionPolicy() {
  return {
    version: "1",
    rules: [
      { subject: "action", id: "travel.flight.search.submit", effect: "allow" },
      { subject: "action", id: "travel.flight.restricted", effect: "deny" },
    ],
  };
}

function idFactory(counter: { value: number }): RuntimeWebActionIdFactory {
  return {
    nextId() {
      counter.value += 1;
      return `mvp-action-${counter.value}`;
    },
  };
}

function composeFromPlanner() {
  const planned = planExperience(plannerInput());
  expect(planned.ok).toBe(true);
  if (!planned.ok) throw new Error(planned.issue.message);

  const composed = composeExperience({
    plan: planned.value,
    layout: { family: "flow" },
    disclosure: {
      primary: "immediate",
      supporting: "progressive",
      deferred: "on-demand",
    },
  });
  expect(composed.ok).toBe(true);
  if (!composed.ok) throw new Error(composed.issue.message);

  return { plan: planned.value, composition: composed.value };
}

const flightData = {
  flights: [
    { id: "F-1", from: "IST", to: "BER", price: 120 },
    { id: "F-2", from: "SAW", to: "BER", price: 135 },
  ],
};

describe("Vira Enterprise GenUI MVP completion gate", () => {
  it("runs the public host-to-experience path with explicit security, tool, and telemetry boundaries", async () => {
    const { plan, composition } = composeFromPlanner();
    expect(plan.capabilities.required).toEqual([]);
    expect(plan.capabilities.available.map((item) => item.id)).toEqual(["search-flights", "edit-passengers"]);
    expect(composition.mode).toBe("interact");

    const component = resolveComponentForCapability(componentAdapter(), capability("search-flights"));
    expect(component).toEqual({ ok: true, value: "mvp.component.search-button" });

    const domLog: string[] = [];
    const mounted = mountExperience({
      plan,
      composition,
      componentAdapter: componentAdapter(),
      capabilityAllowlist: capabilityAllowlist(),
      componentAllowlist: componentAllowlist(),
      accessibility: accessibility(),
      responsive: responsive(),
    }, domPort(domLog));
    expect(mounted.ok).toBe(true);
    expect(domLog).toEqual([
      "measure",
      "begin:mvp-travel-plan:regular",
      "region:primary",
      "mount:search-flights:mvp.component.search-button",
      "region:supporting",
      "mount:edit-passengers:mvp.component.passenger-editor",
      "region:deferred",
      "mount:display.flight-results:mvp.component.flight-results",
      "commit",
    ]);
    if (!mounted.ok) return;

    const initial = createRuntimeState("mvp-travel-experience", plan);
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

    const action = session.value.process({
      event: "search.submit",
      payload: { origin: "IST", destination: "BER" },
    });
    expect(action).toMatchObject({
      ok: true,
      value: {
        action: { id: "mvp-action-1", source: "user", type: "travel.flight.search.submit" },
        stateChanged: false,
        effects: [{ type: "host-action", action: { type: "travel.flight.search.submit" } }],
      },
    });

    const networkPolicy = createNetworkPolicy({
      version: "1",
      rules: [{ origin: "https://api.example.com", methods: ["POST"] }],
    });
    expect(networkPolicy.ok).toBe(true);
    if (!networkPolicy.ok) return;
    expect(evaluateNetworkRequest(networkPolicy.value, {
      url: "https://api.example.com/flights/search",
      method: "POST",
    })).toMatchObject({ ok: true, value: { decision: "allow", reason: "allowed" } });

    const external = parseExternalToolResult({
      version: "1",
      tool: { kind: "function", name: "travel.flight.search" },
      outcome: "success",
      data: flightData,
      freshness: { observedAtUnixMs: 1_000, expiresAtUnixMs: 2_000 },
    });
    expect(external.ok).toBe(true);
    if (!external.ok) return;

    const normalized = normalizeToolResultToDomainData(external.value, {
      version: "1",
      tool: { kind: "function", name: "travel.flight.search" },
      domain: "travel.flight",
      type: "results",
    });
    expect(normalized).toMatchObject({
      ok: true,
      value: {
        outcome: "success",
        domainData: {
          version: "1",
          domain: "travel.flight",
          type: "results",
          data: flightData,
        },
      },
    });
    if (!normalized.ok || normalized.value.outcome !== "success") return;
    expect(parseDomainData(normalized.value.domainData).ok).toBe(true);

    const exported: (readonly TelemetryEvent[])[] = [];
    const telemetry = createTelemetryChannel({
      exportBatch(events: readonly TelemetryEvent[]) {
        exported.push(events);
      },
      flush() {},
      shutdown() {},
    });
    expect(telemetry.ok).toBe(true);
    if (!telemetry.ok) return;

    for (const event of [
      {
        version: "1",
        name: "runtime.mount.completed",
        source: "runtime-web",
        kind: "lifecycle",
        outcome: "success",
        occurredAt: "2026-08-29T06:45:00.000Z",
      },
      {
        version: "1",
        name: "runtime.action.dispatched",
        source: "runtime-web",
        kind: "action",
        outcome: "success",
        occurredAt: "2026-08-29T06:45:01.000Z",
      },
      {
        version: "1",
        name: "tool.result.normalized",
        source: "tool-bridge",
        kind: "integration",
        outcome: "success",
        occurredAt: "2026-08-29T06:45:02.000Z",
      },
    ] as const) {
      expect(await telemetry.value.emit(event)).toEqual({ ok: true });
    }
    expect(exported.flat().map((event) => event.name)).toEqual([
      "runtime.mount.completed",
      "runtime.action.dispatched",
      "tool.result.normalized",
    ]);
    expect(await telemetry.value.shutdown()).toEqual({ ok: true });

    mounted.value.dispose();
    expect(domLog.slice(-4)).toEqual([
      "dispose:mvp.component.flight-results",
      "dispose:mvp.component.passenger-editor",
      "dispose:mvp.component.search-button",
      "dispose:root",
    ]);
  });

  it("fails closed before DOM, host/tool execution, or unauthorized network access", () => {
    const { plan, composition } = composeFromPlanner();

    const domLog: string[] = [];
    const deniedMount = mountExperience({
      plan,
      composition,
      componentAdapter: componentAdapter(),
      capabilityAllowlist: capabilityAllowlist(),
      componentAllowlist: {
        version: "1",
        allowed: ["mvp.component.search-button", "mvp.component.passenger-editor"],
      },
      accessibility: accessibility(),
      responsive: responsive(),
    }, domPort(domLog));
    expect(deniedMount).toMatchObject({
      ok: false,
      issue: { code: "COMPONENT_DENIED" },
    });
    expect(domLog).toEqual([]);

    const initial = createRuntimeState("mvp-travel-experience", plan);
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    const before = initial.value;
    const ids = { value: 0 };
    const session = createStateBindingSession({
      state: initial.value,
      policy: permissionPolicy(),
      actionAdapter: actionAdapter(),
    }, idFactory(ids));
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    expect(session.value.process({ event: "restricted.try" })).toMatchObject({
      ok: false,
      stage: "runtime",
      error: { code: "runtime.permission.denied" },
    });
    expect(session.value.currentState()).toBe(before);

    const networkPolicy = createNetworkPolicy({
      version: "1",
      rules: [{ origin: "https://api.example.com", methods: ["POST"] }],
    });
    expect(networkPolicy.ok).toBe(true);
    if (!networkPolicy.ok) return;
    expect(evaluateNetworkRequest(networkPolicy.value, {
      url: "https://api.example.com/flights/search",
      method: "GET",
    })).toMatchObject({
      ok: true,
      value: { decision: "deny", reason: "method-not-allowed" },
    });
  });
});
