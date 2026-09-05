import { describe, expect, it } from "vitest";
import {
  createStudioLifecycleService,
  type StudioLifecycleRecord,
  type StudioLifecycleRevision,
  type StudioLifecycleStore,
  type StudioLifecycleStoreDeleteResult,
  type StudioLifecycleStoreMutationResult,
} from "../src/index.js";

function key(workspaceId: string, id: string): string {
  return `${workspaceId}\u0000${id}`;
}

class MemoryStore implements StudioLifecycleStore {
  readonly records = new Map<string, StudioLifecycleRecord>();
  readonly revisions = new Map<string, StudioLifecycleRevision[]>();
  createCalls = 0;
  replaceCalls = 0;
  deleteCalls = 0;

  async list(workspaceId: string): Promise<readonly StudioLifecycleRecord[]> {
    return [...this.records.values()].filter((record) => record.workspaceId === workspaceId);
  }

  async read(workspaceId: string, id: string): Promise<StudioLifecycleRecord | undefined> {
    return this.records.get(key(workspaceId, id));
  }

  async listRevisions(workspaceId: string, id: string): Promise<readonly StudioLifecycleRevision[]> {
    return this.revisions.get(key(workspaceId, id)) ?? [];
  }

  async create(
    record: StudioLifecycleRecord,
    revision: StudioLifecycleRevision,
  ): Promise<StudioLifecycleStoreMutationResult> {
    this.createCalls += 1;
    const id = key(record.workspaceId, record.id);
    if (this.records.has(id)) return { ok: false, code: "ALREADY_EXISTS" };
    this.records.set(id, record);
    this.revisions.set(id, [revision]);
    return { ok: true, value: record, revision };
  }

  async replace(
    record: StudioLifecycleRecord,
    expectedRecordVersion: number,
    revision: StudioLifecycleRevision | null,
  ): Promise<StudioLifecycleStoreMutationResult> {
    this.replaceCalls += 1;
    const id = key(record.workspaceId, record.id);
    const current = this.records.get(id);
    if (!current) return { ok: false, code: "NOT_FOUND" };
    if (current.recordVersion !== expectedRecordVersion) return { ok: false, code: "VERSION_CONFLICT" };
    this.records.set(id, record);
    if (revision !== null) {
      const history = this.revisions.get(id) ?? [];
      this.revisions.set(id, [...history, revision]);
    }
    return { ok: true, value: record, revision };
  }

  async delete(workspaceId: string, id: string, expectedRecordVersion: number): Promise<StudioLifecycleStoreDeleteResult> {
    this.deleteCalls += 1;
    const recordKey = key(workspaceId, id);
    const current = this.records.get(recordKey);
    if (!current) return { ok: false, code: "NOT_FOUND" };
    if (current.recordVersion !== expectedRecordVersion) return { ok: false, code: "VERSION_CONFLICT" };
    this.records.delete(recordKey);
    this.revisions.delete(recordKey);
    return { ok: true };
  }
}

