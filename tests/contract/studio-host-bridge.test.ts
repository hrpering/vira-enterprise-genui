import { describe, expect, it, vi } from "vitest";
import {
  createStudioHostActionResult,
  createStudioHostBridge,
  createStudioHostSnapshot,
} from "../../packages/studio-host/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

function snapshot() {
  return {
    version: "1",
    revision: 7,
    state: { selectedOffer: "offer-1" },
    domain: { route: { origin: "SAW", destination: "BER" } },
  };
}

describe("studio host bridge", () => {
  it("validates and freezes the Vira-owned state/domain snapshot", () => {
    const result = createStudioHostSnapshot(snapshot());
    expect(result).toMatchObject({ ok: true, value: { revision: 7 } });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.state)).toBe(true);
    expect(Object.isFrozen(result.value.domain)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("rejects stale-invalid revision shapes and unknown snapshot fields", () => {
    expect(createStudioHostSnapshot({ ...snapshot(), revision: -1 })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_REVISION", path: "$.revision" },
    });
    expect(createStudioHostSnapshot({ ...snapshot(), endpoint: "https://customer.example" })).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.endpoint" },
    });
  });

  it("validates host action outcomes and optional replacement snapshots", () => {
    const result = createStudioHostActionResult({ outcome: "success", snapshot: snapshot() });
    expect(result).toMatchObject({ ok: true, value: { outcome: "success", snapshot: { revision: 7 } } });
    expect(createStudioHostActionResult({ outcome: "pending" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_OUTCOME", path: "$.outcome" },
    });
  });

  it("accepts exactly one callable host surface for snapshot, dispatch, and subscription", () => {
    const snapshotFn = vi.fn(() => snapshot());
    const dispatch = vi.fn(async () => ({ outcome: "success" as const }));
    const subscribe = vi.fn(() => () => undefined);
    const result = createStudioHostBridge({
      version: "1",
      id: "vira.studio.host",
      snapshot: snapshotFn,
      dispatch,
      subscribe,
    });
    expect(result).toMatchObject({ ok: true, value: { id: "vira.studio.host" } });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(result.value.snapshot).toBe(snapshotFn);
    expect(result.value.dispatch).toBe(dispatch);
    expect(result.value.subscribe).toBe(subscribe);
  });

  it("rejects endpoint, api-key, and extra backend surfaces instead of making brand/runtime code backend-aware", () => {
    const base = {
      version: "1",
      id: "vira.studio.host",
      snapshot: () => snapshot(),
      dispatch: async () => ({ outcome: "success" as const }),
      subscribe: () => () => undefined,
    };
    for (const extra of [
      { endpoint: "https://customer.example/api" },
      { apiKey: "secret" },
      { fetch: () => undefined },
    ]) {
      expect(createStudioHostBridge({ ...base, ...extra })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD" },
      });
    }
  });

  it("rejects accessor-backed bridge fields without evaluating them", () => {
    let calls = 0;
    const input: Record<string, unknown> = {
      version: "1",
      id: "vira.studio.host",
      dispatch: async () => ({ outcome: "success" }),
      subscribe: () => () => undefined,
    };
    Object.defineProperty(input, "snapshot", {
      enumerable: true,
      get() {
        calls += 1;
        return () => snapshot();
      },
    });
    expect(createStudioHostBridge(input)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_BRIDGE", path: "$.snapshot" },
    });
    expect(calls).toBe(0);
  });
});
