import { createHash } from "node:crypto";
import {
  parseViraArtifactMetadata,
  parseViraArtifactRevisionReference,
  type ViraArtifactMetadata,
  type ViraArtifactRevisionReference,
} from "../../packages/artifact-contract/src/index.js";
import {
  VIRA_ENTERPRISE_CONTEXT_VERSION,
  createViraEnterpriseContext,
  type ViraEnterpriseScope,
} from "../../packages/enterprise-context/src/index.js";

export const VIRA_PRIVATE_OBJECT_STORE_VERSION = "1" as const;

export interface ViraPrivateObjectStoreDriverRecord {
  readonly digest: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly body: Uint8Array;
}

export type ViraPrivateObjectStoreDriverPutResult =
  | { readonly status: "stored" }
  | { readonly status: "exists"; readonly value: ViraPrivateObjectStoreDriverRecord };

export interface ViraPrivateObjectStoreDriver {
  readonly putIfAbsent: (
    key: string,
    value: ViraPrivateObjectStoreDriverRecord,
  ) => Promise<ViraPrivateObjectStoreDriverPutResult> | ViraPrivateObjectStoreDriverPutResult;
  readonly get: (
    key: string,
  ) => Promise<ViraPrivateObjectStoreDriverRecord | null> | ViraPrivateObjectStoreDriverRecord | null;
}

export type ViraPrivateObjectStoreIssueCode =
  | "INVALID_STORE"
  | "INVALID_ARTIFACT"
  | "INVALID_SCOPE"
  | "INVALID_REFERENCE"
  | "INVALID_BYTES"
  | "DIGEST_MISMATCH"
  | "ARTIFACT_CONFLICT"
  | "ARTIFACT_NOT_FOUND"
  | "INTEGRITY_FAILED"
  | "DRIVER_FAILED";

export interface ViraPrivateObjectStoreIssue {
  readonly code: ViraPrivateObjectStoreIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraPrivateObjectStoreResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: ViraPrivateObjectStoreIssue };

export interface ViraPrivateObjectWriteReceipt {
  readonly version: typeof VIRA_PRIVATE_OBJECT_STORE_VERSION;
  readonly artifact: ViraArtifactRevisionReference;
  readonly objectRef: string;
  readonly stored: boolean;
}

