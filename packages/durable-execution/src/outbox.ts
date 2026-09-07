import type { ViraEnterpriseScope } from "@vira-enterprise-genui/enterprise-context";
import { parseJsonValue, type JsonObject, type JsonValue } from "@vira-enterprise-genui/protocol";
import { VIRA_DURABLE_EXECUTION_VERSION, type ViraDurableExecutionRecord } from "./index.js";

export const VIRA_DURABLE_EXECUTION_OUTBOX_VERSION = "1" as const;
export const VIRA_DURABLE_EXECUTION_OUTBOX_TYPES = Object.freeze([
  "execution.queued",
  "execution.claimed",
  "execution.dispatch-started",
  "execution.state-changed",
] as const);

export type ViraDurableExecutionOutboxType = (typeof VIRA_DURABLE_EXECUTION_OUTBOX_TYPES)[number];

export interface ViraDurableExecutionOutboxEvent {
  readonly version: typeof VIRA_DURABLE_EXECUTION_OUTBOX_VERSION;
  readonly eventId: string;
  readonly scope: ViraEnterpriseScope;
  readonly executionId: string;
  readonly executionRevision: number;
  readonly transactionId: string;
  readonly planDigest: string;
  readonly planRevision: number;
  readonly operationId: string;
  readonly type: ViraDurableExecutionOutboxType;
  readonly occurredAtEpochMs: number;
  readonly payload: JsonObject;
}

export interface ViraCreateDurableExecutionOutboxEventInput {
  readonly eventId: string;
  readonly record: ViraDurableExecutionRecord;
  readonly type: ViraDurableExecutionOutboxType;
  readonly occurredAtEpochMs: number;
  readonly payload: JsonObject;
}

export interface ViraDurableExecutionOutboxConsumer {
  readonly accept: (event: ViraDurableExecutionOutboxEvent) => Promise<"accepted" | "duplicate"> | "accepted" | "duplicate";
}

export type ViraDurableExecutionOutboxResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: "INVALID_INPUT" | "CONSUMER_FAILED" | "INVALID_CONSUMER_RESULT" };

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;

function safeToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

function safePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function freezeJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const entry of value) freezeJson(entry);
    return Object.freeze(value) as T;
  }
  for (const entry of Object.values(value)) freezeJson(entry);
  return Object.freeze(value) as T;
}

function snapshotPayload(payload: JsonObject): JsonObject | undefined {
  const parsed = parseJsonValue(payload, "$.payload");
  if (!parsed.ok || !isJsonObject(parsed.value)) return undefined;
  return freezeJson(parsed.value);
}

export function createViraDurableExecutionOutboxEvent(
  input: ViraCreateDurableExecutionOutboxEventInput,
): ViraDurableExecutionOutboxResult<ViraDurableExecutionOutboxEvent> {
  if (
    input === null
    || typeof input !== "object"
    || !safeToken(input.eventId)
    || input.record === null
    || typeof input.record !== "object"
    || input.record.version !== VIRA_DURABLE_EXECUTION_VERSION
    || !safeToken(input.record.executionId)
    || !safePositive(input.record.revision)
    || !safeToken(input.record.transactionId)
    || !SHA256_HEX.test(input.record.planDigest)
    || !safePositive(input.record.planRevision)
    || !safeToken(input.record.operationId)
    || !VIRA_DURABLE_EXECUTION_OUTBOX_TYPES.includes(input.type)
    || !safePositive(input.occurredAtEpochMs)
  ) return { ok: false, code: "INVALID_INPUT" };

  const payload = snapshotPayload(input.payload);
  if (!payload) return { ok: false, code: "INVALID_INPUT" };

  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_DURABLE_EXECUTION_OUTBOX_VERSION,
      eventId: input.eventId,
      scope: Object.freeze({
        version: input.record.scope.version,
        organizationId: input.record.scope.organizationId,
        projectId: input.record.scope.projectId,
        environment: input.record.scope.environment,
      }),
      executionId: input.record.executionId,
      executionRevision: input.record.revision,
      transactionId: input.record.transactionId,
      planDigest: input.record.planDigest,
      planRevision: input.record.planRevision,
      operationId: input.record.operationId,
      type: input.type,
      occurredAtEpochMs: input.occurredAtEpochMs,
      payload,
    }),
  };
}

export async function deliverViraDurableExecutionOutboxEvent(
  event: ViraDurableExecutionOutboxEvent,
  consumer: ViraDurableExecutionOutboxConsumer,
): Promise<ViraDurableExecutionOutboxResult<"accepted" | "duplicate">> {
  if (
    event === null
    || typeof event !== "object"
    || event.version !== VIRA_DURABLE_EXECUTION_OUTBOX_VERSION
    || !safeToken(event.eventId)
    || consumer === null
    || typeof consumer !== "object"
    || typeof consumer.accept !== "function"
  ) return { ok: false, code: "INVALID_INPUT" };

  let result: unknown;
  try {
    result = await consumer.accept(event);
  } catch {
    return { ok: false, code: "CONSUMER_FAILED" };
  }
  if (result !== "accepted" && result !== "duplicate") {
    return { ok: false, code: "INVALID_CONSUMER_RESULT" };
  }
  return { ok: true, value: result };
}
