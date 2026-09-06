import { validateStudioDocumentBindings } from "@vira-enterprise-genui/studio-binding";
import { compileStudioExperience } from "@vira-enterprise-genui/studio-compiler";
import { validateStudioDesignDocument } from "@vira-enterprise-genui/studio-design";
import { validateStudioDocumentFlow } from "@vira-enterprise-genui/studio-flow";
import { prepareStudioPublication } from "@vira-enterprise-genui/studio-publish";
import {
  parseStudioExperienceDocument,
  type StudioExperienceDocument,
} from "@vira-enterprise-genui/studio-schema";
import {
  STUDIO_LIFECYCLE_RECORD_VERSION,
  STUDIO_LIFECYCLE_REVISION_VERSION,
} from "./types.js";
import type {
  StudioLifecycleCreateInput,
  StudioLifecycleDiffChange,
  StudioLifecycleDiffInput,
  StudioLifecycleIssueCode,
  StudioLifecycleRecord,
  StudioLifecycleRestoreInput,
  StudioLifecycleResult,
  StudioLifecycleRevision,
  StudioLifecycleRevisionDiff,
  StudioLifecycleService,
  StudioLifecycleServiceConfiguration,
  StudioLifecycleStoreMutationCode,
  StudioLifecycleSummary,
  StudioLifecycleVersionedInput,
} from "./types.js";

const workspacePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const experienceIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const controlCharacterPattern = /[\u0000-\u001F\u007F]/;
const lifecycleRecordFields = new Set([
  "version",
  "workspaceId",
  "id",
  "name",
  "draftRevision",
  "recordVersion",
  "document",
  "publication",
  "publishedDraftRevision",
  "createdAt",
  "updatedAt",
  "publishedAt",
]);
const lifecycleRevisionFields = new Set([
  "version",
  "workspaceId",
  "id",
  "draftRevision",
  "name",
  "document",
  "recordedAt",
]);

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

function validExactObject(value: unknown, fields: ReadonlySet<string>): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  const keys = Object.keys(value);
  if (Object.getOwnPropertyNames(value).length !== keys.length || keys.length !== fields.size) return false;
  for (const key of keys) {
    if (!fields.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) return false;
  }
  return true;
}

function validLifecycleRecordObject(value: unknown): value is StudioLifecycleRecord {
  return validExactObject(value, lifecycleRecordFields);
}

