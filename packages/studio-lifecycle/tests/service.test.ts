import { describe, expect, it } from "vitest";
import {
  createStudioLifecycleService,
  type StudioLifecycleRecord,
  type StudioLifecycleStore,
  type StudioLifecycleStoreDeleteResult,
  type StudioLifecycleStoreMutationResult,
} from "../src/index.js";

function key(workspaceId: string, id: string): string {
  return `${workspaceId}\u0000${id}`;
}

class MemoryStore implements StudioLifecycleStore {
  readonly records = new Map<string, StudioLifecycleRecord>();

  async list(workspaceId: string): Promise<readonly StudioLifecycleRecord[]> {
    return [...this.records.values()].filter((record) => record.workspaceId === workspaceId);
  }

  async read(workspaceId: string, id: string): Promise<StudioLifecycleRecord | undefined> {
    return this.records.get(key(workspaceId, id));
  }

  async create(record: StudioLifecycleRecord): Promise<StudioLifecycleStoreMutationResult> {
    const id = key(record.workspaceId, record.id);
    if (this.records.has(id)) return { ok: false, code: "ALREADY_EXISTS" };
    this.records.set(id, record);
    return { ok: true, value: record };
  }

  async replace(record: StudioLifecycleRecord, expectedRecordVersion: number): Promise<StudioLifecycleStoreMutationResult> {
    const id = key(record.workspaceId, record.id);
    const current = this.records.get(id);
    if (!current) return { ok: false, code: "NOT_FOUND" };
    if (current.recordVersion !== expectedRecordVersion) return { ok: false, code: "VERSION_CONFLICT" };
    this.records.set(id, record);
    return { ok: true, value: record };
  }

  async delete(workspaceId: string, id: string, expectedRecordVersion: number): Promise<StudioLifecycleStoreDeleteResult> {
    const recordKey = key(workspaceId, id);
    const current = this.records.get(recordKey);
    if (!current) return { ok: false, code: "NOT_FOUND" };
    if (current.recordVersion !== expectedRecordVersion) return { ok: false, code: "VERSION_CONFLICT" };
    this.records.delete(recordKey);
    return { ok: true };
  }
}

const componentCatalog = {
  version: "1",
  id: "test.studio.components",
  brandId: "test.brand",
  components: [{
    ref: "test.component.text",
    label: "Text",
    category: "content",
    kind: "content",
    props: [{ key: "text", type: "string", required: true, bindable: false }],
    slots: [],
    events: [],
  }],
};

const bindingSourceCatalog = {
  version: "1",
  id: "test.studio.data",
  sources: [],
};

const actionAdapter = {
  version: "1",
  id: "test.studio.actions",
  mappings: [{ event: "noop", actionType: "test.action.noop" }],
};

function document(id: string, text: string) {
  return {
    version: "1",
    id,
    recipeId: "test.recipe.lifecycle",
    entryView: "main",
    views: [{
      id: "main",
      nodes: [{ id: "root", component: "test.component.text", order: 0, props: { text } }],
    }],
    bindings: [],
    interactions: [],
  };
}

function setup() {
  const store = new MemoryStore();
  let now = Date.UTC(2026, 7, 30, 3, 0, 0, 0);
  const service = createStudioLifecycleService({
    store,
    componentCatalog,
    bindingSourceCatalog,
    actionAdapter,
    nowUnixMs: () => now++,
  });
  return { store, service };
}

