import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RUNTIME_LIFECYCLES,
  RUNTIME_SESSION_CACHE_STATUSES,
  RUNTIME_SESSION_EVENT_TYPES,
  RUNTIME_SESSION_EVENT_VERSION,
  RUNTIME_SESSION_ID_MAX_LENGTH,
  RUNTIME_SESSION_STATE_VERSION,
  createRuntimeSessionState,
  parseRuntimeSessionState,
  restoreRuntimeSessionState,
  transitionRuntimeSession,
  type RuntimeSessionEventType,
  type RuntimeSessionState,
} from "../../packages/runtime-core/src/index.js";

function createSession(
  visibility: "foreground" | "background" = "foreground",
  connectivity: "connected" | "disconnected" = "connected",
): RuntimeSessionState {
  const result = createRuntimeSessionState("session-1", { visibility, connectivity });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

function event(type: RuntimeSessionEventType) {
  return { version: RUNTIME_SESSION_EVENT_VERSION, type } as const;
}

function throwingProxy(secret = "SESSION_SECRET"): object {
  return new Proxy({}, {
    getPrototypeOf() {
      throw new Error(secret);
    },
    ownKeys() {
      throw new Error(secret);
    },
    getOwnPropertyDescriptor() {
      throw new Error(secret);
    },
  });
}

function revokedProxy(): object {
  const revocable = Proxy.revocable({}, {});
  revocable.revoke();
  return revocable.proxy;
}

describe("MASTER-06 platform-neutral runtime session kernel", () => {
  it("preserves the existing execution lifecycle as a separate unchanged axis", () => {
    expect(RUNTIME_LIFECYCLES).toEqual([
      "created",
      "mounting",
      "active",
      "updating",
      "completed",
      "cancelled",
      "failed",
      "disposed",
    ]);
    expect(RUNTIME_LIFECYCLES).not.toContain("foreground");
    expect(RUNTIME_LIFECYCLES).not.toContain("background");
    expect(RUNTIME_LIFECYCLES).not.toContain("disconnected");
    expect(RUNTIME_LIFECYCLES).not.toContain("restored");
  });

  it("creates an explicit immutable live session without guessing host availability", () => {
    const result = createRuntimeSessionState("session-1", {
      visibility: "background",
      connectivity: "disconnected",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        version: RUNTIME_SESSION_STATE_VERSION,
        sessionId: "session-1",
        revision: 0,
        visibility: "background",
        connectivity: "disconnected",
        continuity: "live",
        cacheStatus: "inactive",
      },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(JSON.parse(JSON.stringify(result.value))).toEqual(result.value);
  });

  it("keeps visibility and connectivity orthogonal and increments only the session revision", () => {
    let state = createSession();

    const background = transitionRuntimeSession(state, event("background"));
    expect(background).toMatchObject({
      ok: true,
      value: {
        changed: true,
        state: { revision: 1, visibility: "background", connectivity: "connected" },
      },
    });
    if (!background.ok) return;
    state = background.value.state;

    const disconnected = transitionRuntimeSession(state, event("disconnect"));
    expect(disconnected).toMatchObject({
      ok: true,
      value: {
        changed: true,
        state: { revision: 2, visibility: "background", connectivity: "disconnected" },
      },
    });
    if (!disconnected.ok) return;
    state = disconnected.value.state;

    const resumed = transitionRuntimeSession(state, event("resume"));
    expect(resumed).toMatchObject({
      ok: true,
      value: {
        changed: true,
        state: { revision: 3, visibility: "foreground", connectivity: "disconnected" },
      },
    });
    if (!resumed.ok) return;
    state = resumed.value.state;

    const reconnected = transitionRuntimeSession(state, event("reconnect"));
    expect(reconnected).toMatchObject({
      ok: true,
      value: {
        changed: true,
        state: {
          revision: 4,
          visibility: "foreground",
          connectivity: "connected",
          continuity: "live",
          cacheStatus: "inactive",
        },
      },
    });
  });

  it("treats duplicate platform signals as deterministic no-ops without revision churn", () => {
    const foreground = createSession("foreground", "connected");
    expect(transitionRuntimeSession(foreground, event("foreground"))).toMatchObject({
      ok: true,
      value: { changed: false, state: { revision: 0 } },
    });
    expect(transitionRuntimeSession(foreground, event("resume"))).toMatchObject({
      ok: true,
      value: { changed: false, state: { revision: 0 } },
    });
    expect(transitionRuntimeSession(foreground, event("reconnect"))).toMatchObject({
      ok: true,
      value: { changed: false, state: { revision: 0 } },
    });

    const backgroundDisconnected = createSession("background", "disconnected");
    expect(transitionRuntimeSession(backgroundDisconnected, event("background"))).toMatchObject({
      ok: true,
      value: { changed: false, state: { revision: 0 } },
    });
    expect(transitionRuntimeSession(backgroundDisconnected, event("disconnect"))).toMatchObject({
      ok: true,
      value: { changed: false, state: { revision: 0 } },
    });
  });

  it("restores persisted session state explicitly and requires external cache verification", () => {
    const live = createSession("background", "disconnected");
    const restored = restoreRuntimeSessionState(live);
    expect(restored).toEqual({
      ok: true,
      value: {
        changed: true,
        state: {
          version: "1",
          sessionId: "session-1",
          revision: 1,
          visibility: "background",
          connectivity: "disconnected",
          continuity: "restored",
          cacheStatus: "verification-required",
        },
      },
    });
    if (!restored.ok) return;
    expect(parseRuntimeSessionState(restored.value.state)).toEqual({
      ok: true,
      value: restored.value.state,
    });

    const foreground = transitionRuntimeSession(restored.value.state, event("foreground"));
    expect(foreground).toMatchObject({
      ok: true,
      value: {
        changed: true,
        state: {
          revision: 2,
          visibility: "foreground",
          connectivity: "disconnected",
          continuity: "restored",
          cacheStatus: "verification-required",
        },
      },
    });
  });

  it("does not expose a forgeable positive verified-cache state or activation event", () => {
    expect(RUNTIME_SESSION_CACHE_STATUSES).toEqual(["inactive", "verification-required"]);
    expect(RUNTIME_SESSION_CACHE_STATUSES).not.toContain("verified" as never);
    expect(RUNTIME_SESSION_EVENT_TYPES).not.toContain("activate-verified-cache" as never);

    expect(parseRuntimeSessionState({
      ...createSession(),
      continuity: "restored",
      cacheStatus: "verified",
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_CACHE_STATUS", path: "$.cacheStatus" },
    });
  });

  it("enforces continuity/cache invariants instead of accepting self-asserted restored trust", () => {
    expect(parseRuntimeSessionState({
      ...createSession(),
      cacheStatus: "verification-required",
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_SESSION_INVARIANT", path: "$" },
    });

    expect(parseRuntimeSessionState({
      ...createSession(),
      continuity: "restored",
      cacheStatus: "inactive",
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_SESSION_INVARIANT", path: "$" },
    });
  });

  it("rejects invalid state/event versions, fields and identifiers fail closed", () => {
    expect(createRuntimeSessionState("bad session", {
      visibility: "foreground",
      connectivity: "connected",
    })).toMatchObject({ ok: false, issue: { code: "INVALID_SESSION_ID" } });

    expect(createRuntimeSessionState(`s${"a".repeat(RUNTIME_SESSION_ID_MAX_LENGTH)}`, {
      visibility: "foreground",
      connectivity: "connected",
    })).toMatchObject({ ok: false, issue: { code: "INVALID_SESSION_ID" } });

    expect(createRuntimeSessionState("session-1", {
      visibility: "foreground",
      connectivity: "connected",
      endpoint: "https://secret.example",
    })).toMatchObject({ ok: false, issue: { code: "UNKNOWN_FIELD", path: "$" } });

    expect(parseRuntimeSessionState({ ...createSession(), version: "2" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_VERSION", path: "$.version" },
    });
    expect(parseRuntimeSessionState({ ...createSession(), revision: -1 })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_REVISION", path: "$.revision" },
    });
    expect(parseRuntimeSessionState({ ...createSession(), visibility: "hidden" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_VISIBILITY", path: "$.visibility" },
    });
    expect(parseRuntimeSessionState({ ...createSession(), connectivity: "unknown" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_CONNECTIVITY", path: "$.connectivity" },
    });
    expect(parseRuntimeSessionState({ ...createSession(), continuity: "suspended" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_CONTINUITY", path: "$.continuity" },
    });

    expect(transitionRuntimeSession(createSession(), { version: "2", type: "background" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_EVENT", path: "$.event" },
    });
    expect(transitionRuntimeSession(createSession(), { version: "1", type: "sleep" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_EVENT", path: "$.event" },
    });
  });

  it("fails revision overflow only when a semantic session change would increment", () => {
    const max = Object.freeze({ ...createSession(), revision: Number.MAX_SAFE_INTEGER });
    expect(transitionRuntimeSession(max, event("foreground"))).toMatchObject({
      ok: true,
      value: { changed: false, state: { revision: Number.MAX_SAFE_INTEGER } },
    });
    expect(transitionRuntimeSession(max, event("background"))).toMatchObject({
      ok: false,
      issue: { code: "REVISION_OVERFLOW", path: "$.revision" },
    });
    expect(restoreRuntimeSessionState(max)).toMatchObject({
      ok: false,
      issue: { code: "REVISION_OVERFLOW", path: "$.revision" },
    });
  });

  it("normalizes hostile reflective inputs without evaluating them into thrown errors", () => {
    for (const hostile of [revokedProxy(), throwingProxy()]) {
      let created: ReturnType<typeof createRuntimeSessionState> | undefined;
      expect(() => {
        created = createRuntimeSessionState("session-1", hostile);
      }).not.toThrow();
      expect(created).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE", path: "$" } });
      expect(JSON.stringify(created)).not.toContain("SESSION_SECRET");

      let parsed: ReturnType<typeof parseRuntimeSessionState> | undefined;
      expect(() => {
        parsed = parseRuntimeSessionState(hostile);
      }).not.toThrow();
      expect(parsed).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE", path: "$" } });
      expect(JSON.stringify(parsed)).not.toContain("SESSION_SECRET");

      let transitioned: ReturnType<typeof transitionRuntimeSession> | undefined;
      expect(() => {
        transitioned = transitionRuntimeSession(createSession(), hostile);
      }).not.toThrow();
      expect(transitioned).toMatchObject({ ok: false, issue: { code: "INVALID_EVENT", path: "$.event" } });
      expect(JSON.stringify(transitioned)).not.toContain("SESSION_SECRET");

      let restored: ReturnType<typeof restoreRuntimeSessionState> | undefined;
      expect(() => {
        restored = restoreRuntimeSessionState(hostile);
      }).not.toThrow();
      expect(restored).toMatchObject({ ok: false, issue: { code: "INVALID_SESSION_STATE", path: "$" } });
      expect(JSON.stringify(restored)).not.toContain("SESSION_SECRET");
    }
  });

  it("keeps the new kernel source platform-neutral and dependency-free beyond protocol", () => {
    const sources = [
      readFileSync(new URL("../../packages/runtime-core/src/session/state.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../../packages/runtime-core/src/session/transition.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../../packages/runtime-core/src/session/types.ts", import.meta.url), "utf8"),
    ].join("\n");
    for (const forbidden of [
      "runtime-web",
      "react",
      "studio-host",
      "studio-runtime",
      "experience-resolver",
      "window.",
      "document.",
      "UIKit",
      "SwiftUI",
      "android.",
      "Compose",
    ]) {
      expect(sources).not.toContain(forbidden);
    }
  });
});
