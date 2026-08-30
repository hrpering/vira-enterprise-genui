import { validateStudioDocumentBindings } from "@vira-enterprise-genui/studio-binding";
import { validateStudioDesignDocument } from "@vira-enterprise-genui/studio-design";
import { validateStudioDocumentFlow } from "@vira-enterprise-genui/studio-flow";
import { prepareStudioPublication } from "@vira-enterprise-genui/studio-publish";
import type { StudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import {
  STUDIO_LIFECYCLE_RECORD_VERSION,
} from "./types.js";
import type {
  StudioLifecycleCreateInput,
  StudioLifecycleIssueCode,
  StudioLifecycleRecord,
  StudioLifecycleResult,
  StudioLifecycleSaveInput,
  StudioLifecycleService,
  StudioLifecycleServiceConfiguration,
  StudioLifecycleStoreMutationCode,
  StudioLifecycleSummary,
  StudioLifecycleVersionedInput,
} from "./types.js";

const workspacePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const experienceIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const controlCharacterPattern = /[\u0000-\u001F\u007F]/;

function failure<T>(code: StudioLifecycleIssueCode, path: string, message: string): StudioLifecycleResult<T> {
  return { ok: false, issue: { code, path, message } };
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value);
  }
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) deepFreeze(object[key]);
  return Object.freeze(value);
}

function snapshot<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function validWorkspaceId(value: unknown): value is string {
  return typeof value === "string" && workspacePattern.test(value);
}

function validExperienceId(value: unknown): value is string {
  return typeof value === "string" && experienceIdPattern.test(value);
}

function validName(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= 120
    && value.trim() === value
    && !controlCharacterPattern.test(value);
}

function validVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function validateIdentity(workspaceId: unknown, id?: unknown): StudioLifecycleResult<true> {
  if (!validWorkspaceId(workspaceId)) {
    return failure("INVALID_WORKSPACE", "$.workspaceId", "workspaceId must be one bounded opaque workspace key");
  }
  if (id !== undefined && !validExperienceId(id)) {
    return failure("INVALID_ID", "$.id", "experience id must be a dotted semantic identifier");
  }
  return { ok: true, value: true };
}

function validateExpectedVersion(value: unknown): StudioLifecycleResult<number> {
  if (!validVersion(value)) {
    return failure("INVALID_VERSION", "$.expectedRecordVersion", "expectedRecordVersion must be a positive safe integer");
  }
  return { ok: true, value };
}

function timestamp(configuration: StudioLifecycleServiceConfiguration): StudioLifecycleResult<string> {
  let value: number;
  try {
    value = configuration.nowUnixMs();
  } catch {
    return failure("INVALID_CLOCK", "$.nowUnixMs", "Studio lifecycle clock failed");
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    return failure("INVALID_CLOCK", "$.nowUnixMs", "Studio lifecycle clock must return a non-negative safe integer");
  }
  try {
    return { ok: true, value: new Date(value).toISOString() };
  } catch {
    return failure("INVALID_CLOCK", "$.nowUnixMs", "Studio lifecycle clock is outside the supported timestamp range");
  }
}

function validateDraft(
  configuration: StudioLifecycleServiceConfiguration,
  documentInput: unknown,
  expectedId: string,
): StudioLifecycleResult<StudioExperienceDocument> {
  const bindings = validateStudioDocumentBindings(
    documentInput,
    configuration.componentCatalog,
    configuration.bindingSourceCatalog,
  );
  if (!bindings.ok) {
    return failure("INVALID_DOCUMENT", `$.document${bindings.issue.path.slice(1)}`, bindings.issue.message);
  }
  const design = validateStudioDesignDocument(bindings.value, configuration.componentCatalog);
  if (!design.ok) {
    return failure("INVALID_DOCUMENT", `$.document${design.issue.path.slice(1)}`, design.issue.message);
  }
  const flow = validateStudioDocumentFlow(design.value, configuration.componentCatalog, configuration.actionAdapter);
  if (!flow.ok) {
    return failure("INVALID_DOCUMENT", `$.document${flow.issue.path.slice(1)}`, flow.issue.message);
  }
  if (flow.value.id !== expectedId) {
    return failure("INVALID_DOCUMENT", "$.document.id", "Studio document id must match the lifecycle record id");
  }
  return { ok: true, value: snapshot(flow.value) };
}

