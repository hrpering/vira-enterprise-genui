import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  parseViraArtifactMetadata,
  type ViraArtifactMetadata,
  type ViraArtifactRevisionReference,
} from "../../packages/artifact-contract/src/index.js";
import {
  VIRA_ENTERPRISE_CONTEXT_VERSION,
  createViraEnterpriseContext,
  type ViraEnterpriseContext,
  type ViraEnterpriseScope,
  type ViraSecretRef,
} from "../../packages/enterprise-context/src/index.js";
import { VIRA_TRIGGER_PAYLOAD_MAX_BYTES } from "../../packages/application-runtime/src/index.js";
import type { ViraPrivateObjectStore } from "../object-store/index.js";

export const VIRA_SIGNED_WEBHOOK_VERSION = "1" as const;
export const VIRA_SIGNED_WEBHOOK_SECRET_MAX_BYTES = 4096 as const;

export interface ViraWebhookSecretResolver {
  readonly resolve: (input: {
    readonly scope: ViraEnterpriseScope;
    readonly secretRef: ViraSecretRef;
  }) => Promise<unknown> | unknown;
}

export interface ViraSignedWebhookReceiverConfiguration {
  readonly secretResolver: ViraWebhookSecretResolver;
  readonly objectStore: ViraPrivateObjectStore;
  readonly nowUnixMs: () => number;
}

export interface ViraSignedWebhookReceiveInput {
  readonly scope: unknown;
  readonly sourceRef: string;
  readonly secretRef: unknown;
  readonly signature: string;
  readonly body: Uint8Array;
  readonly payloadArtifact: unknown;
}

export interface ViraSignedWebhookReceipt {
  readonly version: typeof VIRA_SIGNED_WEBHOOK_VERSION;
  readonly sourceRef: string;
  readonly artifact: ViraArtifactRevisionReference;
  readonly objectRef: string;
  readonly stored: boolean;
  readonly receivedAtUnixMs: number;
  readonly payloadArtifact: ViraArtifactMetadata;
}

export type ViraSignedWebhookIssueCode =
  | "INVALID_SERVICE"
  | "INVALID_INPUT"
  | "INVALID_SCOPE"
  | "INVALID_SECRET_REF"
  | "SECRET_RESOLUTION_FAILED"
  | "INVALID_SIGNATURE"
  | "INVALID_PAYLOAD"
  | "STORE_FAILURE";

export interface ViraSignedWebhookIssue {
  readonly code: ViraSignedWebhookIssueCode;
  readonly path: string;
  readonly message: string;
  readonly sourceCode?: string;
}

export type ViraSignedWebhookResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: ViraSignedWebhookIssue };

export interface ViraSignedWebhookReceiver {
  readonly version: typeof VIRA_SIGNED_WEBHOOK_VERSION;
  readonly receive: (input: ViraSignedWebhookReceiveInput) => Promise<ViraSignedWebhookResult<ViraSignedWebhookReceipt>>;
}

const SIGNATURE = /^sha256=([0-9a-f]{64})$/;

type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: ViraSignedWebhookIssue };

function fail<T>(
  code: ViraSignedWebhookIssueCode,
  path: string,
  message: string,
  sourceCode?: string,
): ViraSignedWebhookResult<T> {
  return {
    ok: false,
    issue: Object.freeze({ code, path, message, ...(sourceCode === undefined ? {} : { sourceCode }) }),
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const allowed = new Set(fields);
  return Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field))
    && Object.keys(value).every((field) => allowed.has(field));
}

function safeNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function parseScope(input: unknown): Parsed<{
  readonly scope: ViraEnterpriseScope;
  readonly context: ViraEnterpriseContext;
}> {
  if (!record(input) || !exactKeys(input, ["version", "organizationId", "projectId", "environment"])) {
    return fail("INVALID_SCOPE", "$.scope", "signed webhook scope must be an exact enterprise scope");
  }
  if (
    input.version !== VIRA_ENTERPRISE_CONTEXT_VERSION
    || typeof input.organizationId !== "string"
    || typeof input.projectId !== "string"
    || typeof input.environment !== "string"
  ) return fail("INVALID_SCOPE", "$.scope", "signed webhook scope is invalid");
  const context = createViraEnterpriseContext({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environments: [input.environment],
  });
  if (!context.ok) return fail("INVALID_SCOPE", "$.scope", "signed webhook scope is not canonical");
  const scope = context.value.scope(input.environment as ViraEnterpriseScope["environment"]);
  if (!scope.ok) return fail("INVALID_SCOPE", "$.scope", "signed webhook scope is not registered");
  return { ok: true, value: Object.freeze({ scope: scope.value, context: context.value }) };
}

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function artifactRef(artifact: ViraArtifactMetadata): ViraArtifactRevisionReference {
  return Object.freeze({ id: artifact.id, revision: artifact.revision, digest: artifact.digest });
}

