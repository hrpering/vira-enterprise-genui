import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderStudioRuntimeReactView } from "../../packages/studio-runtime-react/src/index.js";
import {
  createStudioExperienceElementClass,
  defineStudioExperienceElement,
} from "../../packages/studio-web-component/src/index.js";
import type {
  StudioExperienceReactRoot,
  StudioExperienceElementPlatform,
} from "../../packages/studio-web-component/src/index.js";
import type { StudioRuntimeSession } from "../../packages/studio-runtime/src/index.js";

const catalog = {
  version: "1",
  id: "consumer.components",
  brandId: "consumer",
  components: [{
    ref: "consumer.heading",
    label: "Heading",
    category: "content",
    kind: "content",
    props: [{ key: "text", type: "string", required: true, bindable: true }],
    slots: [],
    events: [],
  }],
};

const renderers = {
  "consumer.heading": ({ props }: { props: Readonly<Record<string, unknown>> }) => createElement("h2", null, String(props.text)),
};

function session(): StudioRuntimeSession {
  return {
    currentViewId: () => "main",
    currentView: () => ({
      ok: true,
      value: {
        experienceId: "consumer.example",
        viewId: "main",
        nodes: [{
          id: "title",
          sourceNodeId: "title",
          component: "consumer.heading",
          order: 0,
          props: { text: "Same runtime" },
          eventPayloads: {},
        }],
      },
    }),
    currentRuntimeState: () => ({}),
    dispatch: () => ({ ok: false }),
    applyHostPatch: () => ({ ok: false }),
    complete: () => ({ ok: false }),
    dispose: () => undefined,
  } as unknown as StudioRuntimeSession;
}

class FakeHTMLElement {}

function platform(rendered: unknown[]): StudioExperienceElementPlatform {
  const registry = new Map<string, CustomElementConstructor>();
  return {
    HTMLElementBase: FakeHTMLElement as unknown as typeof HTMLElement,
    registry: {
      define: (name, constructor) => { registry.set(name, constructor); },
      get: (name) => registry.get(name),
    },
    rootFactory: () => ({
      render: (node) => { rendered.push(node); },
      unmount: () => undefined,
    } satisfies StudioExperienceReactRoot),
  };
}

describe("Studio React and Web Component consumer parity", () => {
  it("renders the same Studio runtime session through React and the custom-element bridge", () => {
    const runtime = session();
    const direct = renderStudioRuntimeReactView({ session: runtime, componentCatalog: catalog, renderers });
    expect(direct.ok).toBe(true);

    const rendered: unknown[] = [];
    const ElementClass = createStudioExperienceElementClass(platform(rendered));
    const element = new ElementClass();
    expect(element.configure({ session: runtime, componentCatalog: catalog, renderers })).toEqual({ ok: true });
    expect(element.currentViewId()).toBe("main");
    expect(rendered).toHaveLength(1);
    expect(element.refresh()).toEqual({ ok: true });
    expect(rendered).toHaveLength(2);
  });

  it("registers once and rejects duplicate custom-element registration", () => {
    const rendered: unknown[] = [];
    const target = platform(rendered);
    expect(defineStudioExperienceElement(target)).toMatchObject({ ok: true, value: { tagName: "vira-studio-experience" } });
    expect(defineStudioExperienceElement(target)).toMatchObject({
      ok: false,
      issue: { code: "TAG_ALREADY_DEFINED" },
    });
  });

  it("rejects unknown configuration fields instead of silently dropping them", () => {
    const ElementClass = createStudioExperienceElementClass(platform([]));
    const element = new ElementClass();
    expect(element.configure({ session: session(), componentCatalog: catalog, renderers, backendUrl: "https://forbidden.example" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_CONFIGURATION", path: "$.backendUrl" },
    });
  });
});
