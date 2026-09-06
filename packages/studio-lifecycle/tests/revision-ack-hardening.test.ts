import { expect, it } from "vitest";
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
    const recordKey = key(record.workspaceId, record.id);
    if (this.records.has(recordKey)) return { ok: false, code: "ALREADY_EXISTS" };
    this.records.set(recordKey, record);
    this.revisions.set(recordKey, [revision]);
    return { ok: true, value: record, revision };
  }

  async replace(
    record: StudioLifecycleRecord,
    expectedRecordVersion: number,
    revision: StudioLifecycleRevision | null,
  ): Promise<StudioLifecycleStoreMutationResult> {
    const recordKey = key(record.workspaceId, record.id);
    const current = this.records.get(recordKey);
    if (!current) return { ok: false, code: "NOT_FOUND" };
    if (current.recordVersion !== expectedRecordVersion) return { ok: false, code: "VERSION_CONFLICT" };
    this.records.set(recordKey, record);
    if (revision !== null) {
      this.revisions.set(recordKey, [...(this.revisions.get(recordKey) ?? []), revision]);
    }
    return { ok: true, value: record, revision };
  }

  async delete(
    workspaceId: string,
    id: string,
    expectedRecordVersion: number,
  ): Promise<StudioLifecycleStoreDeleteResult> {
    const recordKey = key(workspaceId, id);
    const current = this.records.get(recordKey);
    if (!current) return { ok: false, code: "NOT_FOUND" };
    if (current.recordVersion !== expectedRecordVersion) return { ok: false, code: "VERSION_CONFLICT" };
    this.records.delete(recordKey);
    this.revisions.delete(recordKey);
    return { ok: true };
  }
}

class TamperedRevisionAcknowledgementStore extends MemoryStore {
  override async replace(
    record: StudioLifecycleRecord,
    expectedRecordVersion: number,
    revision: StudioLifecycleRevision | null,
  ): Promise<StudioLifecycleStoreMutationResult> {
    const result = await super.replace(record, expectedRecordVersion, revision);
    if (!result.ok || result.revision === null) return result;
    return {
      ok: true,
      value: result.value,
      revision: {
        ...result.revision,
        name: `${result.revision.name} tampered`,
      },
    };
  }
}

class UnexpectedPublishRevisionStore extends MemoryStore {
  override async replace(
    record: StudioLifecycleRecord,
    expectedRecordVersion: number,
    revision: StudioLifecycleRevision | null,
  ): Promise<StudioLifecycleStoreMutationResult> {
    const result = await super.replace(record, expectedRecordVersion, revision);
    if (!result.ok || revision !== null) return result;
    const latest = this.revisions.get(key(record.workspaceId, record.id))?.at(-1);
    return {
      ok: true,
      value: result.value,
      revision: latest ?? null,
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

function serviceFor(store: StudioLifecycleStore) {
  let now = Date.UTC(2026, 8, 6, 0, 0, 0, 0);
  return createStudioLifecycleService({
    store,
    componentCatalog,
    bindingSourceCatalog,
    actionAdapter,
    nowUnixMs: () => now++,
  });
}

it("rejects a successful save acknowledgement whose revision differs from the canonical snapshot", async () => {
  const store = new TamperedRevisionAcknowledgementStore();
  const service = serviceFor(store);
  const id = "demo.revision-ack-tamper";
  const created = await service.create({
    workspaceId: "workspace-a",
    id,
    name: "Revision ack",
    document: document(id, "A"),
  });
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  const saved = await service.save({
    workspaceId: "workspace-a",
    id,
    name: "Revision ack",
    expectedRecordVersion: 1,
    document: document(id, "B"),
  });

  expect(saved.ok).toBe(false);
  if (!saved.ok) expect(saved.issue.code).toBe("STORE_FAILURE");
});

it("rejects a publish acknowledgement that invents a draft revision", async () => {
  const store = new UnexpectedPublishRevisionStore();
  const service = serviceFor(store);
  const id = "demo.publish-revision-ack";
  const created = await service.create({
    workspaceId: "workspace-a",
    id,
    name: "Publish ack",
    document: document(id, "A"),
  });
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  const published = await service.publish({
    workspaceId: "workspace-a",
    id,
    expectedRecordVersion: 1,
  });

  expect(published.ok).toBe(false);
  if (!published.ok) expect(published.issue.code).toBe("STORE_FAILURE");
});
