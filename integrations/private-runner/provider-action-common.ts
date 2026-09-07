import { createHash } from "node:crypto";
import { parseJsonValue, type JsonObject, type JsonValue } from "../../packages/protocol/src/index.js";
import type { ViraEnterpriseScope } from "../../packages/enterprise-context/src/index.js";

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;

export function isProviderJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseExactProviderIntent(
  input: unknown,
  expectedFields: ReadonlySet<string>,
): JsonObject {
  const parsed = parseJsonValue(input, "$.actionIntent");
  if (!parsed.ok || !isProviderJsonObject(parsed.value)) {
    throw new TypeError("provider action intent must be canonical JSON object");
  }
  const keys = Object.keys(parsed.value);
  if (keys.length !== expectedFields.size || keys.some((key) => !expectedFields.has(key))) {
    throw new TypeError("provider action intent has an invalid exact shape");
  }
  return parsed.value;
}

export function safeProviderToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

export function safeProviderText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= maxLength && value.trim() === value;
}

export function safeProviderNow(now: () => number): number {
  const value = now();
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError("provider observation clock is invalid");
  }
  return value;
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (!isProviderJsonObject(value)) throw new TypeError("provider canonical JSON value is invalid");
  const entries = Object.entries(value)
    .sort(([left], [right]) => left === right ? 0 : left < right ? -1 : 1)
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
  return `{${entries.join(",")}}`;
}

export function providerJsonDigest(value: JsonObject): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function providerResourceId(prefix: string, coordinates: readonly string[]): string {
  const digest = createHash("sha256").update(coordinates.join("\u0000")).digest("hex");
  return `${prefix}:${digest}`;
}

export function observationEnvelope(input: {
  readonly scope: ViraEnterpriseScope;
  readonly connectionId: string;
  readonly providerId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly observedAtEpochMs: number;
  readonly versionKind: "etag" | "blob-sha" | "version" | "opaque";
  readonly versionValue: string;
  readonly data: JsonObject;
}): JsonObject {
  return {
    version: "1",
    scope: {
      version: input.scope.version,
      organizationId: input.scope.organizationId,
      projectId: input.scope.projectId,
      environment: input.scope.environment,
    },
    providerId: input.providerId,
    connectionId: input.connectionId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    observedAtEpochMs: input.observedAtEpochMs,
    providerVersion: { kind: input.versionKind, value: input.versionValue },
    canonicalDigest: providerJsonDigest(input.data),
    data: input.data,
  };
}

export function privateObservationResult(observation: JsonObject): JsonObject {
  return { observation };
}
