import { describe, expect, it } from "vitest";
import {
  RUNTIME_LIFECYCLES,
  canTransitionRuntimeLifecycle,
  createRuntimeState,
  transitionRuntimeLifecycle,
} from "../../packages/runtime-core/src/index.js";

function runtimeState() {
  const result = createRuntimeState("experience-1", {
    version: "1",
    id: "plan-1",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: {},
    capabilities: {},
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

describe("runtime lifecycle", () => {
  it("starts a created RuntimeState without an idle placeholder state", () => {
    const state = runtimeState();
    expect(state.lifecycle).toBe("created");
    expect(state.revision).toBe(0);
    expect(RUNTIME_LIFECYCLES).not.toContain("idle");
  });

  it("accepts the normal created -> mounting -> active -> updating -> active -> completed -> disposed flow", () => {
    let current = runtimeState();
    for (const target of ["mounting", "active", "updating", "active", "completed", "disposed"] as const) {
      const result = transitionRuntimeLifecycle(current, target);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      current = result.value;
    }
    expect(current.lifecycle).toBe("disposed");
    expect(current.revision).toBe(6);
  });

  it("permits failure/cancellation exits and only disposal after terminal states", () => {
    expect(canTransitionRuntimeLifecycle("created", "failed")).toBe(true);
    expect(canTransitionRuntimeLifecycle("mounting", "cancelled")).toBe(true);
    expect(canTransitionRuntimeLifecycle("active", "failed")).toBe(true);
    expect(canTransitionRuntimeLifecycle("failed", "disposed")).toBe(true);
    expect(canTransitionRuntimeLifecycle("completed", "active")).toBe(false);
    expect(canTransitionRuntimeLifecycle("disposed", "active")).toBe(false);
  });

  it("rejects illegal and unknown transitions without mutating state", () => {
    const current = runtimeState();
    const illegal = transitionRuntimeLifecycle(current, "active");
    expect(illegal).toMatchObject({ ok: false, issue: { code: "ILLEGAL_LIFECYCLE_TRANSITION" } });
    const unknown = transitionRuntimeLifecycle(current, "browser-mounted");
    expect(unknown).toMatchObject({ ok: false, issue: { code: "INVALID_TARGET_LIFECYCLE" } });
    expect(current.lifecycle).toBe("created");
    expect(current.revision).toBe(0);
  });

  it("creates a new frozen state and preserves plan identity/content", () => {
    const current = runtimeState();
    const result = transitionRuntimeLifecycle(current, "mounting");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toBe(current);
    expect(result.value.plan).toBe(current.plan);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(result.value.lifecycle).toBe("mounting");
    expect(result.value.revision).toBe(1);
  });

  it("rejects lifecycle revision overflow", () => {
    const current = runtimeState();
    const overflow = Object.freeze({ ...current, revision: Number.MAX_SAFE_INTEGER });
    expect(transitionRuntimeLifecycle(overflow, "mounting")).toMatchObject({
      ok: false,
      issue: { code: "REVISION_OVERFLOW", path: "$.revision" },
    });
  });
});
