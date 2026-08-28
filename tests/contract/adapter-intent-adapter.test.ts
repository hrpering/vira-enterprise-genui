import { describe, expect, it } from "vitest";
import {
  adaptIntentAlias,
  createIntentAdapterContract,
} from "../../packages/adapter-sdk/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

function contract() {
  return {
    version: "1",
    id: "acme.chat.intent-adapter",
    mappings: [
      { source: "BOOK_FLIGHT", target: { namespace: "travel.flight", name: "search" } },
      { source: "flight_search_v2", target: { namespace: "travel.flight", name: "search" } },
      { source: "OPEN_TICKET", target: { namespace: "support.ticket", name: "create" } },
    ],
  };
}

describe("adapter-sdk intent adapter", () => {
  it("maps enterprise-native aliases to canonical Protocol Intent deterministically", () => {
    const result = adaptIntentAlias(contract(), {
      source: "BOOK_FLIGHT",
      confidence: 0.92,
      parameters: { origin: "IST", destination: "BER" },
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        version: "1",
        namespace: "travel.flight",
        name: "search",
        confidence: 0.92,
        parameters: { origin: "IST", destination: "BER" },
      },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.parameters)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("uses exact matching and fails closed for unmapped or fuzzy aliases", () => {
    for (const source of ["book_flight", "BOOK_FLIGHT ", "BOOK-FLIGHT", "flight_search"]) {
      expect(adaptIntentAlias(contract(), { source })).toMatchObject({ ok: false });
    }
    const unmapped = adaptIntentAlias(contract(), { source: "sensitive-user-derived-key" });
    expect(unmapped).toMatchObject({
      ok: false,
      issue: { code: "UNMAPPED_SOURCE", path: "$.source", message: "no exact intent mapping exists for source" },
    });
    if (!unmapped.ok) expect(unmapped.issue.message).not.toContain("sensitive-user-derived-key");
  });

  it("permits multiple exact aliases for one canonical target but rejects duplicate source keys", () => {
    expect(createIntentAdapterContract(contract())).toMatchObject({ ok: true });
    expect(createIntentAdapterContract({
      ...contract(),
      mappings: [
        ...contract().mappings,
        { source: "BOOK_FLIGHT", target: { namespace: "travel.flight", name: "search" } },
      ],
    })).toMatchObject({ ok: false, issue: { code: "DUPLICATE_SOURCE" } });
  });

  it("delegates confidence and parameter validation to Intent Protocol", () => {
    expect(adaptIntentAlias(contract(), { source: "BOOK_FLIGHT", confidence: 2 })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INTENT", path: "$.confidence" },
    });
    expect(adaptIntentAlias(contract(), { source: "BOOK_FLIGHT", parameters: ["not", "object"] })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INTENT", path: "$.parameters" },
    });
  });

  it("rejects regex, wildcard, model, provider, prompt, endpoint, and execution fields", () => {
    for (const field of ["regex", "pattern", "wildcard", "fuzzy", "model", "provider", "prompt", "endpoint", "callback", "execute", "permission"]) {
      expect(createIntentAdapterContract({ ...contract(), [field]: "forbidden" })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
  });

  it("does not retain caller-owned parameters", () => {
    const parameters = { origin: "IST" };
    const result = adaptIntentAlias(contract(), { source: "BOOK_FLIGHT", parameters });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    parameters.origin = "SAW";
    expect(result.value.parameters?.origin).toBe("IST");
  });
});
