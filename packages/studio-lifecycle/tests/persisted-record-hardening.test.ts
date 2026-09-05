import { compileStudioExperience } from "@vira-enterprise-genui/studio-compiler";
import { expect, it } from "vitest";
import {
  createStudioLifecycleService,
  type StudioLifecycleRecord,
  type StudioLifecycleStore,
} from "../src/index.js";

const workspaceId = "workspace-a";
const createdAt = "2026-08-30T03:00:00.000Z";
const updatedAt = "2026-08-30T03:01:00.000Z";

function studioDocument(id: string) {
  return {
    version: "1",
    id,
    recipeId: "test.recipe.persisted-record",
    entryView: "main",
    views: [{
      id: "main",
      nodes: [{
        id: "root",
        component: "test.component.text",
        order: 0,
        props: { text: "Persisted" },
      }],
    }],
    bindings: [],
    interactions: [],
  } as const;
}

function canonicalRecord(id: string): StudioLifecycleRecord {
  return {
    version: "1",
    workspaceId,
    id,
    name: "Persisted record",
    draftRevision: 1,
    recordVersion: 1,
    document: studioDocument(id),
    publication: null,
    publishedDraftRevision: null,
    createdAt,
    updatedAt,
    publishedAt: null,
  };
}

function serviceFor(overrides: Partial<Pick<StudioLifecycleStore, "list" | "read">>) {
  const store: StudioLifecycleStore = {
    async list() { return []; },
    async read() { return undefined; },
    async listRevisions() { return []; },
    async create() { throw new Error("unused"); },
    async replace() { throw new Error("unused"); },
    async delete() { throw new Error("unused"); },
    ...overrides,
  };
  return createStudioLifecycleService({
    store,
    componentCatalog: {},
    bindingSourceCatalog: {},
    actionAdapter: {},
    nowUnixMs: () => 0,
  });
}

it("rejects a persisted record whose document is not canonical Studio data", async () => {
  const record = {
    ...canonicalRecord("demo.malformed-document"),
    document: { id: "demo.malformed-document" },
  } as unknown as StudioLifecycleRecord;

  const result = await serviceFor({ async read() { return record; } })
    .read(workspaceId, record.id);

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issue.code).toBe("STORE_FAILURE");
});

it("rejects a persisted publication whose manifest does not match its document", async () => {
  const id = "demo.tampered-publication";
  const compiled = compileStudioExperience(studioDocument(id));
  expect(compiled.ok).toBe(true);
  if (!compiled.ok) return;

  const record: StudioLifecycleRecord = {
    ...canonicalRecord(id),
    recordVersion: 2,
    publication: {
      ...compiled.value,
      manifest: {
        ...compiled.value.manifest,
        componentRefs: ["test.component.other"],
      },
    },
    publishedDraftRevision: 1,
    publishedAt: updatedAt,
  };

  const result = await serviceFor({ async read() { return record; } })
    .read(workspaceId, id);

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issue.code).toBe("STORE_FAILURE");
});

it("rejects impossible persisted timestamp ordering", async () => {
  const record: StudioLifecycleRecord = {
    ...canonicalRecord("demo.timestamp-order"),
    createdAt: updatedAt,
    updatedAt: createdAt,
  };

  const result = await serviceFor({ async read() { return record; } })
    .read(workspaceId, record.id);

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issue.code).toBe("STORE_FAILURE");
});

it("rejects duplicate experience ids returned by a workspace list adapter", async () => {
  const record = canonicalRecord("demo.duplicate-list-id");
  const result = await serviceFor({ async list() { return [record, { ...record }]; } })
    .list(workspaceId);

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issue.code).toBe("STORE_FAILURE");
});

it("rejects unknown root fields instead of leaking storage-only state", async () => {
  const id = "demo.extra-root-field";
  const record = {
    ...canonicalRecord(id),
    storageSecret: "must-not-escape",
  } as unknown as StudioLifecycleRecord;

  const result = await serviceFor({ async read() { return record; } }).read(workspaceId, id);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issue.code).toBe("STORE_FAILURE");
});

it("rejects persisted lifecycle records with custom prototypes", async () => {
  const id = "demo.custom-prototype";
  const record = Object.assign(Object.create({ storageMarker: true }), canonicalRecord(id)) as StudioLifecycleRecord;

  const result = await serviceFor({ async read() { return record; } }).read(workspaceId, id);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issue.code).toBe("STORE_FAILURE");
});

it("rejects accessor-backed record fields without executing the accessor", async () => {
  const id = "demo.accessor-field";
  const record = { ...canonicalRecord(id) } as StudioLifecycleRecord & Record<string, unknown>;
  let getterCalled = false;
  Object.defineProperty(record, "name", {
    enumerable: true,
    configurable: true,
    get() {
      getterCalled = true;
      return "Accessor record";
    },
  });

  const result = await serviceFor({ async read() { return record; } }).read(workspaceId, id);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issue.code).toBe("STORE_FAILURE");
  expect(getterCalled).toBe(false);
});
