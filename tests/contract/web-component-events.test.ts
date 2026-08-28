import { describe, expect, it } from "vitest";
import { composeExperience } from "../../packages/composer/src/index.js";
import {
  VIRA_EXPERIENCE_DOM_EVENTS,
  createViraExperienceElementClass,
  defineViraExperienceElement,
} from "../../packages/web-component/src/index.js";
import type {
  ViraExperienceCustomEventFactory,
} from "../../packages/web-component/src/index.js";
import type { RuntimeWebDomPort } from "../../packages/runtime-web/src/index.js";

const capability = (id: string) => ({ version: "1", id });

function plan() {
  return {
    version: "1",
    id: "element-event-plan-1",
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

function configuration(ids: { value: number }) {
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
      mappings: [{ event: "search.submit", actionType: "travel.flight.search.submit" }],
    },
    permissionPolicy: {
      version: "1",
      rules: [
        { subject: "action", id: "travel.flight.search.submit", effect: "allow" },
        { subject: "action", id: "runtime.patch.apply", effect: "allow" },
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
    idFactory: { nextId() { ids.value += 1; return `element-event-action-${ids.value}`; } },
  };
}

interface FakeCustomEvent extends Event {
  readonly detail: unknown;
  readonly bubbles: boolean;
  readonly composed: boolean;
  readonly cancelable: boolean;
}

class FakeHTMLElement {
  readonly emitted: FakeCustomEvent[] = [];
  readonly listeners = new Map<string, Set<(event: FakeCustomEvent) => void>>();

  dispatchEvent(event: Event): boolean {
    const custom = event as FakeCustomEvent;
    this.emitted.push(custom);
    for (const listener of [...(this.listeners.get(custom.type) ?? [])]) listener(custom);
    return true;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (typeof listener !== "function") return;
    let bucket = this.listeners.get(type);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(type, bucket);
    }
    bucket.add(listener as unknown as (event: FakeCustomEvent) => void);
  }
}

const eventFactory: ViraExperienceCustomEventFactory = (type, detail) => ({
  type,
  detail,
  bubbles: true,
  composed: true,
  cancelable: false,
} as unknown as Event);

function element(ids = { value: 0 }) {
  const ElementClass = createViraExperienceElementClass(
    FakeHTMLElement as unknown as typeof HTMLElement,
    eventFactory,
  );
  const instance = new ElementClass() as InstanceType<typeof ElementClass> & FakeHTMLElement;
  expect(instance.configure(configuration(ids))).toEqual({ ok: true });
  expect(instance.mount({ experienceId: "element-event-experience-1", plan: plan(), composition: composition() }).ok).toBe(true);
  return { instance, ids };
}

function registry() {
  const definitions = new Map<string, CustomElementConstructor>();
  return {
    definitions,
    api: {
      define(name: string, constructor: CustomElementConstructor) {
        definitions.set(name, constructor);
      },
      get(name: string) {
        return definitions.get(name);
      },
    } as Pick<CustomElementRegistry, "define" | "get">,
  };
}

describe("vira-experience Web Component event surface", () => {
  it("forwards user dispatch and emits canonical action/effect CustomEvents", () => {
    const { instance, ids } = element();
    const result = instance.dispatch({ event: "search.submit", payload: { query: "BER" } });
    expect(result).toMatchObject({ ok: true, value: { action: { source: "user" }, effects: [{ type: "host-action" }] } });
    expect(ids.value).toBe(1);
    expect(instance.emitted.map((event) => event.type)).toEqual([
      VIRA_EXPERIENCE_DOM_EVENTS.action,
      VIRA_EXPERIENCE_DOM_EVENTS.effect,
    ]);
    expect(instance.emitted[0]?.detail).toMatchObject({ source: "user", type: "travel.flight.search.submit" });
    expect(instance.emitted[1]?.detail).toMatchObject({ type: "host-action" });
    expect(instance.emitted.every((event) => event.bubbles && event.composed && !event.cancelable)).toBe(true);
  });

  it("forwards host patch and emits host action then authoritative statechange", () => {
    const { instance, ids } = element();
    const result = instance.patch(patch());
    expect(result).toMatchObject({
      ok: true,
      value: { action: { source: "host", type: "runtime.patch.apply" }, stateChanged: true },
    });
    expect(ids.value).toBe(1);
    expect(instance.emitted.map((event) => event.type)).toEqual([
      VIRA_EXPERIENCE_DOM_EVENTS.action,
      VIRA_EXPERIENCE_DOM_EVENTS.statechange,
    ]);
    expect(instance.emitted[1]?.detail).toMatchObject({ revision: 1, plan: { state: { status: "ready" } } });
  });

  it("preserves an injected event factory through defineViraExperienceElement registration", () => {
    const fakeRegistry = registry();
    const defined = defineViraExperienceElement({
      HTMLElementBase: FakeHTMLElement as unknown as typeof HTMLElement,
      registry: fakeRegistry.api,
      customEventFactory: eventFactory,
    });
    expect(defined.ok).toBe(true);
    if (!defined.ok) return;

    const ids = { value: 0 };
    const instance = new defined.value.elementClass() as InstanceType<typeof defined.value.elementClass> & FakeHTMLElement;
    expect(instance.configure(configuration(ids))).toEqual({ ok: true });
    expect(instance.mount({ experienceId: "registered-event-experience-1", plan: plan(), composition: composition() }).ok).toBe(true);
    expect(instance.dispatch({ event: "search.submit" }).ok).toBe(true);
    expect(instance.emitted.map((event) => event.type)).toEqual([
      VIRA_EXPERIENCE_DOM_EVENTS.action,
      VIRA_EXPERIENCE_DOM_EVENTS.effect,
    ]);
  });

  it("emits canonical error detail for invalid UI events without consuming an ID", () => {
    const { instance, ids } = element();
    const result = instance.dispatch({ event: "unknown.event" });
    expect(result).toMatchObject({ ok: false, stage: "event" });
    expect(ids.value).toBe(0);
    expect(instance.emitted).toHaveLength(1);
    expect(instance.emitted[0]?.type).toBe(VIRA_EXPERIENCE_DOM_EVENTS.error);
    expect(instance.emitted[0]?.detail).toBe(result);
  });

  it("preserves Runtime Web reentrancy guards across synchronous native events", () => {
    const { instance, ids } = element();
    let nested: ReturnType<typeof instance.patch> | undefined;
    instance.addEventListener(VIRA_EXPERIENCE_DOM_EVENTS.action, () => {
      nested = instance.patch(patch());
    });

    const outer = instance.dispatch({ event: "search.submit" });
    expect(outer.ok).toBe(true);
    expect(nested).toMatchObject({ ok: false, stage: "sdk", issue: { code: "REENTRANT_PATCH" } });
    expect(ids.value).toBe(1);
    expect(instance.currentState()?.revision).toBe(0);
  });

  it("fails element operations before configuration without reaching Runtime Web", () => {
    const ElementClass = createViraExperienceElementClass(
      FakeHTMLElement as unknown as typeof HTMLElement,
      eventFactory,
    );
    const instance = new ElementClass();
    expect(instance.dispatch({ event: "search.submit" })).toMatchObject({ ok: false, stage: "element", issue: { code: "NOT_CONFIGURED" } });
    expect(instance.patch(patch())).toMatchObject({ ok: false, stage: "element", issue: { code: "NOT_CONFIGURED" } });
  });
});