describe("Studio lifecycle service", () => {
  it("keeps published artifacts pinned until an explicit republish", async () => {
    const { service } = setup();
    const id = "demo.lifecycle";

    const created = await service.create({
      workspaceId: "workspace-a",
      id,
      name: "Lifecycle",
      document: document(id, "Draft one"),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.draftRevision).toBe(1);
    expect(created.value.recordVersion).toBe(1);
    expect(created.value.publication).toBeNull();
    expect(Object.isFrozen(created.value)).toBe(true);

    const published = await service.publish({
      workspaceId: "workspace-a",
      id,
      expectedRecordVersion: 1,
    });
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(published.value.draftRevision).toBe(1);
    expect(published.value.recordVersion).toBe(2);
    expect(published.value.publishedDraftRevision).toBe(1);
    expect(published.value.publication?.document.views[0]?.nodes[0]?.props.text).toBe("Draft one");

    const saved = await service.save({
      workspaceId: "workspace-a",
      id,
      name: "Lifecycle",
      expectedRecordVersion: 2,
      document: document(id, "Draft two"),
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value.draftRevision).toBe(2);
    expect(saved.value.recordVersion).toBe(3);
    expect(saved.value.document.views[0]?.nodes[0]?.props.text).toBe("Draft two");
    expect(saved.value.publishedDraftRevision).toBe(1);
    expect(saved.value.publication?.document.views[0]?.nodes[0]?.props.text).toBe("Draft one");

    const republished = await service.publish({
      workspaceId: "workspace-a",
      id,
      expectedRecordVersion: 3,
    });
    expect(republished.ok).toBe(true);
    if (!republished.ok) return;
    expect(republished.value.recordVersion).toBe(4);
    expect(republished.value.publishedDraftRevision).toBe(2);
    expect(republished.value.publication?.document.views[0]?.nodes[0]?.props.text).toBe("Draft two");

    const unpublished = await service.unpublish({
      workspaceId: "workspace-a",
      id,
      expectedRecordVersion: 4,
    });
    expect(unpublished.ok).toBe(true);
    if (!unpublished.ok) return;
    expect(unpublished.value.recordVersion).toBe(5);
    expect(unpublished.value.publication).toBeNull();
    expect(unpublished.value.publishedDraftRevision).toBeNull();

    const deleted = await service.delete({
      workspaceId: "workspace-a",
      id,
      expectedRecordVersion: 5,
    });
    expect(deleted).toEqual({ ok: true, value: { id } });
    const missing = await service.read("workspace-a", id);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.issue.code).toBe("NOT_FOUND");
  });

  it("rejects stale writes instead of silently overwriting newer work", async () => {
    const { service } = setup();
    const id = "demo.conflict";
    const created = await service.create({
      workspaceId: "workspace-a",
      id,
      name: "Conflict",
      document: document(id, "A"),
    });
    expect(created.ok).toBe(true);

    const firstSave = await service.save({
      workspaceId: "workspace-a",
      id,
      name: "Conflict",
      expectedRecordVersion: 1,
      document: document(id, "B"),
    });
    expect(firstSave.ok).toBe(true);

    const staleSave = await service.save({
      workspaceId: "workspace-a",
      id,
      name: "Conflict",
      expectedRecordVersion: 1,
      document: document(id, "C"),
    });
    expect(staleSave.ok).toBe(false);
    if (!staleSave.ok) expect(staleSave.issue.code).toBe("CONFLICT");

    const current = await service.read("workspace-a", id);
    expect(current.ok).toBe(true);
    if (current.ok) expect(current.value.document.views[0]?.nodes[0]?.props.text).toBe("B");
  });

  it("scopes records by workspace so identical experience ids do not collide", async () => {
    const { service } = setup();
    const id = "demo.shared-id";

    const first = await service.create({
      workspaceId: "workspace-a",
      id,
      name: "Workspace A",
      document: document(id, "A"),
    });
    const second = await service.create({
      workspaceId: "workspace-b",
      id,
      name: "Workspace B",
      document: document(id, "B"),
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const listA = await service.list("workspace-a");
    const listB = await service.list("workspace-b");
    expect(listA.ok && listA.value.map((record) => record.name)).toEqual(["Workspace A"]);
    expect(listB.ok && listB.value.map((record) => record.name)).toEqual(["Workspace B"]);
  });

  it("rejects invalid documents before touching storage", async () => {
    const { store, service } = setup();
    const result = await service.create({
      workspaceId: "workspace-a",
      id: "demo.invalid",
      name: "Invalid",
      document: document("demo.other", "Wrong id"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe("INVALID_DOCUMENT");
    expect(store.records.size).toBe(0);
  });
});
