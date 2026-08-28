import { describe, expect, it } from "vitest";
import {
  RESPONSIVE_MAX_BANDS,
  createResponsivePolicy,
  resolveResponsiveBand,
} from "../../packages/runtime-web/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

function policy() {
  return {
    version: "1",
    strategy: "container",
    bands: [
      { id: "compact", minInlineSizePx: 0 },
      { id: "regular", minInlineSizePx: 420 },
      { id: "wide", minInlineSizePx: 760 },
    ],
  };
}

describe("runtime-web container responsive policy", () => {
  it("normalizes an explicit immutable container-band policy", () => {
    const result = createResponsivePolicy(policy());
    expect(result).toMatchObject({ ok: true, value: policy() });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.bands)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("selects the highest satisfied band deterministically for fractional container sizes", () => {
    expect(resolveResponsiveBand(policy(), 319.5)).toMatchObject({ ok: true, value: { id: "compact" } });
    expect(resolveResponsiveBand(policy(), 420)).toMatchObject({ ok: true, value: { id: "regular" } });
    expect(resolveResponsiveBand(policy(), 759.999)).toMatchObject({ ok: true, value: { id: "regular" } });
    expect(resolveResponsiveBand(policy(), 760.25)).toMatchObject({ ok: true, value: { id: "wide" } });
  });

  it("rejects viewport/device strategies and implementation fields", () => {
    for (const strategy of ["viewport", "device", "auto"]) {
      expect(createResponsivePolicy({ ...policy(), strategy })).toMatchObject({ ok: false, issue: { code: "INVALID_STRATEGY", path: "$.strategy" } });
    }
    for (const field of ["mediaQuery", "css", "className", "device", "userAgent", "windowWidth", "componentProps"]) {
      expect(createResponsivePolicy({ ...policy(), [field]: "forbidden" })).toMatchObject({ ok: false, issue: { code: "UNKNOWN_FIELD", path: `$.${field}` } });
    }
  });

  it("requires unique ordered bands beginning at zero", () => {
    expect(createResponsivePolicy({ ...policy(), bands: [{ id: "compact", minInlineSizePx: 1 }] })).toMatchObject({ ok: false, issue: { code: "INVALID_THRESHOLD_ORDER" } });
    expect(createResponsivePolicy({ ...policy(), bands: [
      { id: "compact", minInlineSizePx: 0 },
      { id: "wide", minInlineSizePx: 760 },
      { id: "regular", minInlineSizePx: 420 },
    ] })).toMatchObject({ ok: false, issue: { code: "INVALID_THRESHOLD_ORDER", path: "$.bands[2].minInlineSizePx" } });
    expect(createResponsivePolicy({ ...policy(), bands: [
      { id: "compact", minInlineSizePx: 0 },
      { id: "compact", minInlineSizePx: 420 },
    ] })).toMatchObject({ ok: false, issue: { code: "DUPLICATE_BAND_ID" } });
  });

  it("rejects oversized policies before deep band parsing", () => {
    const bands = Array.from({ length: RESPONSIVE_MAX_BANDS + 1 }, (_, index) => ({
      id: `band-${index}`,
      minInlineSizePx: index * 100,
    }));
    expect(createResponsivePolicy({ ...policy(), bands })).toMatchObject({ ok: false, issue: { code: "BAND_LIMIT_EXCEEDED", path: "$.bands" } });
  });

  it("rejects invalid container sizes", () => {
    for (const size of [-1, Number.NaN, Number.POSITIVE_INFINITY, 20_001]) {
      expect(resolveResponsiveBand(policy(), size)).toMatchObject({ ok: false, issue: { code: "INVALID_CONTAINER_SIZE", path: "$.inlineSizePx" } });
    }
  });

  it("rejects accessor-backed band values without executing getters", () => {
    let calls = 0;
    const band: Record<string, unknown> = { id: "compact" };
    Object.defineProperty(band, "minInlineSizePx", {
      enumerable: true,
      get() {
        calls += 1;
        return 0;
      },
    });
    expect(createResponsivePolicy({ version: "1", strategy: "container", bands: [band] })).toMatchObject({ ok: false, issue: { code: "INVALID_BAND" } });
    expect(calls).toBe(0);
  });
});