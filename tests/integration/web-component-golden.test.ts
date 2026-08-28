import { describe, expect, it } from "vitest";
import { composeExperience } from "../../packages/composer/src/index.js";
import {
  VIRA_EXPERIENCE_DOM_EVENTS,
  defineViraExperienceElement,
} from "../../packages/web-component/src/index.js";
import type { ViraExperienceCustomEventFactory } from "../../packages/web-component/src/index.js";
import type { RuntimeWebDomPort } from "../../packages/runtime-web/src/index.js";

const capability = (id: string) => ({ version: "1", id });

function plan() {
  return {
    version: "1",
    id: "web-component-golden-plan",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: { status: "draft" },
    capabilities: {
      required: [capability("submit-search")],
      available: [],
      future: [],
    },
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

function registry() {
  const definitions = new Map<string, CustomElementConstructor>();
  return {
    definitions,
    api: {
      define(name: string, constructor: CustomElementConstructor) {
        if (definitions.has(name)) throw new Error("duplicate");
        definitions.set(name, constructor);
      },
      get(name: string) {
        return definitions.get(name);
      },
    } as Pick<CustomElementRegistry, "define" | "get">,
  };
}

function configuration(log: string[], ids: { value: number }) {
  const domPort: RuntimeWebDomPort = {
    measureContainerInlineSizePx() {
      log.push("measure:360");
      return 360;
    },
    begin(context) {
      log.push(`begin:${context.planId}:${context.responsiveBand.id}`);
      return {
        createRegion(region) {
          log.push(`region:${region.id}`);
          return {
            mountComponent(binding) {
              log.push(`mount:${binding.component}`);
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

  return {
    componentAdapter: {
      version: "1",
      id: "golden.web.components",
      mappings: [{ capability: capability("submit-search"), component: "golden.component.search-button" }],
    },
    actionAdapter: {
      version: "1",
      id: "golden.web.actions",
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
    responsive: {
      version: "1",
      strategy: "container",
      bands: [
        { id: "compact", minInlineSizePx: 0 },
        { id: "regular", minInlineSizePx: 320 },
      ],
    },
    domPort,
    idFactory: {
      nextId() {
        ids.value += 1;
        return `web-component-golden-action-${ids.value}`;
      },
    },
  };
}

describe("web-component deterministic golden integration", () => {
  it("locks registration, Runtime Web delegation, native notifications, cleanup, remount, and dispose", () => {
    const fakeRegistry = registry();
    const defined = defineViraExperienceElement({
      HTMLElementBase: FakeHTMLElement as unknown as typeof HTMLElement,
      registry: fakeRegistry.api,
      customEventFactory: eventFactory,
    });
    expect(defined.ok).toBe(true);
    if (!defined.ok) return;

    const element = new defined.value.elementClass() as InstanceType<typeof defined.value.elementClass> & FakeHTMLElement;
    const log: string[] = [];
    const ids = { value: 0 };

    expect(element.configure(configuration(log, ids))).toEqual({ ok: true });
    expect(log).toEqual([]);

    expect(element.mount({
      experienceId: "web-component-golden-experience-1",
      plan: plan(),
      composition: composition(),
    }).ok).toBe(true);
    expect(log).toEqual([
      "measure:360",
      "begin:web-component-golden-plan:regular",
      "region:primary",
      "mount:golden.component.search-button",
      "commit",
    ]);
    expect(element.currentState()?.revision).toBe(0);

    const user = element.dispatch({ event: "search.submit", payload: { query: "BER" } });
    expect(user).toMatchObject({
      ok: true,
      value: {
        action: { source: "user", type: "travel.flight.search.submit" },
        stateChanged: false,
        effects: [{ type: "host-action" }],
      },
    });
    expect(element.currentState()?.revision).toBe(0);

    const host = element.patch(patch());
    expect(host).toMatchObject({
      ok: true,
      value: {
        action: { source: "host", type: "runtime.patch.apply" },
        stateChanged: true,
        state: { revision: 1, plan: { state: { status: "ready" } } },
      },
    });
    expect(element.currentState()?.revision).toBe(1);

    const idsBeforeInvalid = ids.value;
    const invalid = element.dispatch({ event: "unknown.event" });
    expect(invalid).toMatchObject({ ok: false, stage: "event" });
    expect(ids.value).toBe(idsBeforeInvalid);

    expect(element.emitted.map((event) => event.type)).toEqual([
      VIRA_EXPERIENCE_DOM_EVENTS.action,
      VIRA_EXPERIENCE_DOM_EVENTS.effect,
      VIRA_EXPERIENCE_DOM_EVENTS.action,
      VIRA_EXPERIENCE_DOM_EVENTS.statechange,
      VIRA_EXPERIENCE_DOM_EVENTS.error,
    ]);
    expect(element.emitted[0]?.detail).toMatchObject({ source: "user" });
    expect(element.emitted[1]?.detail).toMatchObject({ type: "host-action" });
    expect(element.emitted[2]?.detail).toMatchObject({ source: "host" });
    expect(element.emitted[3]?.detail).toBe(element.currentState());
    expect(element.emitted[4]?.detail).toBe(invalid);
    expect(element.emitted.every((event) => event.bubbles && event.composed && !event.cancelable)).toBe(true);

    element.disconnectedCallback();
    expect(element.isMounted()).toBe(false);
    expect(log.slice(-2)).toEqual(["dispose:golden.component.search-button", "dispose:root"]);

    expect(element.mount({
      experienceId: "web-component-golden-experience-2",
      plan: plan(),
      composition: composition(),
    }).ok).toBe(true);
    expect(element.currentState()?.revision).toBe(0);
    expect(element.currentState()?.plan.state.status).toBe("draft");

    element.dispose();
    element.dispose();
    expect(element.isDisposed()).toBe(true);
    expect(element.isMounted()).toBe(false);
    expect(element.mount({
      experienceId: "web-component-golden-experience-3",
      plan: plan(),
      composition: composition(),
    })).toMatchObject({ ok: false, stage: "element", issue: { code: "ELEMENT_DISPOSED" } });
  });
});