export interface ViraPrivateObjectReadResult {
  readonly version: typeof VIRA_PRIVATE_OBJECT_STORE_VERSION;
  readonly artifact: ViraArtifactRevisionReference;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface ViraPrivateObjectStore {
  readonly version: typeof VIRA_PRIVATE_OBJECT_STORE_VERSION;
  readonly put: (input: {
    readonly artifact: unknown;
    readonly bytes: Uint8Array;
  }) => Promise<ViraPrivateObjectStoreResult<ViraPrivateObjectWriteReceipt>>;
  readonly get: (input: {
    readonly scope: unknown;
    readonly artifact: unknown;
  }) => Promise<ViraPrivateObjectStoreResult<ViraPrivateObjectReadResult>>;
}

function fail<T>(
  code: ViraPrivateObjectStoreIssueCode,
  path: string,
  message: string,
): ViraPrivateObjectStoreResult<T> {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalScope(input: unknown): ViraEnterpriseScope | undefined {
  if (!record(input)) return undefined;
  const keys = Object.keys(input);
  if (
    keys.length !== 4
    || !["version", "organizationId", "projectId", "environment"].every((key) => Object.hasOwn(input, key))
    || input.version !== VIRA_ENTERPRISE_CONTEXT_VERSION
    || typeof input.organizationId !== "string"
    || typeof input.projectId !== "string"
    || typeof input.environment !== "string"
  ) return undefined;
  const context = createViraEnterpriseContext({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environments: [input.environment],
  });
  if (!context.ok) return undefined;
  const scope = context.value.scope(input.environment as ViraEnterpriseScope["environment"]);
  if (!scope.ok) return undefined;
  if (
    scope.value.version !== input.version
    || scope.value.organizationId !== input.organizationId
    || scope.value.projectId !== input.projectId
    || scope.value.environment !== input.environment
  ) return undefined;
  return scope.value;
}

function key(scope: ViraEnterpriseScope, artifactId: string, revision: number): string {
  return [
    "vira-artifacts",
    scope.organizationId,
    scope.projectId,
    scope.environment,
    artifactId,
    String(revision),
  ].join("/");
}

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function clone(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function reference(artifact: ViraArtifactMetadata): ViraArtifactRevisionReference {
  return Object.freeze({ id: artifact.id, revision: artifact.revision, digest: artifact.digest });
}

function sameStoredRecord(
  left: ViraPrivateObjectStoreDriverRecord,
  artifact: ViraArtifactMetadata,
): boolean {
  return left.digest === artifact.digest
    && left.mediaType === artifact.mediaType
    && left.byteLength === artifact.byteLength;
}

export function createViraPrivateObjectStore(
  driver: ViraPrivateObjectStoreDriver,
): ViraPrivateObjectStoreResult<ViraPrivateObjectStore> {
  if (
    driver === null
    || typeof driver !== "object"
    || typeof driver.putIfAbsent !== "function"
    || typeof driver.get !== "function"
  ) {
    return fail("INVALID_STORE", "$.driver", "private object-store driver is invalid");
  }

  const store: ViraPrivateObjectStore = {
    version: VIRA_PRIVATE_OBJECT_STORE_VERSION,
    async put(input) {
      const parsed = parseViraArtifactMetadata(input.artifact);
      if (!parsed.ok) {
        return fail("INVALID_ARTIFACT", "$.artifact", `artifact metadata rejected: ${parsed.issue.code}`);
      }
      const artifact = parsed.value;
      if (!(input.bytes instanceof Uint8Array)) {
        return fail("INVALID_BYTES", "$.bytes", "artifact bytes must be Uint8Array");
      }
      if (input.bytes.byteLength !== artifact.byteLength) {
        return fail("INVALID_BYTES", "$.bytes", "artifact byteLength does not match metadata");
      }
      if (digest(input.bytes) !== artifact.digest) {
        return fail("DIGEST_MISMATCH", "$.bytes", "artifact bytes do not match immutable metadata digest");
      }
      const objectKey = key(artifact.scope, artifact.id, artifact.revision);
      const value: ViraPrivateObjectStoreDriverRecord = Object.freeze({
        digest: artifact.digest,
        mediaType: artifact.mediaType,
        byteLength: artifact.byteLength,
        body: clone(input.bytes),
      });
      let result: ViraPrivateObjectStoreDriverPutResult;
      try {
        result = await driver.putIfAbsent(objectKey, value);
      } catch {
        return fail("DRIVER_FAILED", "$.driver", "private object-store write failed closed");
      }
      if (result.status === "exists") {
        if (!sameStoredRecord(result.value, artifact) || digest(result.value.body) !== artifact.digest) {
          return fail("ARTIFACT_CONFLICT", "$.artifact", "artifact revision is already bound to different or corrupt bytes");
        }
      }
      return {
        ok: true,
        value: Object.freeze({
          version: VIRA_PRIVATE_OBJECT_STORE_VERSION,
          artifact: reference(artifact),
          objectRef: objectKey,
          stored: result.status === "stored",
        }),
      };
    },
    async get(input) {
      const scope = canonicalScope(input.scope);
      if (!scope) return fail("INVALID_SCOPE", "$.scope", "private object read scope is invalid");
      const parsedArtifact = parseViraArtifactRevisionReference(input.artifact);
      if (!parsedArtifact.ok) {
        return fail("INVALID_REFERENCE", "$.artifact", "artifact reference must pin id, revision and digest");
      }
      const artifact = parsedArtifact.value;
      let value: ViraPrivateObjectStoreDriverRecord | null;
      try {
        value = await driver.get(key(scope, artifact.id, artifact.revision));
      } catch {
        return fail("DRIVER_FAILED", "$.driver", "private object-store read failed closed");
      }
      if (value === null || value.digest !== artifact.digest) {
        return fail("ARTIFACT_NOT_FOUND", "$.artifact", "artifact object is not available in the exact scope/revision");
      }
      if (value.byteLength !== value.body.byteLength || digest(value.body) !== value.digest) {
        return fail("INTEGRITY_FAILED", "$.artifact", "stored artifact bytes failed integrity verification");
      }
      return {
        ok: true,
        value: Object.freeze({
          version: VIRA_PRIVATE_OBJECT_STORE_VERSION,
          artifact,
          mediaType: value.mediaType,
          bytes: clone(value.body),
        }),
      };
    },
  };

  return { ok: true, value: Object.freeze(store) };
}
