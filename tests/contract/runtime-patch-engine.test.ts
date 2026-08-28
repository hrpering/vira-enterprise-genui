import { describe, expect, it } from "vitest";
import { applyRuntimePatch, createRuntimeState } from "../../packages/runtime-core/src/index.js";

function runtimeState() {
  const result = createRuntimeState("experience-1", {
    version: "1",
    id: "plan-1",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: {
      origin: "IST",
      destination: "BER",
      status: "draft",
      draft: true,
      selected: [],
      traveler: { adult: 1 },
    },
    capabilities: { required: [{ version: "1", id: "select-date" }] },
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

describe("runtime patch engine", () => {
  it("applies ordered operations atomically and increments revision once", () => {
    const current = runtimeState();
    const result = applyRuntimePatch(current, {
      version: "1",
      operations: [
        { op: "set", path: "/state/date", value: "2026-09-02" },
        { op: "merge", path: "/state/traveler", value: { child: 1 } },
        { op: "append", path: "/state/selected", value: "flight-42" },
        { op: "replace", path: "/state/status", value: "ready" },
        { op: "remove", path: "/state/draft" },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.revision).toBe(1);
    expect(result.value.plan.state).toMatchObject({
      date: "2026-09-02",
      traveler: { adult: 1, child: 1 },
      selected: ["flight-42"],
      status: "ready",
    });
    expect(Object.hasOwn(result.value.plan.state, "draft")).toBe(false);
    expect(current.revision).toBe(0);
    expect(current.plan.state.status).toBe("draft");
    expect(current.plan.state.selected).toEqual([]);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.plan.state)).toBe(true);
  });

  it("preserves source order when operations target the same value", () => {
    const result = applyRuntimePatch(runtimeState(), {
      version: "1",
      operations: [
        { op: "set", path: "/state/status", value: "first" },
        { op: "replace", path: "/state/status", value: "second" },
      ],
    });
    expect(result).toMatchObject({ ok: true, value: { plan: { state: { status: "second" } } } });
  });

  it("returns the same RuntimeState for an empty patch", () => {
    const current = runtimeState();
    const result = applyRuntimePatch(current, { version: "1", operations: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(current);
    expect(result.value.revision).toBe(0);
  });

  it("rejects missing paths and target-type mismatches without publishing partial state", () => {
    const current = runtimeState();
    expect(applyRuntimePatch(current, {
      version: "1",
      operations: [{ op: "replace", path: "/state/missing", value: true }],
    })).toMatchObject({ ok: false, issue: { code: "PATH_NOT_FOUND" } });

    expect(applyRuntimePatch(current, {
      version: "1",
      operations: [{ op: "append", path: "/state/status", value: "x" }],
    })).toMatchObject({ ok: false, issue: { code: "INVALID_TARGET_TYPE" } });

    expect(current.revision).toBe(0);
    expect(current.plan.state.status).toBe("draft");
  });

  it("rejects array writes that would create holes", () => {
    expect(applyRuntimePatch(runtimeState(), {
      version: "1",
      operations: [{ op: "set", path: "/state/selected/0", value: "flight-1" }],
    })).toMatchObject({ ok: false, issue: { code: "INVALID_ARRAY_INDEX" } });
  });

  it("cannot patch RuntimeState identity or revision fields", () => {
    const current = runtimeState();
    for (const [path, value] of [["/revision", 99], ["/experienceId", "hijacked"]] as const) {
      const result = applyRuntimePatch(current, {
        version: "1",
        operations: [{ op: "set", path, value }],
      });
      expect(result).toMatchObject({ ok: false, issue: { code: "RESULT_INVALID" } });
      expect(current.revision).toBe(0);
      expect(current.experienceId).toBe("experience-1");
    }
  });

  it("rejects revision overflow before applying a non-empty patch", () => {
    const current = runtimeState();
    const forgedMaxRevision = { ...current, revision: Number.MAX_SAFE_INTEGER };
    const result = applyRuntimePatch(forgedMaxRevision, {
      version: "1",
      operations: [{ op: "replace", path: "/state/status", value: "ready" }],
    });
    expect(result).toMatchObject({ ok: false, issue: { code: "REVISION_OVERFLOW", path: "$.revision" } });
    expect(current.plan.state.status).toBe("draft");
  });

  it("rejects patches whose final document violates ExperiencePlan", () => {
    const current = runtimeState();
    const result = applyRuntimePatch(current, {
      version: "1",
      operations: [{ op: "remove", path: "/intent" }],
    });
    expect(result).toMatchObject({ ok: false, issue: { code: "RESULT_INVALID", path: "$.result.intent" } });
    expect(current.plan.intent.name).toBe("search");
  });

  it("rejects invalid patch protocol input before mutation", () => {
    const current = runtimeState();
    const result = applyRuntimePatch(current, {
      version: "1",
      operations: [{ op: "set", path: "/state/__proto__/polluted", value: true }],
    });
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_PATCH" } });
    expect(current.revision).toBe(0);
  });
});
