import { describe, expect, it } from "vitest";
import {
  VIRA_WORK_CONTEXT_MAX_ITEMS,
  VIRA_WORK_CONTEXT_MAX_PROVENANCE_REFS,
  parseViraWorkContext,
  parseViraWorkContextDefinition,
  serializeViraWorkContext,
  serializeViraWorkContextDefinition,
} from "../../packages/work-context/src/index.js";

function definitionFixture(): Record<string, unknown> {
  return {
    schemaVersion: "1",
    id: "vira.trip-context",
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    metadata: { name: "Trip Context", description: "Bounded work state for a travel planning task." },
  };
}

function contextFixture(): Record<string, unknown> {
  return {
    schemaVersion: "1",
    id: "ctx-2026-09-04-001",
    typeRef: { id: "vira.trip-context", versionRef: "1.0.0" },
    items: [
      {
        id: "search-result",
        kind: "result",
        typeRef: { id: "travel.flight-search-result", versionRef: "1" },
        value: { destination: "IST", price: 3250, currency: "TRY" },
        provenance: {
          sourceRefs: [{ id: "vira.flight-search", versionRef: "1.0.0" }],
          observedAtUnixMs: 1_788_551_200_000,
        },
      },
      {
        id: "approval-receipt",
        kind: "receipt",
        typeRef: null,
        value: { outcome: "approved", receiptId: "receipt-123" },
        provenance: {
          sourceRefs: [{ id: "travel.flight.book", versionRef: "1" }],
          observedAtUnixMs: null,
        },
      },
    ],
  };
}

