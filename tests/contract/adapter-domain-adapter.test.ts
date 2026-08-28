import { describe, expect, it } from "vitest";
import {
  DOMAIN_ADAPTER_MAX_TYPES,
  createDomainAdapterContract,
  normalizeDomainDataForAdapter,
} from "../../packages/adapter-sdk/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

function contract() {
  return {
    version: "1",
    id: "acme.travel.adapter",
    domain: "travel.flight",
    types: ["search-results", "selection"],
  };
}

function data(type = "search-results") {
  return {
    version: "1",
    domain: "travel.flight",
    type,
    data: { flights: [{ id: "TK1721", price: 4200 }] },
    source: { kind: "api", name: "acme.travel-api" },
    freshness: { observedAtUnixMs: 1_788_000_000_000 },
  };
}

describe("adapter-sdk domain adapter", () => {
  it("normalizes Protocol DomainData only when domain and type are explicitly declared", () => {
    const result = normalizeDomainDataForAdapter(contract(), data());
    expect(result).toMatchObject({
      ok: true,
      value: { domain: "travel.flight", type: "search-results", data: { flights: [{ id: "TK1721" }] } },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.data)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("fails closed for a different domain", () => {
    expect(normalizeDomainDataForAdapter(contract(), { ...data(), domain: "banking.transfer" })).toMatchObject({
      ok: false,
      issue: { code: "DOMAIN_MISMATCH", path: "$.domain" },
    });
  });

  it("fails closed for an undeclared data type", () => {
    expect(normalizeDomainDataForAdapter(contract(), data("admin-records"))).toMatchObject({
      ok: false,
      issue: { code: "UNSUPPORTED_DATA_TYPE", path: "$.type" },
    });
  });

  it("rejects duplicate and oversized type allowlists", () => {
    expect(createDomainAdapterContract({ ...contract(), types: ["selection", "selection"] })).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_TYPE", path: "$.types[1]" },
    });
    expect(createDomainAdapterContract({
      ...contract(),
      types: Array.from({ length: DOMAIN_ADAPTER_MAX_TYPES + 1 }, (_, index) => `type-${index}`),
    })).toMatchObject({ ok: false, issue: { code: "TYPE_LIMIT_EXCEEDED", path: "$.types" } });
  });

  it("does not accept transport, credential, parser, execution, or permission fields", () => {
    for (const field of ["endpoint", "url", "token", "apiKey", "headers", "method", "parser", "execute", "callback", "permission", "authorize", "role"]) {
      expect(createDomainAdapterContract({ ...contract(), [field]: "forbidden" })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
  });

  it("delegates malformed DomainData to Protocol validation", () => {
    expect(normalizeDomainDataForAdapter(contract(), { ...data(), version: "2" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_DOMAIN_DATA", path: "$.version" },
    });
  });

  it("clones nested data and rejects accessor-backed type arrays without running getters", () => {
    const input = data();
    const result = normalizeDomainDataForAdapter(contract(), input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    input.data.flights[0]!.id = "MUTATED";
    expect((result.value.data as { readonly flights: readonly { readonly id: string }[] }).flights[0]?.id).toBe("TK1721");

    let calls = 0;
    const accessor: Record<string, unknown> = { version: "1", id: "acme.travel.adapter", domain: "travel.flight" };
    Object.defineProperty(accessor, "types", {
      enumerable: true,
      get() {
        calls += 1;
        return ["search-results"];
      },
    });
    expect(createDomainAdapterContract(accessor)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE", path: "$.types" } });
    expect(calls).toBe(0);
  });
});
