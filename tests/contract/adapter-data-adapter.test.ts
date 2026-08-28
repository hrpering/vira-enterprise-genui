import { describe, expect, it } from "vitest";
import {
  createDataAdapterContract,
  projectDomainData,
} from "../../packages/adapter-sdk/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

function contract() {
  return {
    version: "1",
    id: "acme.travel.search-input",
    domain: "travel.flight",
    type: "search-context",
    bindings: [
      { from: "departure", to: "origin" },
      { from: "arrival", to: "destination" },
    ],
  };
}

function data() {
  return {
    version: "1",
    domain: "travel.flight",
    type: "search-context",
    data: { departure: "IST", arrival: "BER", "internal-note": "not projected" },
  };
}

describe("adapter-sdk data adapter", () => {
  it("projects explicit top-level canonical DomainData fields", () => {
    const result = projectDomainData(contract(), data());
    expect(result).toEqual({ ok: true, value: { origin: "IST", destination: "BER" } });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual({ origin: "IST", destination: "BER" });
  });

  it("fails closed for wrong domain/type and missing source fields", () => {
    expect(projectDomainData(contract(), { ...data(), domain: "support.ticket" })).toMatchObject({ ok: false, issue: { code: "DOMAIN_MISMATCH" } });
    expect(projectDomainData(contract(), { ...data(), type: "selection" })).toMatchObject({ ok: false, issue: { code: "DATA_TYPE_MISMATCH" } });
    expect(projectDomainData(contract(), { ...data(), data: { departure: "IST" } })).toMatchObject({
      ok: false,
      issue: { code: "MISSING_SOURCE_FIELD", path: "$.data.arrival" },
    });
  });

  it("rejects non-object DomainData payloads instead of inventing selectors", () => {
    expect(projectDomainData(contract(), { ...data(), data: ["IST", "BER"] })).toMatchObject({
      ok: false,
      issue: { code: "NON_OBJECT_DATA", path: "$.data" },
    });
  });

  it("rejects duplicate source/target bindings", () => {
    expect(createDataAdapterContract({ ...contract(), bindings: [{ from: "departure", to: "origin" }, { from: "departure", to: "other" }] })).toMatchObject({ ok: false, issue: { code: "DUPLICATE_SOURCE_FIELD" } });
    expect(createDataAdapterContract({ ...contract(), bindings: [{ from: "departure", to: "origin" }, { from: "arrival", to: "origin" }] })).toMatchObject({ ok: false, issue: { code: "DUPLICATE_TARGET_FIELD" } });
  });

  it("rejects nested selectors and executable transform surfaces", () => {
    for (const field of ["jsonPath", "path", "selector", "transform", "expression", "callback", "default", "coerce", "execute", "endpoint"]) {
      expect(createDataAdapterContract({ ...contract(), [field]: "forbidden" })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
  });

  it("does not retain caller-owned nested values", () => {
    const input = {
      ...data(),
      data: { departure: { code: "IST" }, arrival: "BER", "internal-note": "x" },
    };
    const result = projectDomainData(contract(), input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    input.data.departure.code = "SAW";
    expect(result.value.origin).toEqual({ code: "IST" });
  });
});
