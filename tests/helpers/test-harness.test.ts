import { describe, expect, it } from "vitest";
import { createDeterministicClock, createSequenceIdFactory, jsonRoundTrip } from "./index.js";

describe("shared test harness", () => {
  it("controls time without reading the wall clock", () => {
    const clock = createDeterministicClock(100);
    expect(clock.now()).toBe(100);
    expect(clock.advance(25)).toBe(125);
    clock.set(10);
    expect(clock.now()).toBe(10);
  });

  it("creates repeatable IDs", () => {
    const ids = createSequenceIdFactory("experience", 7);
    expect(ids.next()).toBe("experience-7");
    expect(ids.next()).toBe("experience-8");
    ids.reset();
    expect(ids.next()).toBe("experience-7");
  });

  it("round-trips canonical JSON values exactly", () => {
    const input = { id: "x", nested: { count: 2 }, values: [true, null, "ok"] };
    const output = jsonRoundTrip(input);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
  });

  it("rejects values that JSON would silently lose or coerce", () => {
    expect(() => jsonRoundTrip(undefined)).toThrow(TypeError);
    expect(() => jsonRoundTrip({ missing: undefined })).toThrow(TypeError);
    expect(() => jsonRoundTrip({ value: Number.NaN })).toThrow(TypeError);
    expect(() => jsonRoundTrip({ value: new Date(0) })).toThrow(TypeError);
    expect(() => jsonRoundTrip(-0)).toThrow(TypeError);

    const sparse = Array<string>(2);
    sparse[1] = "x";
    expect(() => jsonRoundTrip(sparse)).toThrow(TypeError);
  });

  it("rejects circular canonical data", () => {
    const value: { self?: unknown } = {};
    value.self = value;
    expect(() => jsonRoundTrip(value)).toThrow(TypeError);
  });

  it("allows repeated non-circular object references", () => {
    const shared = { ok: true };
    expect(jsonRoundTrip({ left: shared, right: shared })).toEqual({ left: { ok: true }, right: { ok: true } });
  });

  it("rejects invalid deterministic primitives", () => {
    expect(() => createDeterministicClock(Number.NaN)).toThrow(TypeError);
    expect(() => createSequenceIdFactory("", 1)).toThrow(TypeError);
    expect(() => createSequenceIdFactory("x", 1.5)).toThrow(TypeError);
  });
});
