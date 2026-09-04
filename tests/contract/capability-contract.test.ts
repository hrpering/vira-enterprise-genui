import { describe, expect, it } from "vitest";
import {
  VIRA_CAPABILITY_MAX_CONTEXT_REQUIREMENTS,
  parseViraCapabilityDefinition,
  serializeViraCapabilityDefinition,
} from "../../packages/capability-contract/src/index.js";

function queryFixture(): Record<string, unknown> {
  return {
    schemaVersion: "1",
    id: "vira.flight-search",
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    metadata: { name: "Flight Search", description: "Search available flights without mutating protected state." },
    input: { typeRef: { id: "travel.flight-search-input", versionRef: "1" } },
    output: { typeRef: { id: "travel.flight-search-result", versionRef: "1" } },
    contextRequirements: [{ id: "travel.trip-context", versionRef: "1" }],
    invocation: { kind: "query" },
  };
}

function actionFixture(): Record<string, unknown> {
  return {
    ...queryFixture(),
    id: "vira.flight-booking",
    metadata: { name: "Flight Booking" },
    invocation: { kind: "action", actionType: "travel.flight.book" },
  };
}

describe("Vira CapabilityDefinition v1", () => {
  it("parses query and action definitions into detached deeply frozen values", () => {
    const query = queryFixture();
    const parsedQuery = parseViraCapabilityDefinition(query);
    expect(parsedQuery.ok).toBe(true);
    if (!parsedQuery.ok) return;
    expect(parsedQuery.value).not.toBe(query);
    expect(Object.isFrozen(parsedQuery.value)).toBe(true);
    expect(Object.isFrozen(parsedQuery.value.contextRequirements)).toBe(true);
    expect(Object.isFrozen(parsedQuery.value.input.typeRef)).toBe(true);

    const parsedAction = parseViraCapabilityDefinition(actionFixture());
    expect(parsedAction.ok).toBe(true);
    if (!parsedAction.ok) return;
    expect(parsedAction.value.invocation).toEqual({ kind: "action", actionType: "travel.flight.book" });
  });

  it("keeps provider bindings, credentials and endpoints out of canonical semantics", () => {
    for (const extra of [
      { provider: "mcp" },
      { endpoint: "https://provider.invalid" },
      { apiKey: "secret" },
      { transport: "http" },
    ]) {
      expect(parseViraCapabilityDefinition({ ...queryFixture(), ...extra })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD" },
      });
    }
  });

  it("does not create a competing effect or idempotency catalog", () => {
    const input = actionFixture();
    input.invocation = {
      kind: "action",
      actionType: "travel.flight.book",
      effect: "write",
      idempotency: "action-id",
    };
    expect(parseViraCapabilityDefinition(input)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INVOCATION", path: "$.invocation.effect" },
    });
  });

  it("requires action-mediated capabilities to bind an exact semantic actionType", () => {
    const missing = actionFixture();
    missing.invocation = { kind: "action" };
    expect(parseViraCapabilityDefinition(missing)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INVOCATION", path: "$.invocation.actionType" },
    });

    const querySmuggling = queryFixture();
    querySmuggling.invocation = { kind: "query", actionType: "travel.flight.book" };
    expect(parseViraCapabilityDefinition(querySmuggling)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INVOCATION", path: "$.invocation.actionType" },
    });
  });

  it("requires publisher namespace parity and immutable capability release semver", () => {
    expect(parseViraCapabilityDefinition({
      ...queryFixture(),
      publisher: { id: "other", name: "Other" },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_PUBLISHER", path: "$.publisher.id" } });

    expect(parseViraCapabilityDefinition({ ...queryFixture(), version: "latest" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_VERSION", path: "$.version" },
    });
  });

  it("rejects floating data/context references", () => {
    const floatingInput = queryFixture();
    floatingInput.input = { typeRef: { id: "travel.flight-search-input", versionRef: "latest" } };
    expect(parseViraCapabilityDefinition(floatingInput)).toMatchObject({
      ok: false,
      issue: { code: "FLOATING_REFERENCE", path: "$.input.typeRef.versionRef" },
    });

    const floatingContext = queryFixture();
    floatingContext.contextRequirements = [{ id: "travel.trip-context", versionRef: "1.x" }];
    expect(parseViraCapabilityDefinition(floatingContext)).toMatchObject({
      ok: false,
      issue: { code: "FLOATING_REFERENCE", path: "$.contextRequirements[0].versionRef" },
    });
  });

  it("rejects inline input/output schema payloads instead of inventing a schema owner", () => {
    const input = queryFixture();
    input.input = {
      typeRef: { id: "travel.flight-search-input", versionRef: "1" },
      schema: { type: "object" },
    };
    expect(parseViraCapabilityDefinition(input)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_VALUE_CONTRACT", path: "$.input.schema" },
    });
  });

  it("rejects duplicate and over-limit context requirements", () => {
    const duplicate = queryFixture();
    duplicate.contextRequirements = [
      { id: "travel.trip-context", versionRef: "1" },
      { id: "travel.trip-context", versionRef: "1" },
    ];
    expect(parseViraCapabilityDefinition(duplicate)).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_REFERENCE", path: "$.contextRequirements[1]" },
    });

    const overLimit = queryFixture();
    overLimit.contextRequirements = Array.from(
      { length: VIRA_CAPABILITY_MAX_CONTEXT_REQUIREMENTS + 1 },
      (_, index) => ({ id: `travel.context-${index}`, versionRef: "1" }),
    );
    expect(parseViraCapabilityDefinition(overLimit)).toMatchObject({
      ok: false,
      issue: { code: "CONTEXT_LIMIT_EXCEEDED", path: "$.contextRequirements" },
    });
  });

  it("permits explicit no-input/no-output contracts without inventing schemas", () => {
    const input = queryFixture();
    input.input = { typeRef: null };
    input.output = { typeRef: null };
    expect(parseViraCapabilityDefinition(input)).toMatchObject({ ok: true });
  });

  it("rejects unsafe accessor and custom-prototype input through the shared JSON boundary", () => {
    const accessor = queryFixture();
    Object.defineProperty(accessor, "publisher", {
      enumerable: true,
      get: () => ({ id: "vira", name: "Vira" }),
    });
    expect(parseViraCapabilityDefinition(accessor)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE" } });

    const polluted = Object.create({ admin: true }) as Record<string, unknown>;
    Object.assign(polluted, queryFixture());
    expect(parseViraCapabilityDefinition(polluted)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE" } });
  });

  it("serializes deterministically regardless of input key order", () => {
    const original = queryFixture();
    const reordered = {
      invocation: original.invocation,
      contextRequirements: original.contextRequirements,
      output: original.output,
      input: original.input,
      metadata: original.metadata,
      publisher: original.publisher,
      version: original.version,
      id: original.id,
      schemaVersion: original.schemaVersion,
    };
    const first = serializeViraCapabilityDefinition(original);
    const second = serializeViraCapabilityDefinition(reordered);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value).toBe(second.value);
  });
});