function validStoredRecordIdentity(record: StudioLifecycleRecord, workspaceId: string, id?: string): boolean {
  return record.version === STUDIO_LIFECYCLE_RECORD_VERSION
    && record.workspaceId === workspaceId
    && (id === undefined || record.id === id)
    && validExperienceId(record.id)
    && validName(record.name)
    && validVersion(record.draftRevision)
    && validVersion(record.recordVersion)
    && record.document.id === record.id;
}

function storeFailure<T>(): StudioLifecycleResult<T> {
  return failure("STORE_FAILURE", "$.store", "Studio lifecycle storage operation failed");
}

function mutationFailure<T>(code: StudioLifecycleStoreMutationCode): StudioLifecycleResult<T> {
  if (code === "NOT_FOUND") return failure("NOT_FOUND", "$.id", "Studio experience was not found");
  return failure("CONFLICT", "$.expectedRecordVersion", code === "ALREADY_EXISTS"
    ? "Studio experience already exists"
    : "Studio experience changed since it was loaded");
}

function summary(record: StudioLifecycleRecord): StudioLifecycleSummary {
  return Object.freeze({
    workspaceId: record.workspaceId,
    id: record.id,
    name: record.name,
    draftRevision: record.draftRevision,
    recordVersion: record.recordVersion,
    published: record.publication !== null,
    publishedDraftRevision: record.publishedDraftRevision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    publishedAt: record.publishedAt,
  });
}

async function readCurrent(
  configuration: StudioLifecycleServiceConfiguration,
  workspaceId: string,
  id: string,
): Promise<StudioLifecycleResult<StudioLifecycleRecord>> {
  let record: StudioLifecycleRecord | undefined;
  try {
    record = await configuration.store.read(workspaceId, id);
  } catch {
    return storeFailure();
  }
  if (!record) return failure("NOT_FOUND", "$.id", "Studio experience was not found");
  if (!validStoredRecordIdentity(record, workspaceId, id)) return storeFailure();
  try {
    return { ok: true, value: snapshot(record) };
  } catch {
    return storeFailure();
  }
}

function validateCreateInput(input: StudioLifecycleCreateInput): StudioLifecycleResult<true> {
  const identity = validateIdentity(input.workspaceId, input.id);
  if (!identity.ok) return identity;
  if (!validName(input.name)) return failure("INVALID_NAME", "$.name", "name must be a bounded trimmed display string");
  return { ok: true, value: true };
}

function validateVersionedInput(input: StudioLifecycleVersionedInput): StudioLifecycleResult<number> {
  const identity = validateIdentity(input.workspaceId, input.id);
  if (!identity.ok) return identity;
  return validateExpectedVersion(input.expectedRecordVersion);
}

