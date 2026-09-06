import type {
  StudioLifecycleRecord,
  StudioLifecycleRevision,
  StudioLifecycleStore,
  StudioLifecycleStoreDeleteResult,
  StudioLifecycleStoreMutationResult,
} from "../../../packages/studio-lifecycle/src/index.js";

function recordKey(workspaceId: string, id: string): string {
  return `${workspaceId}\u0000${id}`;
}

/** Browser-demo adapter only. Production durability remains owned by the lifecycle store boundary. */
export class MemoryStudioLifecycleStore implements StudioLifecycleStore {
  readonly #records = new Map<string, StudioLifecycleRecord>();
  readonly #revisions = new Map<string, StudioLifecycleRevision[]>();

  async list(workspaceId: string): Promise<readonly StudioLifecycleRecord[]> {
    return [...this.#records.values()].filter((record) => record.workspaceId === workspaceId);
  }

  async read(workspaceId: string, id: string): Promise<StudioLifecycleRecord | undefined> {
    return this.#records.get(recordKey(workspaceId, id));
  }

  async listRevisions(workspaceId: string, id: string): Promise<readonly StudioLifecycleRevision[]> {
    return this.#revisions.get(recordKey(workspaceId, id)) ?? [];
  }

  async create(record: StudioLifecycleRecord, revision: StudioLifecycleRevision): Promise<StudioLifecycleStoreMutationResult> {
    const key = recordKey(record.workspaceId, record.id);
    if (this.#records.has(key)) return { ok: false, code: "ALREADY_EXISTS" };
    this.#records.set(key, record);
    this.#revisions.set(key, [revision]);
    return { ok: true, value: record, revision };
  }

  async replace(
    record: StudioLifecycleRecord,
    expectedRecordVersion: number,
    revision: StudioLifecycleRevision | null,
  ): Promise<StudioLifecycleStoreMutationResult> {
    const key = recordKey(record.workspaceId, record.id);
    const current = this.#records.get(key);
    if (!current) return { ok: false, code: "NOT_FOUND" };
    if (current.recordVersion !== expectedRecordVersion) return { ok: false, code: "VERSION_CONFLICT" };
    this.#records.set(key, record);
    if (revision !== null) {
      this.#revisions.set(key, [...(this.#revisions.get(key) ?? []), revision]);
    }
    return { ok: true, value: record, revision };
  }

  async delete(workspaceId: string, id: string, expectedRecordVersion: number): Promise<StudioLifecycleStoreDeleteResult> {
    const key = recordKey(workspaceId, id);
    const current = this.#records.get(key);
    if (!current) return { ok: false, code: "NOT_FOUND" };
    if (current.recordVersion !== expectedRecordVersion) return { ok: false, code: "VERSION_CONFLICT" };
    this.#records.delete(key);
    this.#revisions.delete(key);
    return { ok: true };
  }
}
