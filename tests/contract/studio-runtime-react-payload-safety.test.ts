import { describe, expect, it } from "vitest";
import type { StudioRuntimeDispatchResult, StudioRuntimeSession } from "../../packages/studio-runtime/src/index.js";
import {
  renderStudioRuntimeReactView,
  type StudioRuntimeReactRenderer,
} from "../../packages/studio-runtime-react/src/index.js";

function componentCatalog() {
  return {
    version: "1",
    id: "runtime.react.payload.components",
    brandId: "runtime.react.payload",
    components: [{
      ref: "runtime.react.payload.button",
      label: "Button",
      category: "action",
      kind: "action",
      props: [],
      slots: [],
      events: [{ name: "press", label: "Press" }],
    }],
  };
}

function rejectedDispatch(): StudioRuntimeDispatchResult {
  return {
    ok: false,
    stage: "studio",
    issue: {
      code: "INVALID_INPUT",
      path: "$.payload",
      message: "payload rejected",
    },
  };
}

function sessionWith(
  mappedPayload: Readonly<Record<string, unknown>>,
  capture: (payload: unknown) => void,
): StudioRuntimeSession {
  return {
    currentViewId: () => "main",
    currentView: () => ({
      ok: true,
      value: {
        experienceId: "runtime.react.payload",
        viewId: "main",
        nodes: [{
          id: "button",
          sourceNodeId: "button",
          component: "runtime.react.payload.button",
          order: 0,
          props: {},
          eventPayloads: { press: mappedPayload },
        }],
      },
    }),
    currentRuntimeState: () => ({}),
    dispatch: (input: { readonly payload?: unknown }) => {
      capture(input.payload);
      return rejectedDispatch();
    },
    applyHostPatch: () => ({ ok: false }),
    complete: () => ({ ok: false }),
    dispose: () => {},
  } as unknown as StudioRuntimeSession;
}

describe("Studio runtime React event payload safety", () => {
  it("does not invoke accessors while handling renderer payloads", () => {
    let getterCalls = 0;
    let captured: unknown;
    const payload: Record<string, unknown> = {};
    Object.defineProperty(payload, "offerId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "forged";
      },
    });

    const renderer: StudioRuntimeReactRenderer = ({ emit }) => {
      emit("press", payload);
      return null;
    };
    const result = renderStudioRuntimeReactView({
      session: sessionWith({ offerId: "canonical" }, (value) => { captured = value; }),
      componentCatalog: componentCatalog(),
      renderers: { "runtime.react.payload.button": renderer },
    });

    expect(result.ok).toBe(true);
    expect(getterCalls).toBe(0);
    expect(captured).toBeNull();
    expect(getterCalls).toBe(0);
  });

  it("merges safe renderer fields while canonical mapped payload fields stay authoritative", () => {
    let captured: unknown;
    const renderer: StudioRuntimeReactRenderer = ({ emit }) => {
      emit("press", { offerId: "forged", clientNote: "keep" });
      return null;
    };
    const result = renderStudioRuntimeReactView({
      session: sessionWith({ offerId: "canonical" }, (value) => { captured = value; }),
      componentCatalog: componentCatalog(),
      renderers: { "runtime.react.payload.button": renderer },
    });

    expect(result.ok).toBe(true);
    expect(captured).toEqual({
      offerId: "canonical",
      clientNote: "keep",
    });
  });
});