export function createViraSignedWebhookReceiver(
  config: ViraSignedWebhookReceiverConfiguration,
): ViraSignedWebhookResult<ViraSignedWebhookReceiver> {
  if (
    config === null
    || typeof config !== "object"
    || config.secretResolver === null
    || typeof config.secretResolver !== "object"
    || typeof config.secretResolver.resolve !== "function"
    || config.objectStore === null
    || typeof config.objectStore !== "object"
    || typeof config.objectStore.put !== "function"
    || typeof config.nowUnixMs !== "function"
  ) return fail("INVALID_SERVICE", "$", "signed webhook receiver requires a transient secret resolver, private object-store and clock");

  const resolver = config.secretResolver;
  const objectStore = config.objectStore;
  const nowUnixMs = config.nowUnixMs;

  const receiver: ViraSignedWebhookReceiver = Object.freeze({
    version: VIRA_SIGNED_WEBHOOK_VERSION,
    async receive(input: ViraSignedWebhookReceiveInput): Promise<ViraSignedWebhookResult<ViraSignedWebhookReceipt>> {
      if (!record(input) || !exactKeys(input, ["scope", "sourceRef", "secretRef", "signature", "body", "payloadArtifact"])) {
        return fail("INVALID_INPUT", "$", "signed webhook receive input must be an exact object");
      }
      if (
        typeof input.sourceRef !== "string"
        || input.sourceRef.length < 1
        || input.sourceRef.length > 511
        || typeof input.signature !== "string"
        || !(input.body instanceof Uint8Array)
      ) return fail("INVALID_INPUT", "$", "signed webhook source, signature or body type is invalid");

      const sourceRef = input.sourceRef;
      const signatureValue = input.signature;
      const body = new Uint8Array(input.body);
      if (body.byteLength > VIRA_TRIGGER_PAYLOAD_MAX_BYTES) {
        return fail("INVALID_PAYLOAD", "$.body", "signed webhook body exceeds the bounded trigger payload size");
      }
      let now: number;
      try { now = nowUnixMs(); } catch { return fail("INVALID_SERVICE", "$.clock", "signed webhook clock failed closed"); }
      if (!safeNonNegative(now)) return fail("INVALID_SERVICE", "$.clock", "signed webhook clock must return a non-negative safe integer");

      const scoped = parseScope(input.scope);
      if (!scoped.ok) return scoped;
      const secret = scoped.value.context.secretRef(input.secretRef);
      if (!secret.ok || secret.value.environment !== scoped.value.scope.environment) {
        return fail("INVALID_SECRET_REF", "$.secretRef", "signed webhook SecretRef is invalid or outside the exact execution scope");
      }
      const signature = SIGNATURE.exec(signatureValue);
      if (signature === null) return fail("INVALID_SIGNATURE", "$.signature", "signed webhook signature must be exact lowercase sha256 hex");

      const artifact = parseViraArtifactMetadata(input.payloadArtifact);
      if (!artifact.ok || !exactScope(artifact.value.scope, scoped.value.scope)) {
        return fail("INVALID_PAYLOAD", "$.payloadArtifact", "signed webhook payload artifact metadata is invalid or cross-scope");
      }
      if (
        artifact.value.byteLength !== body.byteLength
        || artifact.value.digest !== digest(body)
        || artifact.value.producer.kind !== "provider"
        || artifact.value.producer.id !== sourceRef
        || artifact.value.source.kind !== "provider"
        || artifact.value.source.reference !== sourceRef
      ) {
        return fail("INVALID_PAYLOAD", "$.payloadArtifact", "signed webhook payload artifact does not exactly describe the provider body snapshot");
      }

      let resolved: unknown;
      try {
        resolved = await resolver.resolve({ scope: scoped.value.scope, secretRef: secret.value });
      } catch {
        return fail("SECRET_RESOLUTION_FAILED", "$.secretRef", "signed webhook secret resolution failed closed");
      }
      if (
        !(resolved instanceof Uint8Array)
        || resolved.byteLength < 1
        || resolved.byteLength > VIRA_SIGNED_WEBHOOK_SECRET_MAX_BYTES
      ) return fail("SECRET_RESOLUTION_FAILED", "$.secretRef", "signed webhook secret resolver returned invalid key material");

      const key = new Uint8Array(resolved);
      const verified = (() => {
        try {
          const expected = createHmac("sha256", key).update(body).digest();
          const provided = Buffer.from(signature[1]!, "hex");
          return provided.byteLength === expected.byteLength && timingSafeEqual(provided, expected);
        } finally {
          key.fill(0);
        }
      })();
      if (!verified) return fail("INVALID_SIGNATURE", "$.signature", "signed webhook signature verification failed");

      let stored;
      try {
        stored = await objectStore.put({ artifact: artifact.value, bytes: body });
      } catch {
        return fail("STORE_FAILURE", "$.objectStore", "signed webhook private payload persistence failed closed");
      }
      if (!stored.ok) {
        return fail("STORE_FAILURE", "$.objectStore", "signed webhook private payload persistence was rejected", stored.issue.code);
      }

      return {
        ok: true,
        value: Object.freeze({
          version: VIRA_SIGNED_WEBHOOK_VERSION,
          sourceRef,
          artifact: artifactRef(artifact.value),
          objectRef: stored.value.objectRef,
          stored: stored.value.stored,
          receivedAtUnixMs: now,
          payloadArtifact: artifact.value,
        }),
      };
    },
  });

  return { ok: true, value: receiver };
}
