import { describe, expect, it } from "vitest";
import { generateStudioDraft } from "../../packages/studio-ai/src/index.js";
import type { StudioAiRequest } from "../../packages/studio-ai/src/index.js";

function components() {
  return {
    version: "1",
    id: "pegasus.studio.components",
    brandId: "pegasus",
    components: [
      { ref: "pegasus.component.button", label: "Button", category: "action", kind: "action", props: [], slots: [], events: [{ name: "press", label: "Press" }] },
      { ref: "pegasus.component.flight-list", label: "Flight List", category: "flight", kind: "content", props: [{ key: "items", type: "string", required: true, bindable: true }], slots: [], events: [] },
    ],
  };
}

function sources() {
  return { version: "1", id: "pegasus.studio.data", sources: [{ kind: "domain", path: "travel.flight.results", label: "Flight results", valueType: "string" }] };
}

function actions() {
  return { version: "1", id: "pegasus.studio.actions", mappings: [{ event: "flight.search.submit", actionType: "travel.flight.search.submit" }] };
}

function candidate() {
  return {
    version: "1",
    id: "pegasus.flight-search",
    recipeId: "pegasus.flight-search",
    entryView: "search",
    views: [
      { id: "search", nodes: [{ id: "submit", component: "pegasus.component.button", order: 0, props: {} }] },
      { id: "results", nodes: [{ id: "flights", component: "pegasus.component.flight-list", order: 0, props: {} }] },
    ],
    bindings: [{ viewId: "results", nodeId: "flights", prop: "items", source: { kind: "domain", path: "travel.flight.results" } }],
    interactions: [{ viewId: "search", nodeId: "submit", event: "press", actionEvent: "flight.search.submit", routes: [{ outcome: "success", viewId: "results" }] }],
  };
}

function input() {
  return {
    prompt: "Create a simple flight search experience and show results after a successful search.",
    experienceId: "pegasus.flight-search",
    recipeId: "pegasus.flight-search",
    componentCatalog: components(),
    bindingSourceCatalog: sources(),
    actionAdapter: actions(),
  };
}

describe("Studio AI-assisted authoring", () => {
  it("passes only the bounded authoring vocabulary to a host provider and validates its candidate", async () => {
    let request: StudioAiRequest | undefined;
    const result = await generateStudioDraft(input(), {
      generate(value) {
        request = value;
        return candidate();
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !request) return;
    expect(request.identity).toEqual({ experienceId: "pegasus.flight-search", recipeId: "pegasus.flight-search" });
    expect(request.actionEvents).toEqual(["flight.search.submit"]);
    expect(JSON.stringify(request)).not.toContain("travel.flight.search.submit");
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  it("rejects generated identity changes", async () => {
    const result = await generateStudioDraft(input(), { generate: () => ({ ...candidate(), id: "other.experience" }) });
    expect(result).toMatchObject({ ok: false, issue: { code: "IDENTITY_MISMATCH" } });
  });

  it("rejects generated unregistered action aliases", async () => {
    const base = candidate();
    const result = await generateStudioDraft(input(), { generate: () => ({ ...base, interactions: [{ ...base.interactions[0]!, actionEvent: "admin.delete" }] }) });
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_CANDIDATE" } });
  });

  it("redacts provider exceptions", async () => {
    const result = await generateStudioDraft(input(), { generate: () => { throw new Error("secret provider key and internal endpoint"); } });
    expect(result).toMatchObject({ ok: false, issue: { code: "PROVIDER_FAILED", message: "Studio AI provider failed while generating a draft" } });
    if (!result.ok) expect(result.issue.message).not.toContain("secret provider key");
  });

  it("does not accept invalid base documents before calling the provider", async () => {
    let called = false;
    const result = await generateStudioDraft({ ...input(), baseDocument: { ...candidate(), recipeId: "other.recipe" } }, {
      generate() {
        called = true;
        return candidate();
      },
    });
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_BASE_DOCUMENT" } });
    expect(called).toBe(false);
  });
});