import { describe, expect, it } from "vitest";
import {
  createRuntimeError,
  runtimeErrorCategory,
  runtimeErrorMessage,
} from "../../packages/runtime-core/src/index.js";

describe("runtime error taxonomy", () => {
  it("creates frozen serializable errors with derived category and message", () => {
    const result = createRuntimeError({
      code: "runtime.permission.denied",
      path: "$.action.type",
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        version: "1",
        code: "runtime.permission.denied",
        category: "permission",
        message: "runtime permission denied",
        path: "$.action.type",
      },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(JSON.parse(JSON.stringify(result.value))).toEqual(result.value);
  });

  it("derives categories and messages from canonical codes", () => {
    expect(runtimeErrorCategory("runtime.state.invalid")).toBe("state");
    expect(runtimeErrorCategory("runtime.patch.invalid")).toBe("validation");
    expect(runtimeErrorCategory("runtime.patch.rejected")).toBe("conflict");
    expect(runtimeErrorCategory("runtime.internal.invariant")).toBe("internal");
    expect(runtimeErrorMessage("runtime.permission.confirmation-required")).toBe("runtime confirmation is required");
  });

  it("rejects caller-controlled message/category and raw exception/detail fields", () => {
    for (const field of ["message", "category", "stack", "cause", "exception", "timestamp", "statusCode", "details"] as const) {
      expect(createRuntimeError({
        code: "runtime.internal.invariant",
        [field]: "not-canonical",
      })).toMatchObject({ ok: false, issue: { code: "UNKNOWN_FIELD", path: `$.${field}` } });
    }
  });

  it("rejects unknown codes and unsafe paths", () => {
    expect(createRuntimeError({ code: "planner.failed" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_CODE" },
    });
    expect(createRuntimeError({ code: "runtime.action.invalid", path: "$.bad\npath" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PATH" },
    });
  });

  it("does not introduce planner/composer/renderer error ownership into runtime-core", () => {
    for (const code of ["planner.failed", "composer.failed", "renderer.failed"]) {
      expect(createRuntimeError({ code }).ok).toBe(false);
    }
  });
});
