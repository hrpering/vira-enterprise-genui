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

function sameData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!sameData(left[index], right[index])) return false;
    }
    return true;
  }
  const leftObject = left as Record<string, unknown>;
  const rightObject = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftObject).sort();
  const rightKeys = Object.keys(rightObject).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];
    if (!key || key !== rightKeys[index] || !sameData(leftObject[key], rightObject[key])) return false;
  }
  return true;
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

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function nestedDocumentPath(path: string): string {
  if (path === "$") return "$.document";
  if (path.startsWith("$.document")) return path;
  return `$.document${path.slice(1)}`;
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

function incrementVersion(value: number, path: "$.recordVersion" | "$.draftRevision"): StudioLifecycleResult<number> {
  if (value >= Number.MAX_SAFE_INTEGER) {
    return failure("VERSION_OVERFLOW", path, `${path.slice(2)} cannot be incremented beyond Number.MAX_SAFE_INTEGER`);
  }
  return { ok: true, value: value + 1 };
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
    return failure("INVALID_DOCUMENT", nestedDocumentPath(bindings.issue.path), bindings.issue.message);
  }
  const design = validateStudioDesignDocument(bindings.value, configuration.componentCatalog);
  if (!design.ok) {
    return failure("INVALID_DOCUMENT", nestedDocumentPath(design.issue.path), design.issue.message);
  }
  const flow = validateStudioDocumentFlow(design.value, configuration.componentCatalog, configuration.actionAdapter);
  if (!flow.ok) {
    return failure("INVALID_DOCUMENT", nestedDocumentPath(flow.issue.path), flow.issue.message);
  }
  if (flow.value.id !== expectedId) {
    return failure("INVALID_DOCUMENT", "$.document.id", "Studio document id must match the lifecycle record id");
  }
  return { ok: true, value: snapshot(flow.value) };
}

function validStoredRecordIdentity(record: StudioLifecycleRecord, workspaceId: string, id?: string): boolean {
  if (record.version !== STUDIO_LIFECYCLE_RECORD_VERSION
    || record.workspaceId !== workspaceId
    || (id !== undefined && record.id !== id)
    || !validExperienceId(record.id)
    || !validName(record.name)
    || !validVersion(record.draftRevision)
    || !validVersion(record.recordVersion)
    || record.recordVersion < record.draftRevision
    || !validTimestamp(record.createdAt)
    || !validTimestamp(record.updatedAt)
    || record.document.id !== record.id) return false;

  if (record.publication === null) {
    return record.publishedDraftRevision === null && record.publishedAt === null;
  }
  return record.publication.id === record.id
    && record.publication.document.id === record.id
    && validVersion(record.publishedDraftRevision)
    && record.publishedDraftRevision <= record.draftRevision
    && validTimestamp(record.publishedAt);
}

function validMutationAcknowledgement(record: StudioLifecycleRecord, expected: StudioLifecycleRecord): boolean {
  return validStoredRecordIdentity(record, expected.workspaceId, expected.id)
    && sameData(record, expected);
}

function storeFailure<T>(): StudioLifecycleResult<T> {
  return failure("STORE_FAILURE", "$.store", "Studio lifecycle storage operation failed");
}

function mutationFailure<T>(code: StudioLifecycleStoreMutationCode): StudioLifecycleResult<T> {
  if (code === "NOT_FOUND") return failure("NOT_FOUND", "$.id", "Studio experience was not found");
  if (code === "ALREADY_EXISTS") return failure("CONFLICT", "$.id", "Studio experience already exists");
  return failure("CONFLICT", "$.expectedRecordVersion", "Studio experience changed since it was loaded");
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
  try {
    const record = await configuration.store.read(workspaceId, id);
    if (!record) return failure("NOT_FOUND", "$.id", "Studio experience was not found");
    if (!validStoredRecordIdentity(record, workspaceId, id)) return storeFailure();
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
  const service: StudioLifecycleService = {
    async list(workspaceId) {
      const identity = validateIdentity(workspaceId);
      if (!identity.ok) return identity;
      try {
        const records = await configuration.store.list(workspaceId);
        if (!Array.isArray(records) || records.some((record) => !validStoredRecordIdentity(record, workspaceId))) return storeFailure();
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
        if (!validMutationAcknowledgement(stored.value, record)) return storeFailure();
        return { ok: true, value: snapshot(stored.value) };
      } catch {
        return storeFailure();
      }
    },

    async save(input) {
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
      const nextRecordVersion = incrementVersion(current.value.recordVersion, "$.recordVersion");
      if (!nextRecordVersion.ok) return nextRecordVersion;
      const nextDraftRevision = incrementVersion(current.value.draftRevision, "$.draftRevision");
      if (!nextDraftRevision.ok) return nextDraftRevision;
      const now = timestamp(configuration);
      if (!now.ok) return now;
      const next: StudioLifecycleRecord = snapshot({
        ...current.value,
        name: input.name,
        draftRevision: nextDraftRevision.value,
        recordVersion: nextRecordVersion.value,
        document: document.value,
        updatedAt: now.value,
      });
      try {
        const stored = await configuration.store.replace(next, version.value);
        if (!stored.ok) return mutationFailure(stored.code);
        if (!validMutationAcknowledgement(stored.value, next)) return storeFailure();
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
      const nextRecordVersion = incrementVersion(current.value.recordVersion, "$.recordVersion");
      if (!nextRecordVersion.ok) return nextRecordVersion;
      const publication = prepareStudioPublication({
        document: current.value.document,
        componentCatalog: configuration.componentCatalog,
        bindingSourceCatalog: configuration.bindingSourceCatalog,
        actionAdapter: configuration.actionAdapter,
      });
      if (!publication.ok) {
        return failure("PUBLISH_FAILED", nestedDocumentPath(publication.issue.path), publication.issue.message);
      }
      const now = timestamp(configuration);
      if (!now.ok) return now;
      const next: StudioLifecycleRecord = snapshot({
        ...current.value,
        recordVersion: nextRecordVersion.value,
        publication: publication.value,
        publishedDraftRevision: current.value.draftRevision,
        updatedAt: now.value,
        publishedAt: now.value,
      });
      try {
        const stored = await configuration.store.replace(next, version.value);
        if (!stored.ok) return mutationFailure(stored.code);
        if (!validMutationAcknowledgement(stored.value, next)) return storeFailure();
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
      const nextRecordVersion = incrementVersion(current.value.recordVersion, "$.recordVersion");
      if (!nextRecordVersion.ok) return nextRecordVersion;
      const now = timestamp(configuration);
      if (!now.ok) return now;
      const next: StudioLifecycleRecord = snapshot({
        ...current.value,
        recordVersion: nextRecordVersion.value,
        publication: null,
        publishedDraftRevision: null,
        updatedAt: now.value,
        publishedAt: null,
      });
      try {
        const stored = await configuration.store.replace(next, version.value);
        if (!stored.ok) return mutationFailure(stored.code);
        if (!validMutationAcknowledgement(stored.value, next)) return storeFailure();
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
  };
  return Object.freeze(service);
}
