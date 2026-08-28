import { describe, expect, it } from "vitest";
import {
  adaptActionEvent,
  createActionAdapterContract,
} from "../../packages/adapter-sdk/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

function contract() {
  return {
    version: "1",
    id: "acme.web.actions",
    mappings: [
      { event: "flight.search.submit", actionType: "travel.flight.search.submit" },
      { event: "date.change", actionType: "travel.flight.date.change" },
    ],
  };
}

describe("adapter-sdk action adapter", () => {
  it("maps exact enterprise events to semantic action descriptors", () => {
    const payload = { origin: "IST", destination: "BER" };
    const result = adaptActionEvent(contract(), { event: "flight.search.submit", payload });
    expect(result).toEqual({
      ok: true,
      value: { type: "travel.flight.search.submit", payload: { origin: "IST", destination: "BER" } },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.payload)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
    payload.origin = "SAW";
    expect(result.value.payload.origin).toBe("IST");
  });

  it("does not produce RuntimeAction id/source fields", () => {
    const result = adaptActionEvent(contract(), { event: "date.change", payload: { date: "2026-09-03" } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.hasOwn(result.value, "id")).toBe(false);
    expect(Object.hasOwn(result.value, "source")).toBe(false);
    expect(Object.hasOwn(result.value, "permission")).toBe(false);
  });

  it("fails closed for fuzzy/unmapped events without reflecting caller data", () => {
    const result = adaptActionEvent(contract(), { event: "sensitive user event text" });
    expect(result).toMatchObject({ ok: false, issue: { code: "UNMAPPED_EVENT", path: "$.event", message: "no exact action mapping exists for event" } });
    if (!result.ok) expect(result.issue.message).not.toContain("sensitive user event text");
  });

  it("rejects duplicate events and invalid semantic action types", () => {
    expect(createActionAdapterContract({
      ...contract(),
      mappings: [...contract().mappings, { event: "date.change", actionType: "travel.other" }],
    })).toMatchObject({ ok: false, issue: { code: "DUPLICATE_EVENT" } });
    expect(createActionAdapterContract({
      ...contract(),
      mappings: [{ event: "x", actionType: "POST /admin" }],
    })).toMatchObject({ ok: false, issue: { code: "INVALID_ACTION_TYPE" } });
  });

  it("rejects source/id/permission/execution/network configuration", () => {
    for (const field of ["source", "actionId", "permission", "authorize", "callback", "execute", "endpoint", "url", "method", "headers", "retry"] ) {
      expect(createActionAdapterContract({ ...contract(), [field]: "forbidden" })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
  });

  it("rejects non-object payloads", () => {
    expect(adaptActionEvent(contract(), { event: "date.change", payload: ["2026-09-03"] })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PAYLOAD", path: "$.payload" },
    });
  });
});
