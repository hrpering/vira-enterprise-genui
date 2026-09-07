import type { ViraActionVerificationExpectation } from "../../../packages/action-verification/src/index.js";
import type { ViraDurableActionVerificationRecord } from "../../../packages/action-verification/src/durable.js";
import type { ViraDurableExecutionAuthoritySnapshot } from "../../../packages/durable-execution/src/authority.js";
import type { ViraEnterpriseScope } from "../../../packages/enterprise-context/src/index.js";
import type { ViraPrivateObservationAuthority } from "../../../packages/private-runner/src/observation.js";
import { parseJsonValue, type JsonObject, type JsonValue } from "../../../packages/protocol/src/index.js";

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createViraVerificationObservationAuthority(input: {
  readonly authority: ViraDurableExecutionAuthoritySnapshot;
  readonly record: ViraDurableActionVerificationRecord;
  readonly expectation: ViraActionVerificationExpectation;
}): ViraPrivateObservationAuthority {
  const { authority, record, expectation } = input;
  const operation = authority.frozen.plan.operations.find((candidate) => candidate.operationId === record.operationId);
  if (
    operation === undefined
    || authority.executionId !== record.executionId
    || authority.transactionId !== record.transactionId
    || authority.planDigest !== record.planDigest
    || authority.planRevision !== record.planRevision
    || authority.operationId !== record.operationId
    || !exactScope(authority.scope, record.scope)
    || !exactScope(expectation.scope, record.scope)
    || expectation.transactionId !== record.transactionId
    || expectation.planDigest !== record.planDigest
    || expectation.planRevision !== record.planRevision
    || expectation.operationId !== record.operationId
    || expectation.executionId !== record.executionId
    || expectation.providerId !== record.providerId
    || expectation.connectionId !== record.connectionId
    || expectation.resourceType !== record.resourceType
    || expectation.resourceId !== record.resourceId
    || operation.providerId !== record.providerId
    || operation.connectionId !== record.connectionId
    || operation.resourceType !== record.resourceType
    || operation.resourceId !== record.resourceId
  ) throw new TypeError("verification observation authority does not bind the exact frozen execution");

  const parsedIntent = parseJsonValue(operation.actionIntent, "$.frozen.operation.actionIntent");
  if (!parsedIntent.ok || !isObject(parsedIntent.value)) {
    throw new TypeError("verification observation authority action intent is invalid");
  }
  const expiresAtEpochMs = record.createdAtEpochMs + expectation.maxVerificationWindowMs;
  if (!Number.isSafeInteger(expiresAtEpochMs) || expiresAtEpochMs <= record.createdAtEpochMs) {
    throw new TypeError("verification observation authority window is invalid");
  }

  return Object.freeze({
    version: "1",
    authorityId: record.verificationId,
    scope: record.scope,
    providerId: record.providerId,
    connectionId: record.connectionId,
    actionIntent: parsedIntent.value,
    secretRef: operation.secretRef,
    expiresAtEpochMs,
  });
}