describe("Vira WorkContext v1", () => {
  it("parses exact WorkContext definitions and immutable bounded snapshots", () => {
    const definition = parseViraWorkContextDefinition(definitionFixture());
    expect(definition.ok).toBe(true);
    if (!definition.ok) return;
    expect(Object.isFrozen(definition.value)).toBe(true);
    expect(Object.isFrozen(definition.value.publisher)).toBe(true);

    const context = contextFixture();
    const parsed = parseViraWorkContext(context);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).not.toBe(context);
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.items)).toBe(true);
    expect(Object.isFrozen(parsed.value.items[0]?.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.items[0]?.provenance.sourceRefs)).toBe(true);
  });

  it("keeps chat history, memory, prompts, tenant scope and provider execution authority out of canonical context", () => {
    for (const extra of [
      { messages: [{ role: "user", content: "hello" }] },
      { chatHistory: [] },
      { memory: { favorite: "window" } },
      { prompt: "system prompt" },
      { organizationId: "org-1" },
      { projectId: "project-1" },
      { environment: "production" },
      { provider: "mcp" },
      { endpoint: "https://provider.invalid" },
      { credential: "secret" },
      { actionExecutor: "direct" },
      { policy: "allow" },
    ]) {
      expect(parseViraWorkContext({ ...contextFixture(), ...extra })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD" },
      });
    }
  });

  it("rejects chat/message/memory/prompt as semantic item kinds", () => {
    for (const kind of ["message", "chat", "memory", "prompt"]) {
      const input = contextFixture();
      input.items = [
        {
          id: "bad-item",
          kind,
          typeRef: null,
          value: "not canonical WorkContext semantics",
          provenance: { sourceRefs: [], observedAtUnixMs: null },
        },
      ];
      expect(parseViraWorkContext(input)).toMatchObject({
        ok: false,
        issue: { code: "INVALID_ITEM_KIND", path: "$.items[0].kind" },
      });
    }
  });

  it("requires exact WorkContext type and provenance references", () => {
    expect(parseViraWorkContext({
      ...contextFixture(),
      typeRef: { id: "vira.trip-context", versionRef: "latest" },
    })).toMatchObject({
      ok: false,
      issue: { code: "FLOATING_REFERENCE", path: "$.typeRef.versionRef" },
    });

    const input = contextFixture();
    input.items = [
      {
        id: "result",
        kind: "result",
        typeRef: null,
        value: {},
        provenance: {
          sourceRefs: [{ id: "vira.flight-search", versionRef: "1.x" }],
          observedAtUnixMs: null,
        },
      },
    ];
    expect(parseViraWorkContext(input)).toMatchObject({
      ok: false,
      issue: { code: "FLOATING_REFERENCE", path: "$.items[0].provenance.sourceRefs[0].versionRef" },
    });
  });

  it("enforces publisher namespace parity and exact definition release semver", () => {
    expect(parseViraWorkContextDefinition({
      ...definitionFixture(),
      publisher: { id: "other", name: "Other" },
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PUBLISHER", path: "$.publisher.id" },
    });

    expect(parseViraWorkContextDefinition({ ...definitionFixture(), version: "latest" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_VERSION", path: "$.version" },
    });
  });

  it("rejects duplicate and over-limit WorkContext items", () => {
    const duplicate = contextFixture();
    duplicate.items = [
      {
        id: "same",
        kind: "state",
        typeRef: null,
        value: 1,
        provenance: { sourceRefs: [], observedAtUnixMs: null },
      },
      {
        id: "same",
        kind: "result",
        typeRef: null,
        value: 2,
        provenance: { sourceRefs: [], observedAtUnixMs: null },
      },
    ];
    expect(parseViraWorkContext(duplicate)).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_ITEM", path: "$.items[1].id" },
    });

    const overLimit = contextFixture();
    overLimit.items = Array.from({ length: VIRA_WORK_CONTEXT_MAX_ITEMS + 1 }, (_, index) => ({
      id: `item-${index}`,
      kind: "state",
      typeRef: null,
      value: index,
      provenance: { sourceRefs: [], observedAtUnixMs: null },
    }));
    expect(parseViraWorkContext(overLimit)).toMatchObject({
      ok: false,
      issue: { code: "ITEM_LIMIT_EXCEEDED", path: "$.items" },
    });
  });

  it("rejects duplicate and over-limit provenance references", () => {
    const duplicate = contextFixture();
    duplicate.items = [
      {
        id: "result",
        kind: "result",
        typeRef: null,
        value: {},
        provenance: {
          sourceRefs: [
            { id: "vira.flight-search", versionRef: "1.0.0" },
            { id: "vira.flight-search", versionRef: "1.0.0" },
          ],
          observedAtUnixMs: null,
        },
      },
    ];
    expect(parseViraWorkContext(duplicate)).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_PROVENANCE_REFERENCE" },
    });

    const overLimit = contextFixture();
    overLimit.items = [
      {
        id: "result",
        kind: "result",
        typeRef: null,
        value: {},
        provenance: {
          sourceRefs: Array.from({ length: VIRA_WORK_CONTEXT_MAX_PROVENANCE_REFS + 1 }, (_, index) => ({
            id: `vira.source-${index}`,
            versionRef: "1",
          })),
          observedAtUnixMs: null,
        },
      },
    ];
    expect(parseViraWorkContext(overLimit)).toMatchObject({
      ok: false,
      issue: { code: "PROVENANCE_LIMIT_EXCEEDED" },
    });
  });

  it("treats receipt data as context evidence, not as execution authority", () => {
    const input = contextFixture();
    input.items = [
      {
        id: "receipt",
        kind: "receipt",
        typeRef: null,
        value: { outcome: "approved", executionPermit: true },
        provenance: { sourceRefs: [], observedAtUnixMs: null },
        executionPermit: { effect: "write" },
      },
    ];
    expect(parseViraWorkContext(input)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ITEM", path: "$.items[0].executionPermit" },
    });
  });

  it("validates provenance timestamps without creating lifecycle authority", () => {
    const input = contextFixture();
    input.items = [
      {
        id: "state",
        kind: "state",
        typeRef: null,
        value: {},
        provenance: { sourceRefs: [], observedAtUnixMs: -1 },
      },
    ];
    expect(parseViraWorkContext(input)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PROVENANCE", path: "$.items[0].provenance.observedAtUnixMs" },
    });
  });

  it("rejects unsafe accessor and custom-prototype input through the shared JSON boundary", () => {
    const accessor = contextFixture();
    Object.defineProperty(accessor, "items", {
      enumerable: true,
      get: () => [],
    });
    expect(parseViraWorkContext(accessor)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE" } });

    const polluted = Object.create({ admin: true }) as Record<string, unknown>;
    Object.assign(polluted, contextFixture());
    expect(parseViraWorkContext(polluted)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE" } });
  });

  it("serializes definitions and nested JSON values deterministically", () => {
    const definition = serializeViraWorkContextDefinition(definitionFixture());
    expect(definition.ok).toBe(true);

    const first = contextFixture();
    const second = contextFixture();
    const firstItems = first.items as Array<Record<string, unknown>>;
    const secondItems = second.items as Array<Record<string, unknown>>;
    firstItems[0] = {
      ...firstItems[0],
      value: { currency: "TRY", price: 3250, destination: "IST" },
    };
    secondItems[0] = {
      ...secondItems[0],
      value: { destination: "IST", price: 3250, currency: "TRY" },
    };

    const serializedFirst = serializeViraWorkContext(first);
    const serializedSecond = serializeViraWorkContext(second);
    expect(serializedFirst.ok).toBe(true);
    expect(serializedSecond.ok).toBe(true);
    if (!serializedFirst.ok || !serializedSecond.ok) return;
    expect(serializedFirst.value).toBe(serializedSecond.value);
  });
});
