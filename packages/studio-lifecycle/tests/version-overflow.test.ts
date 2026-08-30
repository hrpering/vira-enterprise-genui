import { expect, it } from "vitest";
import {
  createStudioLifecycleService,
  type StudioLifecycleRecord,
  type StudioLifecycleStore,
  type StudioLifecycleStoreDeleteResult,
  type StudioLifecycleStoreMutationResult,
} from "../src/index.js";

class MutableStore implements StudioLifecycleStore {
  record: StudioLifecycleRecord | undefined;
  replaceCalls = 0;

  async list(workspaceId: string): Promise<readonly StudioLifecycleRecord[]> {
    return this.record?.workspaceId === workspaceId ? [this.record] : [];
  }

  async read(workspaceId: string, id: string): Promise<StudioLifecycleRecord | undefined> {
    return this.record?.workspaceId === workspaceId && this.record.id === id ? this.record : undefined;
  }

  async create(record: StudioLifecycleRecord): Promise<StudioLifecycleStoreMutationResult> {
    if (this.record) return { ok: false, code: "ALREADY_EXISTS" };
    this.record = record;
    return { ok: true, value: record };
  }

  async replace(record: StudioLifecycleRecord, expectedRecordVersion: number): Promise<StudioLifecycleStoreMutationResult> {
    this.replaceCalls += 1;
    if (!this.record) return { ok: false, code: "NOT_FOUND" };
    if (this.record.recordVersion !== expectedRecordVersion) return { ok: false, code: "VERSION_CONFLICT" };
    this.record = record;
    return { ok: true, value: record };
  }

  async delete(): Promise<StudioLifecycleStoreDeleteResult> {
    return { ok: false, code: "NOT_FOUND" };
  }
}

const componentCatalog = {
  version: "1",
  id: "test.overflow.components",
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
  id: "test.overflow.data",
  sources: [],
};

const actionAdapter = {
  version: "1",
  id: "test.overflow.actions",
  mappings: [{ event: "noop", actionType: "test.action.noop" }],
};

const id = "demo.overflow";
const document = {
  version: "1",
  id,
  recipeId: "test.recipe.overflow",
  entryView: "main",
  views: [{
    id: "main",
    nodes: [{ id: "root", component: "test.component.text", order: 0, props: { text: "Overflow" } }],
  }],
  bindings: [],
  interactions: [],
};

it("fails before persistence when recordVersion cannot be incremented safely", async () => {
  const store = new MutableStore();
  const service = createStudioLifecycleService({
    store,
    componentCatalog,
    bindingSourceCatalog,
    actionAdapter,
    nowUnixMs: () => Date.UTC(2026, 7, 30, 3, 0, 0, 0),
  });

  const created = await service.create({
    workspaceId: "workspace-a",
    id,
    name: "Overflow",
    document,
  });
  expect(created.ok).toBe(true);
  if (!created.ok || !store.record) return;

  store.record = Object.freeze({
    ...store.record,
    recordVersion: Number.MAX_SAFE_INTEGER,
  });

  const published = await service.publish({
    workspaceId: "workspace-a",
    id,
    expectedRecordVersion: Number.MAX_SAFE_INTEGER,
  });

  expect(published.ok).toBe(false);
  if (!published.ok) {
    expect(published.issue.code).toBe("VERSION_OVERFLOW");
    expect(published.issue.path).toBe("$.recordVersion");
  }
  expect(store.replaceCalls).toBe(0);
});
