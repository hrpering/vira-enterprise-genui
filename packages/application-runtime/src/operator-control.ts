import { createViraApplicationRunService } from "./service.js";
import type {
  ViraApplicationRun,
  ViraApplicationRunIssueCode,
  ViraApplicationRunStore,
  ViraApplicationRunStoreMutationResult,
} from "./types.js";

export const VIRA_APPLICATION_RUN_OPERATOR_CONTROL_VERSION = "1" as const;
export const VIRA_APPLICATION_RUN_OPERATOR_CONTROL_OPERATIONS = Object.freeze(["pause", "resume"] as const);

export type ViraApplicationRunOperatorControlOperation =
  (typeof VIRA_APPLICATION_RUN_OPERATOR_CONTROL_OPERATIONS)[number];

export interface ViraApplicationRunOperatorControlAuthorizationInput {
  readonly version: typeof VIRA_APPLICATION_RUN_OPERATOR_CONTROL_VERSION;
  readonly operation: ViraApplicationRunOperatorControlOperation;
  readonly expectedRevision: number;
  readonly run: ViraApplicationRun;
}

export type ViraApplicationRunOperatorControlAuthorizer = (
  input: ViraApplicationRunOperatorControlAuthorizationInput,
) => Promise<boolean> | boolean;

export interface ViraApplicationRunOperatorControlServiceConfiguration {
  readonly store: ViraApplicationRunStore;
  readonly nowUnixMs: () => number;
  readonly authorize: ViraApplicationRunOperatorControlAuthorizer;
}

export interface ViraApplicationRunOperatorControlInput {
  readonly scope: unknown;
  readonly id: string;
  readonly expectedRevision: number;
}

export type ViraApplicationRunOperatorControlIssueCode =
  | ViraApplicationRunIssueCode
  | "AUTHORIZATION_DENIED";

export interface ViraApplicationRunOperatorControlIssue {
  readonly code: ViraApplicationRunOperatorControlIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraApplicationRunOperatorControlResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: ViraApplicationRunOperatorControlIssue };

export interface ViraApplicationRunOperatorControlService {
  readonly version: typeof VIRA_APPLICATION_RUN_OPERATOR_CONTROL_VERSION;
  readonly pause: (
    input: ViraApplicationRunOperatorControlInput,
  ) => Promise<ViraApplicationRunOperatorControlResult<ViraApplicationRun>>;
  readonly resumePaused: (
    input: ViraApplicationRunOperatorControlInput,
  ) => Promise<ViraApplicationRunOperatorControlResult<ViraApplicationRun>>;
}

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function fail<T>(
  code: ViraApplicationRunOperatorControlIssueCode,
  path: string,
  message: string,
): ViraApplicationRunOperatorControlResult<T> {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
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

function safePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function safeNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function nextRevision(current: number): number | undefined {
  if (!Number.isSafeInteger(current) || current < 1 || current >= Number.MAX_SAFE_INTEGER) return undefined;
  return current + 1;
}

function mapMutation(
  result: ViraApplicationRunStoreMutationResult,
): ViraApplicationRunOperatorControlResult<ViraApplicationRun> {
  if (result.ok) return result;
  if (result.code === "VERSION_CONFLICT" || result.code === "ALREADY_EXISTS") {
    return fail("CONFLICT", "$", "ApplicationRun durable state changed concurrently");
  }
  return fail("NOT_FOUND", "$", "ApplicationRun does not exist");
}

export function createViraApplicationRunOperatorControlService(
  config: ViraApplicationRunOperatorControlServiceConfiguration,
): ViraApplicationRunOperatorControlResult<ViraApplicationRunOperatorControlService> {
  if (
    config === null
    || typeof config !== "object"
    || config.store === null
    || typeof config.store !== "object"
    || typeof config.store.read !== "function"
    || typeof config.store.create !== "function"
    || typeof config.store.replace !== "function"
    || typeof config.nowUnixMs !== "function"
    || typeof config.authorize !== "function"
  ) {
    return fail(
      "INVALID_SERVICE",
      "$",
      "ApplicationRun operator controls require durable store, clock and explicit authorizer",
    );
  }

  const reader = createViraApplicationRunService({ store: config.store, nowUnixMs: config.nowUnixMs });
  if (!reader.ok) return fail("INVALID_SERVICE", "$", reader.issue.message);
  const store = config.store;
  const nowUnixMs = config.nowUnixMs;
  const authorize = config.authorize;

  async function transition(
    operation: ViraApplicationRunOperatorControlOperation,
    input: ViraApplicationRunOperatorControlInput,
  ): Promise<ViraApplicationRunOperatorControlResult<ViraApplicationRun>> {
    if (
      !record(input)
      || !exactKeys(input, ["scope", "id", "expectedRevision"])
      || typeof input.id !== "string"
      || !RUN_ID.test(input.id)
      || !safePositive(input.expectedRevision)
    ) return fail("INVALID_INPUT", "$", "ApplicationRun operator control input is invalid");

    const id = input.id;
    const expectedRevision = input.expectedRevision;
    const current = await reader.value.read(input.scope, id);
    if (!current.ok) return current;

    const authorizationInput = Object.freeze({
      version: VIRA_APPLICATION_RUN_OPERATOR_CONTROL_VERSION,
      operation,
      expectedRevision,
      run: current.value,
    });
    let authorized: unknown;
    try {
      authorized = await authorize(authorizationInput);
    } catch {
      return fail("AUTHORIZATION_DENIED", "$", "ApplicationRun operator control authorization failed closed");
    }
    if (authorized !== true) {
      return fail("AUTHORIZATION_DENIED", "$", "ApplicationRun operator control was not authorized");
    }

    if (current.value.revision !== expectedRevision) {
      return fail("CONFLICT", "$.expectedRevision", "ApplicationRun revision is stale");
    }
    if (operation === "pause") {
      if (current.value.status !== "running" && current.value.status !== "waiting") {
        return fail("INVALID_STATE", "$.status", "only a running or waiting ApplicationRun can be paused");
      }
    } else if (current.value.status !== "paused") {
      return fail("INVALID_STATE", "$.status", "only a paused ApplicationRun can be operator-resumed");
    }

    const revision = nextRevision(current.value.revision);
    if (revision === undefined) {
      return fail("REVISION_OVERFLOW", "$.revision", "ApplicationRun revision cannot advance safely");
    }
    let now: number;
    try {
      now = nowUnixMs();
    } catch {
      return fail("INVALID_SERVICE", "$.clock", "ApplicationRun operator control clock failed closed");
    }
    if (!safeNonNegative(now)) {
      return fail("INVALID_SERVICE", "$.clock", "ApplicationRun operator control clock must return a non-negative safe integer");
    }

    const next: ViraApplicationRun = Object.freeze({
      ...current.value,
      revision,
      status: operation === "pause"
        ? "paused"
        : current.value.wait === null ? "running" : "waiting",
      updatedAtUnixMs: now,
    });
    let stored: ViraApplicationRunStoreMutationResult;
    try {
      stored = await store.replace(next, expectedRevision);
    } catch {
      return fail("STORE_FAILURE", "$.store", "ApplicationRun operator control commit failed closed");
    }
    return mapMutation(stored);
  }

  const service: ViraApplicationRunOperatorControlService = Object.freeze({
    version: VIRA_APPLICATION_RUN_OPERATOR_CONTROL_VERSION,
    pause: (input) => transition("pause", input),
    resumePaused: (input) => transition("resume", input),
  });
  return { ok: true, value: service };
}
