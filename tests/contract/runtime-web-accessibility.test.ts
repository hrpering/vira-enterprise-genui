import { describe, expect, it } from "vitest";
import { composeExperience } from "../../packages/composer/src/index.js";
import {
  ACCESSIBILITY_ERROR_ANNOUNCEMENTS,
  prepareAccessibleRenderModel,
} from "../../packages/runtime-web/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

const capability = (id: string) => ({ version: "1", id });

function plan() {
  return {
    version: "1",
    id: "plan-1",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: {},
    capabilities: {
      required: [capability("select-date")],
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

function componentAdapter() {
  return {
    version: "1",
    id: "acme.web.components",
    mappings: [{ capability: capability("select-date"), component: "acme.component.date-picker" }],
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

describe("runtime-web accessibility contract", () => {
  it("wraps only a source-validated RenderModel with explicit semantic accessibility policy", () => {
    const result = prepareAccessibleRenderModel({
      composition: composition(),
      plan: plan(),
      componentAdapter: componentAdapter(),
      accessibility: accessibility(),
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        render: { planId: "plan-1", regions: [{ bindings: [{ component: "acme.component.date-picker" }] }] },
        accessibility: accessibility(),
      },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.accessibility)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("requires every accessibility decision explicitly and exposes no hidden defaults", () => {
    for (const missing of ["focusOnMount", "focusOnUpdate", "statusAnnouncements", "errorAnnouncements"] as const) {
      const policy = { ...accessibility() } as Record<string, unknown>;
      delete policy[missing];
      expect(prepareAccessibleRenderModel({
        composition: composition(),
        plan: plan(),
        componentAdapter: componentAdapter(),
        accessibility: policy,
      })).toMatchObject({ ok: false });
    }
  });

  it("does not allow error announcements to be disabled", () => {
    expect(ACCESSIBILITY_ERROR_ANNOUNCEMENTS).not.toContain("off");
    expect(prepareAccessibleRenderModel({
      composition: composition(),
      plan: plan(),
      componentAdapter: componentAdapter(),
      accessibility: { ...accessibility(), errorAnnouncements: "off" },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_ERROR_ANNOUNCEMENTS", path: "$.accessibility.errorAnnouncements" } });
  });

  it("rejects DOM, ARIA, selector, styling, raw label, and callback fields", () => {
    for (const field of ["ariaLive", "ariaLabel", "selector", "tabIndex", "css", "label", "onFocus", "callback", "component"]) {
      expect(prepareAccessibleRenderModel({
        composition: composition(),
        plan: plan(),
        componentAdapter: componentAdapter(),
        accessibility: { ...accessibility(), [field]: "forbidden" },
      })).toMatchObject({ ok: false, issue: { code: "UNKNOWN_POLICY_FIELD", path: `$.accessibility.${field}` } });
    }
  });

  it("cannot use accessibility metadata to bypass render-model integrity", () => {
    const forged = {
      ...composition(),
      regions: [
        ...composition().regions,
        { id: "injected", role: "supporting", capabilities: [capability("admin.delete")] },
      ],
    };
    expect(prepareAccessibleRenderModel({
      composition: forged,
      plan: plan(),
      componentAdapter: componentAdapter(),
      accessibility: accessibility(),
    })).toMatchObject({ ok: false, issue: { code: "INVALID_RENDER_MODEL" } });
  });

  it("rejects accessor-backed accessibility policy without executing getters", () => {
    let calls = 0;
    const policy: Record<string, unknown> = {
      version: "1",
      focusOnMount: "first-primary",
      focusOnUpdate: "primary-if-lost",
      statusAnnouncements: "polite",
    };
    Object.defineProperty(policy, "errorAnnouncements", {
      enumerable: true,
      get() {
        calls += 1;
        return "assertive";
      },
    });
    expect(prepareAccessibleRenderModel({
      composition: composition(),
      plan: plan(),
      componentAdapter: componentAdapter(),
      accessibility: policy,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_POLICY" } });
    expect(calls).toBe(0);
  });
});