class TamperingAcknowledgementStore extends MemoryStore {
  override async replace(
    record: StudioLifecycleRecord,
    expectedRecordVersion: number,
    revision: StudioLifecycleRevision | null,
  ): Promise<StudioLifecycleStoreMutationResult> {
    const result = await super.replace(record, expectedRecordVersion, revision);
    if (!result.ok) return result;
    return {
      ok: true,
      value: {
        ...result.value,
        name: `${result.value.name} tampered`,
      },
      revision: result.revision,
    };
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

function setup(store: StudioLifecycleStore = new MemoryStore()) {
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

  it("retains immutable revisions, produces deterministic diffs, and restores as a new draft", async () => {
    const { service } = setup();
    const id = "demo.revision-history";

    const created = await service.create({
      workspaceId: "workspace-a",
      id,
      name: "Lifecycle",
      document: document(id, "Draft one"),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const second = await service.save({
      workspaceId: "workspace-a",
      id,
      name: "Lifecycle",
      expectedRecordVersion: 1,
      document: document(id, "Draft two"),
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const third = await service.save({
      workspaceId: "workspace-a",
      id,
      name: "Renamed lifecycle",
      expectedRecordVersion: 2,
      document: document(id, "Draft three"),
    });
    expect(third.ok).toBe(true);
    if (!third.ok) return;

    const history = await service.history("workspace-a", id);
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    expect(history.value.map((revision) => revision.draftRevision)).toEqual([1, 2, 3]);
    expect(history.value.map((revision) => revision.document.views[0]?.nodes[0]?.props.text))
      .toEqual(["Draft one", "Draft two", "Draft three"]);
    expect(Object.isFrozen(history.value)).toBe(true);
    expect(Object.isFrozen(history.value[0])).toBe(true);

    const firstDiff = await service.diff({
      workspaceId: "workspace-a",
      id,
      fromDraftRevision: 1,
      toDraftRevision: 3,
    });
    const secondDiff = await service.diff({
      workspaceId: "workspace-a",
      id,
      fromDraftRevision: 1,
      toDraftRevision: 3,
    });
    expect(firstDiff).toEqual(secondDiff);
    expect(firstDiff.ok).toBe(true);
    if (!firstDiff.ok) return;
    expect(firstDiff.value.changes.map((change) => change.path)).toEqual([
      "/document/views/0/nodes/0/props/text",
      "/name",
    ]);

    const published = await service.publish({
      workspaceId: "workspace-a",
      id,
      expectedRecordVersion: 3,
    });
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(published.value.publishedDraftRevision).toBe(3);

    const restored = await service.restore({
      workspaceId: "workspace-a",
      id,
      draftRevision: 1,
      expectedRecordVersion: 4,
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value.draftRevision).toBe(4);
    expect(restored.value.recordVersion).toBe(5);
    expect(restored.value.name).toBe("Lifecycle");
    expect(restored.value.document.views[0]?.nodes[0]?.props.text).toBe("Draft one");
    expect(restored.value.publishedDraftRevision).toBe(3);
    expect(restored.value.publication?.document.views[0]?.nodes[0]?.props.text).toBe("Draft three");

    const afterRestore = await service.history("workspace-a", id);
    expect(afterRestore.ok).toBe(true);
    if (!afterRestore.ok) return;
    expect(afterRestore.value.map((revision) => revision.draftRevision)).toEqual([1, 2, 3, 4]);
    expect(afterRestore.value[0]?.document.views[0]?.nodes[0]?.props.text).toBe("Draft one");
    expect(afterRestore.value[3]?.document.views[0]?.nodes[0]?.props.text).toBe("Draft one");
  });

  it("rejects stale writes instead of silently overwriting newer work", async () => {
    const store = new MemoryStore();
    const { service } = setup(store);
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
    expect(store.revisions.get(key("workspace-a", id))?.length).toBe(2);

    const current = await service.read("workspace-a", id);
    expect(current.ok).toBe(true);
    if (current.ok) expect(current.value.document.views[0]?.nodes[0]?.props.text).toBe("B");
  });

  it("fails closed when retained history is missing or inconsistent", async () => {
    const store = new MemoryStore();
    const { service } = setup(store);
    const id = "demo.incomplete-history";
    const created = await service.create({
      workspaceId: "workspace-a",
      id,
      name: "History",
      document: document(id, "A"),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const saved = await service.save({
      workspaceId: "workspace-a",
      id,
      name: "History",
      expectedRecordVersion: 1,
      document: document(id, "B"),
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const recordKey = key("workspace-a", id);
    const revisions = store.revisions.get(recordKey) ?? [];
    store.revisions.set(recordKey, revisions.slice(1));

    const history = await service.history("workspace-a", id);
    expect(history.ok).toBe(false);
    if (!history.ok) expect(history.issue.code).toBe("STORE_FAILURE");

    const restore = await service.restore({
      workspaceId: "workspace-a",
      id,
      draftRevision: 1,
      expectedRecordVersion: 2,
    });
    expect(restore.ok).toBe(false);
    if (!restore.ok) expect(restore.issue.code).toBe("STORE_FAILURE");
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
    const store = new MemoryStore();
    const { service } = setup(store);
    const result = await service.create({
      workspaceId: "workspace-a",
      id: "demo.invalid",
      name: "Invalid",
      document: document("demo.other", "Wrong id"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe("INVALID_DOCUMENT");
    expect(store.records.size).toBe(0);
    expect(store.createCalls).toBe(0);
  });

  it("fails closed before a version overflow can reach storage", async () => {
    const store = new MemoryStore();
    const { service } = setup(store);
    const id = "demo.overflow";
    const created = await service.create({
      workspaceId: "workspace-a",
      id,
      name: "Overflow",
      document: document(id, "A"),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    store.records.set(key("workspace-a", id), {
      ...created.value,
      recordVersion: Number.MAX_SAFE_INTEGER,
    });
    const replaceCallsBefore = store.replaceCalls;
    const result = await service.publish({
      workspaceId: "workspace-a",
      id,
      expectedRecordVersion: Number.MAX_SAFE_INTEGER,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issue.code).toBe("VERSION_OVERFLOW");
      expect(result.issue.path).toBe("$.recordVersion");
    }
    expect(store.replaceCalls).toBe(replaceCallsBefore);
    expect(store.records.get(key("workspace-a", id))?.recordVersion).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("rejects a successful store acknowledgement that changes canonical record data", async () => {
    const store = new TamperingAcknowledgementStore();
    const { service } = setup(store);
    const id = "demo.tampered-ack";
    const created = await service.create({
      workspaceId: "workspace-a",
      id,
      name: "Tamper check",
      document: document(id, "A"),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await service.save({
      workspaceId: "workspace-a",
      id,
      name: "Tamper check",
      expectedRecordVersion: 1,
      document: document(id, "B"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe("STORE_FAILURE");
  });

  it("rejects stored records whose record version is behind their draft revision", async () => {
    const store = new MemoryStore();
    const { service } = setup(store);
    const id = "demo.invalid-version-order";
    const created = await service.create({
      workspaceId: "workspace-a",
      id,
      name: "Version order",
      document: document(id, "A"),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    store.records.set(key("workspace-a", id), {
      ...created.value,
      draftRevision: 2,
      recordVersion: 1,
    });
    const result = await service.read("workspace-a", id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe("STORE_FAILURE");
  });
});
