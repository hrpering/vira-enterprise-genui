import type { StudioPublication } from "@vira-enterprise-genui/studio-compiler";
import type { StudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";

export const STUDIO_LIFECYCLE_RECORD_VERSION = "1" as const;
export const STUDIO_LIFECYCLE_REVISION_VERSION = "1" as const;

export interface StudioLifecycleRecord {
  readonly version: typeof STUDIO_LIFECYCLE_RECORD_VERSION;
  readonly workspaceId: string;
  readonly id: string;
  readonly name: string;
  readonly draftRevision: number;
  readonly recordVersion: number;
  readonly document: StudioExperienceDocument;
  readonly publication: StudioPublication | null;
  readonly publishedDraftRevision: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

/** Immutable draft snapshot retained independently from the mutable lifecycle record. */
export interface StudioLifecycleRevision {
  readonly version: typeof STUDIO_LIFECYCLE_REVISION_VERSION;
  readonly workspaceId: string;
  readonly id: string;
  readonly draftRevision: number;
  readonly name: string;
  readonly document: StudioExperienceDocument;
  readonly recordedAt: string;
}

export interface StudioLifecycleSummary {
  readonly workspaceId: string;
  readonly id: string;
  readonly name: string;
  readonly draftRevision: number;
  readonly recordVersion: number;
  readonly published: boolean;
  readonly publishedDraftRevision: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export type StudioLifecycleDiffChangeKind = "ADDED" | "REMOVED" | "CHANGED";

/**
 * One deterministic RFC-6901-style path change between two immutable draft revisions.
 * `before` is absent for ADDED values and `after` is absent for REMOVED values.
 */
export interface StudioLifecycleDiffChange {
  readonly path: string;
  readonly kind: StudioLifecycleDiffChangeKind;
  readonly before?: unknown;
  readonly after?: unknown;
}

export interface StudioLifecycleRevisionDiff {
  readonly workspaceId: string;
  readonly id: string;
  readonly fromDraftRevision: number;
  readonly toDraftRevision: number;
  readonly changes: readonly StudioLifecycleDiffChange[];
}

export type StudioLifecycleStoreMutationCode =
  | "ALREADY_EXISTS"
  | "NOT_FOUND"
  | "VERSION_CONFLICT";

export type StudioLifecycleStoreMutationResult =
  | {
      readonly ok: true;
      readonly value: StudioLifecycleRecord;
      readonly revision: StudioLifecycleRevision | null;
    }
  | { readonly ok: false; readonly code: StudioLifecycleStoreMutationCode };

export type StudioLifecycleStoreDeleteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "NOT_FOUND" | "VERSION_CONFLICT" };

/**
 * Trusted storage boundary for Studio lifecycle records and immutable draft history.
 *
 * `create` MUST atomically persist both `record` and `revision`.
 * `replace` MUST compare `expectedRecordVersion` atomically with the persisted
 * record and, when `revision` is non-null, atomically persist the new current
 * record and immutable revision snapshot in the same mutation. When `revision`
 * is null, no history row may be created. `delete` MUST remove the lifecycle
 * record and its retained revisions atomically.
 *
 * A database implementation should use a transaction plus a CAS/version
 * predicate in the write itself rather than a read-then-write race.
 */
export interface StudioLifecycleStore {
  list(workspaceId: string): Promise<readonly StudioLifecycleRecord[]>;
  read(workspaceId: string, id: string): Promise<StudioLifecycleRecord | undefined>;
  listRevisions(workspaceId: string, id: string): Promise<readonly StudioLifecycleRevision[]>;
  create(record: StudioLifecycleRecord, revision: StudioLifecycleRevision): Promise<StudioLifecycleStoreMutationResult>;
  replace(
    record: StudioLifecycleRecord,
    expectedRecordVersion: number,
    revision: StudioLifecycleRevision | null,
  ): Promise<StudioLifecycleStoreMutationResult>;
  delete(workspaceId: string, id: string, expectedRecordVersion: number): Promise<StudioLifecycleStoreDeleteResult>;
}

export type StudioLifecycleIssueCode =
  | "INVALID_WORKSPACE"
  | "INVALID_ID"
  | "INVALID_NAME"
  | "INVALID_VERSION"
  | "VERSION_OVERFLOW"
  | "INVALID_CLOCK"
  | "INVALID_DOCUMENT"
  | "PUBLISH_FAILED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STORE_FAILURE";

export interface StudioLifecycleIssue {
  readonly code: StudioLifecycleIssueCode;
  readonly path: string;
  readonly message: string;
}

export type StudioLifecycleResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: StudioLifecycleIssue };

export interface StudioLifecycleServiceConfiguration {
  readonly store: StudioLifecycleStore;
  readonly componentCatalog: unknown;
  readonly bindingSourceCatalog: unknown;
  readonly actionAdapter: unknown;
  readonly nowUnixMs: () => number;
}

export interface StudioLifecycleCreateInput {
  readonly workspaceId: string;
  readonly id: string;
  readonly name: string;
  readonly document: unknown;
}

export interface StudioLifecycleSaveInput extends StudioLifecycleCreateInput {
  readonly expectedRecordVersion: number;
}

export interface StudioLifecycleVersionedInput {
  readonly workspaceId: string;
  readonly id: string;
  readonly expectedRecordVersion: number;
}

export interface StudioLifecycleDiffInput {
  readonly workspaceId: string;
  readonly id: string;
  readonly fromDraftRevision: number;
  readonly toDraftRevision: number;
}

export interface StudioLifecycleRestoreInput extends StudioLifecycleVersionedInput {
  readonly draftRevision: number;
}

export interface StudioLifecycleService {
  list(workspaceId: string): Promise<StudioLifecycleResult<readonly StudioLifecycleSummary[]>>;
  read(workspaceId: string, id: string): Promise<StudioLifecycleResult<StudioLifecycleRecord>>;
  history(workspaceId: string, id: string): Promise<StudioLifecycleResult<readonly StudioLifecycleRevision[]>>;
  diff(input: StudioLifecycleDiffInput): Promise<StudioLifecycleResult<StudioLifecycleRevisionDiff>>;
  create(input: StudioLifecycleCreateInput): Promise<StudioLifecycleResult<StudioLifecycleRecord>>;
  save(input: StudioLifecycleSaveInput): Promise<StudioLifecycleResult<StudioLifecycleRecord>>;
  restore(input: StudioLifecycleRestoreInput): Promise<StudioLifecycleResult<StudioLifecycleRecord>>;
  publish(input: StudioLifecycleVersionedInput): Promise<StudioLifecycleResult<StudioLifecycleRecord>>;
  unpublish(input: StudioLifecycleVersionedInput): Promise<StudioLifecycleResult<StudioLifecycleRecord>>;
  delete(input: StudioLifecycleVersionedInput): Promise<StudioLifecycleResult<{ readonly id: string }>>;
}