export function createStudioLifecycleService(configuration: StudioLifecycleServiceConfiguration): StudioLifecycleService {
  return Object.freeze({
    async list(workspaceId) {
      const identity = validateIdentity(workspaceId);
      if (!identity.ok) return identity;
      let records: readonly StudioLifecycleRecord[];
      try {
        records = await configuration.store.list(workspaceId);
      } catch {
        return storeFailure();
      }
      if (!Array.isArray(records) || records.some((record) => !validStoredRecordIdentity(record, workspaceId))) return storeFailure();
      try {
        const output = records
          .map((record) => summary(snapshot(record)))
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
        return { ok: true, value: Object.freeze(output) };
      } catch {
        return storeFailure();
      }
    },

    async read(workspaceId, id) {
      const identity = validateIdentity(workspaceId, id);
      if (!identity.ok) return identity;
      return readCurrent(configuration, workspaceId, id);
    },

    async create(input) {
      const valid = validateCreateInput(input);
      if (!valid.ok) return valid;
      const document = validateDraft(configuration, input.document, input.id);
      if (!document.ok) return document;
      const now = timestamp(configuration);
      if (!now.ok) return now;
      const record: StudioLifecycleRecord = snapshot({
        version: STUDIO_LIFECYCLE_RECORD_VERSION,
        workspaceId: input.workspaceId,
        id: input.id,
        name: input.name,
        draftRevision: 1,
        recordVersion: 1,
        document: document.value,
        publication: null,
        publishedDraftRevision: null,
        createdAt: now.value,
        updatedAt: now.value,
        publishedAt: null,
      });
      try {
        const stored = await configuration.store.create(record);
        if (!stored.ok) return mutationFailure(stored.code);
        if (!validStoredRecordIdentity(stored.value, input.workspaceId, input.id)) return storeFailure();
        return { ok: true, value: snapshot(stored.value) };
      } catch {
        return storeFailure();
      }
    },

    async save(input: StudioLifecycleSaveInput) {
      const valid = validateCreateInput(input);
      if (!valid.ok) return valid;
      const version = validateExpectedVersion(input.expectedRecordVersion);
      if (!version.ok) return version;
      const document = validateDraft(configuration, input.document, input.id);
      if (!document.ok) return document;
      const current = await readCurrent(configuration, input.workspaceId, input.id);
      if (!current.ok) return current;
      if (current.value.recordVersion !== version.value) {
        return failure("CONFLICT", "$.expectedRecordVersion", "Studio experience changed since it was loaded");
      }
      const now = timestamp(configuration);
      if (!now.ok) return now;
      const next: StudioLifecycleRecord = snapshot({
        ...current.value,
        name: input.name,
        draftRevision: current.value.draftRevision + 1,
        recordVersion: current.value.recordVersion + 1,
        document: document.value,
        updatedAt: now.value,
      });
      try {
        const stored = await configuration.store.replace(next, version.value);
        if (!stored.ok) return mutationFailure(stored.code);
        if (!validStoredRecordIdentity(stored.value, input.workspaceId, input.id)) return storeFailure();
        return { ok: true, value: snapshot(stored.value) };
      } catch {
        return storeFailure();
      }
    },

    async publish(input) {
      const version = validateVersionedInput(input);
      if (!version.ok) return version;
      const current = await readCurrent(configuration, input.workspaceId, input.id);
      if (!current.ok) return current;
      if (current.value.recordVersion !== version.value) {
        return failure("CONFLICT", "$.expectedRecordVersion", "Studio experience changed since it was loaded");
      }
      const publication = prepareStudioPublication({
        document: current.value.document,
        componentCatalog: configuration.componentCatalog,
        bindingSourceCatalog: configuration.bindingSourceCatalog,
        actionAdapter: configuration.actionAdapter,
      });
      if (!publication.ok) {
        return failure("PUBLISH_FAILED", `$.document${publication.issue.path.slice(1)}`, publication.issue.message);
      }
      const now = timestamp(configuration);
      if (!now.ok) return now;
      const next: StudioLifecycleRecord = snapshot({
        ...current.value,
        recordVersion: current.value.recordVersion + 1,
        publication: publication.value,
        publishedDraftRevision: current.value.draftRevision,
        updatedAt: now.value,
        publishedAt: now.value,
      });
      try {
        const stored = await configuration.store.replace(next, version.value);
        if (!stored.ok) return mutationFailure(stored.code);
        if (!validStoredRecordIdentity(stored.value, input.workspaceId, input.id)) return storeFailure();
        return { ok: true, value: snapshot(stored.value) };
      } catch {
        return storeFailure();
      }
    },

    async unpublish(input) {
      const version = validateVersionedInput(input);
      if (!version.ok) return version;
      const current = await readCurrent(configuration, input.workspaceId, input.id);
      if (!current.ok) return current;
      if (current.value.recordVersion !== version.value) {
        return failure("CONFLICT", "$.expectedRecordVersion", "Studio experience changed since it was loaded");
      }
      if (current.value.publication === null) return current;
      const now = timestamp(configuration);
      if (!now.ok) return now;
      const next: StudioLifecycleRecord = snapshot({
        ...current.value,
        recordVersion: current.value.recordVersion + 1,
        publication: null,
        publishedDraftRevision: null,
        updatedAt: now.value,
        publishedAt: null,
      });
      try {
        const stored = await configuration.store.replace(next, version.value);
        if (!stored.ok) return mutationFailure(stored.code);
        if (!validStoredRecordIdentity(stored.value, input.workspaceId, input.id)) return storeFailure();
        return { ok: true, value: snapshot(stored.value) };
      } catch {
        return storeFailure();
      }
    },

    async delete(input) {
      const version = validateVersionedInput(input);
      if (!version.ok) return version;
      try {
        const deleted = await configuration.store.delete(input.workspaceId, input.id, version.value);
        if (!deleted.ok) return mutationFailure(deleted.code);
        return { ok: true, value: Object.freeze({ id: input.id }) };
      } catch {
        return storeFailure();
      }
    },
  });
}