function validLifecycleRevisionObject(value: unknown): value is StudioLifecycleRevision {
  return validExactObject(value, lifecycleRevisionFields);
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

function timestampValue(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;
  try {
    if (new Date(parsed).toISOString() !== value) return undefined;
  } catch {
    return undefined;
  }
  return parsed;
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

function validateDraftRevision(value: unknown, path: string): StudioLifecycleResult<number> {
  if (!validVersion(value)) {
    return failure("INVALID_VERSION", path, "draft revision must be a positive safe integer");
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

function validStoredRecordIdentity(recordInput: unknown, workspaceId: string, id?: string): recordInput is StudioLifecycleRecord {
  if (!validLifecycleRecordObject(recordInput)) return false;
  const record = recordInput;
  const createdAt = timestampValue(record.createdAt);
  const updatedAt = timestampValue(record.updatedAt);
  if (record.version !== STUDIO_LIFECYCLE_RECORD_VERSION
    || record.workspaceId !== workspaceId
    || (id !== undefined && record.id !== id)
    || !validExperienceId(record.id)
    || !validName(record.name)
    || !validVersion(record.draftRevision)
    || !validVersion(record.recordVersion)
    || record.recordVersion < record.draftRevision
    || createdAt === undefined
    || updatedAt === undefined
    || updatedAt < createdAt) return false;

  const parsedDocument = parseStudioExperienceDocument(record.document);
  if (!parsedDocument.ok
    || parsedDocument.value.id !== record.id
    || !sameData(parsedDocument.value, record.document)) return false;

  if (record.publication === null) {
    return record.publishedDraftRevision === null && record.publishedAt === null;
  }

  const publishedAt = timestampValue(record.publishedAt);
  if (!validVersion(record.publishedDraftRevision)
    || record.publishedDraftRevision > record.draftRevision
    || publishedAt === undefined
    || publishedAt < createdAt
    || publishedAt > updatedAt) return false;

  const compiledPublication = compileStudioExperience(record.publication.document);
  return compiledPublication.ok
    && compiledPublication.value.id === record.id
    && sameData(compiledPublication.value, record.publication);
}

function validStoredRevisionIdentity(
  revisionInput: unknown,
  workspaceId: string,
  id: string,
): revisionInput is StudioLifecycleRevision {
  if (!validLifecycleRevisionObject(revisionInput)) return false;
  const revision = revisionInput;
  if (revision.version !== STUDIO_LIFECYCLE_REVISION_VERSION
    || revision.workspaceId !== workspaceId
    || revision.id !== id
    || !validVersion(revision.draftRevision)
    || !validName(revision.name)
    || timestampValue(revision.recordedAt) === undefined) return false;
  const parsedDocument = parseStudioExperienceDocument(revision.document);
  return parsedDocument.ok
    && parsedDocument.value.id === id
    && sameData(parsedDocument.value, revision.document);
}

function revisionSnapshot(record: StudioLifecycleRecord, recordedAt: string): StudioLifecycleRevision {
  return snapshot({
    version: STUDIO_LIFECYCLE_REVISION_VERSION,
    workspaceId: record.workspaceId,
    id: record.id,
    draftRevision: record.draftRevision,
    name: record.name,
    document: record.document,
    recordedAt,
  });
}

function validMutationAcknowledgement(
  record: StudioLifecycleRecord,
  revision: StudioLifecycleRevision | null,
  expectedRecord: StudioLifecycleRecord,
  expectedRevision: StudioLifecycleRevision | null,
): boolean {
  if (!validStoredRecordIdentity(record, expectedRecord.workspaceId, expectedRecord.id)
    || !sameData(record, expectedRecord)) return false;
  if (expectedRevision === null) return revision === null;
  return validStoredRevisionIdentity(revision, expectedRecord.workspaceId, expectedRecord.id)
    && sameData(revision, expectedRevision);
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

async function readHistory(
  configuration: StudioLifecycleServiceConfiguration,
  current: StudioLifecycleRecord,
): Promise<StudioLifecycleResult<readonly StudioLifecycleRevision[]>> {
  try {
    const stored = await configuration.store.listRevisions(current.workspaceId, current.id);
    if (!Array.isArray(stored) || stored.length !== current.draftRevision) return storeFailure();
    const revisions = [...stored].sort((left, right) => left.draftRevision - right.draftRevision);
    let previousRecordedAt = -1;
    const createdAt = timestampValue(current.createdAt);
    const updatedAt = timestampValue(current.updatedAt);
    if (createdAt === undefined || updatedAt === undefined) return storeFailure();
    for (let index = 0; index < revisions.length; index += 1) {
      const revision = revisions[index];
      if (!revision
        || !validStoredRevisionIdentity(revision, current.workspaceId, current.id)
        || revision.draftRevision !== index + 1) return storeFailure();
      const recordedAt = timestampValue(revision.recordedAt);
      if (recordedAt === undefined
        || recordedAt < createdAt
        || recordedAt > updatedAt
        || recordedAt < previousRecordedAt) return storeFailure();
      previousRecordedAt = recordedAt;
    }
    const latest = revisions.at(-1);
    if (!latest
      || latest.draftRevision !== current.draftRevision
      || latest.name !== current.name
      || !sameData(latest.document, current.document)) return storeFailure();
    return { ok: true, value: snapshot(revisions) };
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

function validateDiffInput(input: StudioLifecycleDiffInput): StudioLifecycleResult<true> {
  const identity = validateIdentity(input.workspaceId, input.id);
  if (!identity.ok) return identity;
  const from = validateDraftRevision(input.fromDraftRevision, "$.fromDraftRevision");
  if (!from.ok) return from;
  const to = validateDraftRevision(input.toDraftRevision, "$.toDraftRevision");
  if (!to.ok) return to;
  return { ok: true, value: true };
}

function validateRestoreInput(input: StudioLifecycleRestoreInput): StudioLifecycleResult<number> {
  const version = validateVersionedInput(input);
  if (!version.ok) return version;
  const draftRevision = validateDraftRevision(input.draftRevision, "$.draftRevision");
  if (!draftRevision.ok) return draftRevision;
  return { ok: true, value: version.value };
}

function pointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function childPath(path: string, segment: string | number): string {
  return `${path}/${pointerSegment(String(segment))}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function collectDiff(
  before: unknown,
  after: unknown,
  path: string,
  changes: StudioLifecycleDiffChange[],
): void {
  if (sameData(before, after)) return;
  if (Array.isArray(before) && Array.isArray(after)) {
    const count = Math.max(before.length, after.length);
    for (let index = 0; index < count; index += 1) {
      const nextPath = childPath(path, index);
      if (index >= before.length) {
        changes.push({ path: nextPath, kind: "ADDED", after: snapshot(after[index]) });
      } else if (index >= after.length) {
        changes.push({ path: nextPath, kind: "REMOVED", before: snapshot(before[index]) });
      } else {
        collectDiff(before[index], after[index], nextPath, changes);
      }
    }
    return;
  }
  if (isObject(before) && isObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      const hasBefore = Object.prototype.hasOwnProperty.call(before, key);
      const hasAfter = Object.prototype.hasOwnProperty.call(after, key);
      const nextPath = childPath(path, key);
      if (!hasBefore) {
        changes.push({ path: nextPath, kind: "ADDED", after: snapshot(after[key]) });
      } else if (!hasAfter) {
        changes.push({ path: nextPath, kind: "REMOVED", before: snapshot(before[key]) });
      } else {
        collectDiff(before[key], after[key], nextPath, changes);
      }
    }
    return;
  }
  changes.push({ path: path || "/", kind: "CHANGED", before: snapshot(before), after: snapshot(after) });
}

function revisionDiff(
  from: StudioLifecycleRevision,
  to: StudioLifecycleRevision,
): StudioLifecycleRevisionDiff {
  const changes: StudioLifecycleDiffChange[] = [];
  collectDiff(
    { name: from.name, document: from.document },
    { name: to.name, document: to.document },
    "",
    changes,
  );
  changes.sort((left, right) => left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind));
  return snapshot({
    workspaceId: from.workspaceId,
    id: from.id,
    fromDraftRevision: from.draftRevision,
    toDraftRevision: to.draftRevision,
    changes,
  });
}

export function createStudioLifecycleService(configuration: StudioLifecycleServiceConfiguration): StudioLifecycleService {
  const service: StudioLifecycleService = {
    async list(workspaceId) {
      const identity = validateIdentity(workspaceId);
      if (!identity.ok) return identity;
      try {
        const records = await configuration.store.list(workspaceId);
        if (!Array.isArray(records)) return storeFailure();
        const seenIds = new Set<string>();
        for (const record of records) {
          if (!validStoredRecordIdentity(record, workspaceId) || seenIds.has(record.id)) return storeFailure();
          seenIds.add(record.id);
        }
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

    async history(workspaceId, id) {
      const identity = validateIdentity(workspaceId, id);
      if (!identity.ok) return identity;
      const current = await readCurrent(configuration, workspaceId, id);
      if (!current.ok) return current;
      return readHistory(configuration, current.value);
    },

    async diff(input) {
      const valid = validateDiffInput(input);
      if (!valid.ok) return valid;
      const current = await readCurrent(configuration, input.workspaceId, input.id);
      if (!current.ok) return current;
      if (input.fromDraftRevision > current.value.draftRevision) {
        return failure("NOT_FOUND", "$.fromDraftRevision", "from draft revision was not found");
      }
      if (input.toDraftRevision > current.value.draftRevision) {
        return failure("NOT_FOUND", "$.toDraftRevision", "to draft revision was not found");
      }
      const history = await readHistory(configuration, current.value);
      if (!history.ok) return history;
      const from = history.value[input.fromDraftRevision - 1];
      const to = history.value[input.toDraftRevision - 1];
      if (!from || !to) return storeFailure();
      return { ok: true, value: revisionDiff(from, to) };
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
      const revision = revisionSnapshot(record, now.value);
      try {
        const stored = await configuration.store.create(record, revision);
        if (!stored.ok) return mutationFailure(stored.code);
        if (!validMutationAcknowledgement(stored.value, stored.revision, record, revision)) return storeFailure();
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
      const revision = revisionSnapshot(next, now.value);
      try {
        const stored = await configuration.store.replace(next, version.value, revision);
        if (!stored.ok) return mutationFailure(stored.code);
        if (!validMutationAcknowledgement(stored.value, stored.revision, next, revision)) return storeFailure();
        return { ok: true, value: snapshot(stored.value) };
      } catch {
        return storeFailure();
      }
    },

    async restore(input) {
      const version = validateRestoreInput(input);
      if (!version.ok) return version;
      const current = await readCurrent(configuration, input.workspaceId, input.id);
      if (!current.ok) return current;
      if (current.value.recordVersion !== version.value) {
        return failure("CONFLICT", "$.expectedRecordVersion", "Studio experience changed since it was loaded");
      }
      if (input.draftRevision > current.value.draftRevision) {
        return failure("NOT_FOUND", "$.draftRevision", "draft revision was not found");
      }
      const history = await readHistory(configuration, current.value);
      if (!history.ok) return history;
      const target = history.value[input.draftRevision - 1];
      if (!target) return storeFailure();
      const nextRecordVersion = incrementVersion(current.value.recordVersion, "$.recordVersion");
      if (!nextRecordVersion.ok) return nextRecordVersion;
      const nextDraftRevision = incrementVersion(current.value.draftRevision, "$.draftRevision");
      if (!nextDraftRevision.ok) return nextDraftRevision;
      const now = timestamp(configuration);
      if (!now.ok) return now;
      const next: StudioLifecycleRecord = snapshot({
        ...current.value,
        name: target.name,
        document: target.document,
        draftRevision: nextDraftRevision.value,
        recordVersion: nextRecordVersion.value,
        updatedAt: now.value,
      });
      const revision = revisionSnapshot(next, now.value);
      try {
        const stored = await configuration.store.replace(next, version.value, revision);
        if (!stored.ok) return mutationFailure(stored.code);
        if (!validMutationAcknowledgement(stored.value, stored.revision, next, revision)) return storeFailure();
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
        const stored = await configuration.store.replace(next, version.value, null);
        if (!stored.ok) return mutationFailure(stored.code);
        if (!validMutationAcknowledgement(stored.value, stored.revision, next, null)) return storeFailure();
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
        const stored = await configuration.store.replace(next, version.value, null);
        if (!stored.ok) return mutationFailure(stored.code);
        if (!validMutationAcknowledgement(stored.value, stored.revision, next, null)) return storeFailure();
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
