import { describe, expect, it } from "vitest";
import { composeExperience } from "../../packages/composer/src/index.js";
import {
  VIRA_EXPERIENCE_TAG_NAME,
  createViraExperienceElementClass,
  defineViraExperienceElement,
} from "../../packages/web-component/src/index.js";
import type { RuntimeWebDomPort } from "../../packages/runtime-web/src/index.js";

const capability = (id: string) => ({ version: "1", id });

function plan() {
  return {
    version: "1",
    id: "element-plan-1",
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

function configuration(log: string[], ids: { value: number }) {
  const domPort: RuntimeWebDomPort = {
    measureContainerInlineSizePx() { log.push("measure"); return 320; },
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
      rules: [{ subject: "action", id: "travel.flight.search.submit", effect: "allow" }],
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
    idFactory: { nextId() { ids.value += 1; return `element-action-${ids.value}`; } },
  };
}

class FakeHTMLElement {}

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

describe("vira-experience Web Component shell", () => {
  it("is import/platform-safe and registers the canonical custom-element tag", () => {
    const fakeRegistry = registry();
    const defined = defineViraExperienceElement({
      HTMLElementBase: FakeHTMLElement as unknown as typeof HTMLElement,
      registry: fakeRegistry.api,
    });
    expect(defined).toMatchObject({ ok: true, value: { tagName: "vira-experience" } });
    expect(VIRA_EXPERIENCE_TAG_NAME).toBe("vira-experience");
    expect(fakeRegistry.definitions.has("vira-experience")).toBe(true);

    expect(defineViraExperienceElement({
      HTMLElementBase: FakeHTMLElement as unknown as typeof HTMLElement,
      registry: fakeRegistry.api,
    })).toMatchObject({ ok: false, issue: { code: "TAG_ALREADY_DEFINED" } });
  });

  it("delegates configuration/mount/state to Runtime Web and unmounts on disconnect", () => {
    const ElementClass = createViraExperienceElementClass(FakeHTMLElement as unknown as typeof HTMLElement);
    const element = new ElementClass();
    const log: string[] = [];
    const ids = { value: 0 };

    expect(element.mount({})).toMatchObject({ ok: false, stage: "element", issue: { code: "NOT_CONFIGURED" } });
    expect(element.configure(configuration(log, ids))).toEqual({ ok: true });
    expect(element.isConfigured()).toBe(true);
    expect(log).toEqual([]);

    expect(element.mount({ experienceId: "element-experience-1", plan: plan(), composition: composition() }).ok).toBe(true);
    expect(element.isMounted()).toBe(true);
    expect(element.currentState()?.plan.id).toBe("element-plan-1");
    expect(log).toEqual(["measure", "begin", "mount", "commit"]);

    element.disconnectedCallback();
    expect(element.isMounted()).toBe(false);
    expect(log.slice(-2)).toEqual(["dispose:component", "dispose:root"]);

    expect(element.mount({ experienceId: "element-experience-2", plan: plan(), composition: composition() }).ok).toBe(true);
    expect(element.isMounted()).toBe(true);
  });

  it("keeps configuration one-time and dispose permanent/idempotent", () => {
    const ElementClass = createViraExperienceElementClass(FakeHTMLElement as unknown as typeof HTMLElement);
    const element = new ElementClass();
    const log: string[] = [];
    const ids = { value: 0 };
    expect(element.configure(configuration(log, ids))).toEqual({ ok: true });
    expect(element.configure(configuration(log, ids))).toMatchObject({ ok: false, stage: "element", issue: { code: "ALREADY_CONFIGURED" } });

    expect(element.mount({ experienceId: "element-experience-1", plan: plan(), composition: composition() }).ok).toBe(true);
    element.dispose();
    element.dispose();
    expect(element.isDisposed()).toBe(true);
    expect(element.isMounted()).toBe(false);
    expect(element.configure(configuration(log, ids))).toMatchObject({ ok: false, stage: "element", issue: { code: "ELEMENT_DISPOSED" } });
    expect(element.mount({ experienceId: "element-experience-2", plan: plan(), composition: composition() })).toMatchObject({ ok: false, stage: "element", issue: { code: "ELEMENT_DISPOSED" } });
  });
});
