import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  createRuntimeAction,
  createRuntimePermissionPolicy,
  evaluateRuntimeActionPermission,
  type RuntimePermissionPolicy,
} from "@vira-enterprise-genui/runtime-core";
import {
  VIRA_ACTION_BOUNDARY_MAX_CATALOG,
  VIRA_ACTION_BOUNDARY_MAX_IDEMPOTENCY_KEY_LENGTH,
  VIRA_ACTION_BOUNDARY_MAX_SAFE_INTEGER,
  VIRA_ACTION_BOUNDARY_VERSION,
  type ViraActionBoundary,
  type ViraActionBoundaryCreateResult,
  type ViraActionBoundaryExecutionResult,
  type ViraActionBoundaryIssue,
  type ViraActionBoundaryIssueCode,
  type ViraActionBoundaryPreflightResult,
  type ViraActionConfirmationChallenge,
  type ViraActionConfirmationGrant,
  type ViraActionDefinition,
  type ViraActionExecutionPermit,
  type ViraActionExecutor,
  type ViraActionIntent,
  type ViraActionPreflightPermission,
  type ViraActionReceipt,
  type ViraTrustedActionAdapterResult,
} from "./types.js";

const LOCAL_RUNTIME_ACTIONS = new Set(["runtime.patch.apply", "runtime.lifecycle.transition"]);
const INPUT_FIELDS = new Set(["instanceId", "catalog", "permissionPolicy", "revisionProvider"]);
const DEFINITION_FIELDS = new Set(["actionType", "effect", "idempotency"]);
const INTENT_FIELDS = new Set(["version", "instanceId", "expectedStateRevision", "idempotencyKey", "action"]);
const CONFIRMATION_FIELDS = new Set([
  "version",
  "instanceId",
  "actionId",
  "actionType",
  "expectedStateRevision",
  "idempotencyKey",
]);
const EFFECTS = new Set(["read", "write", "irreversible"]);
const IDEMPOTENCY = new Set(["none", "action-id"]);
const OUTCOMES = new Set(["success", "empty", "error"]);
const safeKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function issue(code: ViraActionBoundaryIssueCode, path: string, message: string): ViraActionBoundaryIssue {
  return Object.freeze({ code, path, message });
}

function dataObject(
  input: unknown,
  fields: ReadonlySet<string>,
): { readonly ok: true; readonly value: Readonly<Record<string, unknown>> } | { readonly ok: false } {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return { ok: false };
  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return { ok: false };
    if (Object.getOwnPropertySymbols(input).length > 0) return { ok: false };
    const keys = Object.keys(input);
    if (keys.length !== fields.size || Object.getOwnPropertyNames(input).length !== keys.length) return { ok: false };
    if (keys.some((key) => !fields.has(key))) return { ok: false };
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !("value" in descriptor)) return { ok: false };
      output[key] = descriptor.value;
    }
    return { ok: true, value: output };
  } catch {
    return { ok: false };
  }
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactFields(value: JsonObject, expected: ReadonlySet<string>, optional: ReadonlySet<string> = new Set()): boolean {
  const keys = Object.keys(value);
  if (keys.some((key) => !expected.has(key) && !optional.has(key))) return false;
  return [...expected].every((key) => Object.hasOwn(value, key));
}

function validInstanceId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4_096;
}

function validRevision(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= VIRA_ACTION_BOUNDARY_MAX_SAFE_INTEGER;
}

function validIdempotencyKey(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= VIRA_ACTION_BOUNDARY_MAX_IDEMPOTENCY_KEY_LENGTH
    && safeKeyPattern.test(value);
}

function freezeJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeJson(item);
    return Object.freeze(value) as T;
  }
  for (const child of Object.values(value)) freezeJson(child);
  return Object.freeze(value) as T;
}

function parseCatalog(input: unknown):
  | { readonly ok: true; readonly value: ReadonlyMap<string, ViraActionDefinition> }
  | { readonly ok: false; readonly issue: ViraActionBoundaryIssue } {
  const parsed = parseJsonValue(input, "$.catalog");
  if (!parsed.ok || !Array.isArray(parsed.value)) {
    return { ok: false, issue: issue("INVALID_CATALOG", "$.catalog", "action catalog must be a canonical JSON array") };
  }
  if (parsed.value.length > VIRA_ACTION_BOUNDARY_MAX_CATALOG) {
    return { ok: false, issue: issue("INVALID_CATALOG", "$.catalog", "action catalog exceeds the maximum definition count") };
  }

  const definitions = new Map<string, ViraActionDefinition>();
  for (let index = 0; index < parsed.value.length; index += 1) {
    const candidate = parsed.value[index];
    const path = `$.catalog[${index}]`;
    if (!isJsonObject(candidate) || !exactFields(candidate, DEFINITION_FIELDS)) {
      return { ok: false, issue: issue("INVALID_CATALOG", path, "action definition shape is invalid") };
    }
    const actionType = candidate.actionType;
    const effect = candidate.effect;
    const idempotency = candidate.idempotency;
    if (typeof actionType !== "string" || !isSemanticNamespace(actionType) || LOCAL_RUNTIME_ACTIONS.has(actionType)) {
      return { ok: false, issue: issue("INVALID_CATALOG", `${path}.actionType`, "action type must be a non-local semantic namespace") };
    }
    if (typeof effect !== "string" || !EFFECTS.has(effect)) {
      return { ok: false, issue: issue("INVALID_CATALOG", `${path}.effect`, "action effect is invalid") };
    }
    if (typeof idempotency !== "string" || !IDEMPOTENCY.has(idempotency)) {
      return { ok: false, issue: issue("INVALID_CATALOG", `${path}.idempotency`, "action idempotency mode is invalid") };
    }
    if ((effect === "write" || effect === "irreversible") && idempotency !== "action-id") {
      return { ok: false, issue: issue("INVALID_CATALOG", `${path}.idempotency`, "write and irreversible actions require action-id idempotency") };
    }
    if (definitions.has(actionType)) {
      return { ok: false, issue: issue("INVALID_CATALOG", `${path}.actionType`, "action type is duplicated in the catalog") };
    }
    definitions.set(actionType, Object.freeze({
      actionType,
      effect: effect as ViraActionDefinition["effect"],
      idempotency: idempotency as ViraActionDefinition["idempotency"],
    }));
  }
  return { ok: true, value: definitions };
}

function parseIntent(input: unknown):
  | { readonly ok: true; readonly value: ViraActionIntent }
  | { readonly ok: false; readonly issue: ViraActionBoundaryIssue } {
  const parsed = parseJsonValue(input, "$.intent");
  if (!parsed.ok || !isJsonObject(parsed.value) || !exactFields(parsed.value, INTENT_FIELDS)) {
    return { ok: false, issue: issue("INVALID_INTENT", "$.intent", "ActionIntent must be canonical exact-shape JSON") };
  }
  if (
    parsed.value.version !== VIRA_ACTION_BOUNDARY_VERSION
    || !validInstanceId(parsed.value.instanceId)
    || !validRevision(parsed.value.expectedStateRevision)
    || !validIdempotencyKey(parsed.value.idempotencyKey)
  ) {
    return { ok: false, issue: issue("INVALID_INTENT", "$.intent", "ActionIntent identity, revision, or idempotency key is invalid") };
  }
  const action = createRuntimeAction(parsed.value.action);
  if (!action.ok) {
    return { ok: false, issue: issue("INVALID_INTENT", `$.intent.action${action.issue.path === "$" ? "" : action.issue.path.slice(1)}`, action.issue.message) };
  }
  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_ACTION_BOUNDARY_VERSION,
      instanceId: parsed.value.instanceId,
      expectedStateRevision: parsed.value.expectedStateRevision,
      idempotencyKey: parsed.value.idempotencyKey,
      action: action.value,
    }),
  };
}

function confirmationMatches(input: unknown, intent: ViraActionIntent): boolean {
  const parsed = parseJsonValue(input, "$.confirmation");
  if (!parsed.ok || !isJsonObject(parsed.value) || !exactFields(parsed.value, CONFIRMATION_FIELDS)) return false;
  return parsed.value.version === VIRA_ACTION_BOUNDARY_VERSION
    && parsed.value.instanceId === intent.instanceId
    && parsed.value.actionId === intent.action.id
    && parsed.value.actionType === intent.action.type
    && parsed.value.expectedStateRevision === intent.expectedStateRevision
    && parsed.value.idempotencyKey === intent.idempotencyKey;
}

function parseAdapterResult(
  input: unknown,
  intent: ViraActionIntent,
  definition: ViraActionDefinition,
):
  | { readonly ok: true; readonly value: ViraTrustedActionAdapterResult }
  | { readonly ok: false; readonly issue: ViraActionBoundaryIssue } {
  const parsed = parseJsonValue(input, "$.adapterResult");
  if (
    !parsed.ok
    || !isJsonObject(parsed.value)
    || !exactFields(parsed.value, new Set(["outcome", "stateRevision"]), new Set(["data"]))
    || typeof parsed.value.outcome !== "string"
    || !OUTCOMES.has(parsed.value.outcome)
    || !validRevision(parsed.value.stateRevision)
    || parsed.value.stateRevision < intent.expectedStateRevision
  ) {
    return { ok: false, issue: issue("INVALID_ADAPTER_RESULT", "$.adapterResult", "trusted action adapter result is invalid") };
  }
  if (
    parsed.value.outcome === "success"
    && definition.effect !== "read"
    && parsed.value.stateRevision <= intent.expectedStateRevision
  ) {
    return { ok: false, issue: issue("INVALID_ADAPTER_RESULT", "$.adapterResult.stateRevision", "successful write/irreversible action must advance state revision") };
  }
  let data: JsonObject | undefined;
  if (Object.hasOwn(parsed.value, "data")) {
    if (!isJsonObject(parsed.value.data)) {
      return { ok: false, issue: issue("INVALID_ADAPTER_RESULT", "$.adapterResult.data", "adapter result data must be a canonical JSON object") };
    }
    data = freezeJson(parsed.value.data);
  }
  return {
    ok: true,
    value: Object.freeze({
      outcome: parsed.value.outcome as ViraTrustedActionAdapterResult["outcome"],
      stateRevision: parsed.value.stateRevision,
      ...(data === undefined ? {} : { data }),
    }),
  };
}

function permit(intent: ViraActionIntent, definition: ViraActionDefinition): ViraActionExecutionPermit {
  return Object.freeze({
    version: VIRA_ACTION_BOUNDARY_VERSION,
    instanceId: intent.instanceId,
    actionId: intent.action.id,
    actionType: intent.action.type,
    effect: definition.effect,
    idempotency: definition.idempotency,
    expectedStateRevision: intent.expectedStateRevision,
    idempotencyKey: intent.idempotencyKey,
  });
}

function challenge(intent: ViraActionIntent, definition: ViraActionDefinition): ViraActionConfirmationChallenge {
  return Object.freeze({
    version: VIRA_ACTION_BOUNDARY_VERSION,
    instanceId: intent.instanceId,
    actionId: intent.action.id,
    actionType: intent.action.type,
    effect: definition.effect,
    expectedStateRevision: intent.expectedStateRevision,
    idempotencyKey: intent.idempotencyKey,
  });
}

function receipt(
  intent: ViraActionIntent,
  definition: ViraActionDefinition,
  adapterResult: ViraTrustedActionAdapterResult,
): ViraActionReceipt {
  return Object.freeze({
    version: VIRA_ACTION_BOUNDARY_VERSION,
    instanceId: intent.instanceId,
    actionId: intent.action.id,
    actionType: intent.action.type,
    effect: definition.effect,
    idempotencyKey: intent.idempotencyKey,
    expectedStateRevision: intent.expectedStateRevision,
    observedStateRevision: adapterResult.stateRevision,
    outcome: adapterResult.outcome,
    ...(adapterResult.data === undefined ? {} : { data: adapterResult.data }),
  });
}

export function createViraActionBoundary(input: unknown): ViraActionBoundaryCreateResult {
  const root = dataObject(input, INPUT_FIELDS);
  if (!root.ok) {
    return { ok: false, issue: issue("INVALID_BOUNDARY", "$", "action boundary input must be a plain own-data object with exact fields") };
  }
  if (!validInstanceId(root.value.instanceId)) {
    return { ok: false, issue: issue("INVALID_BOUNDARY", "$.instanceId", "action boundary requires an exact bounded instanceId") };
  }
  if (typeof root.value.revisionProvider !== "function") {
    return { ok: false, issue: issue("INVALID_BOUNDARY", "$.revisionProvider", "action boundary requires a trusted revision provider") };
  }

  const catalog = parseCatalog(root.value.catalog);
  if (!catalog.ok) return catalog;

  const policyResult = createRuntimePermissionPolicy(root.value.permissionPolicy);
  if (!policyResult.ok) {
    return { ok: false, issue: issue("INVALID_PERMISSION_POLICY", `$.permissionPolicy${policyResult.issue.path === "$" ? "" : policyResult.issue.path.slice(1)}`, policyResult.issue.message) };
  }
  const policy: RuntimePermissionPolicy = policyResult.value;
  const instanceId = root.value.instanceId;
  const revisionProvider = root.value.revisionProvider as () => number;
  const consumedActionIds = new Set<string>();
  const consumedIdempotencyKeys = new Set<string>();
  const reservedEffectRevisions = new Set<number>();
  let lastProviderRevision: number | undefined;
  let disposed = false;

  const readRevision = (commitObservation = true): number => {
    const value = revisionProvider();
    if (!validRevision(value)) throw new Error("invalid revision");
    if (lastProviderRevision !== undefined && value < lastProviderRevision) throw new Error("revision regressed");
    if (commitObservation) {
      lastProviderRevision = value;
      for (const reserved of [...reservedEffectRevisions]) {
        if (reserved < value) reservedEffectRevisions.delete(reserved);
      }
    }
    return value;
  };

  const evaluatePreflight = (
    intentInput: ViraActionIntent,
  ):
    | {
        readonly ok: true;
        readonly value: {
          readonly intent: ViraActionIntent;
          readonly definition: ViraActionDefinition;
          readonly permission: ViraActionPreflightPermission;
        };
      }
    | { readonly ok: false; readonly issue: ViraActionBoundaryIssue } => {
    if (disposed) return { ok: false, issue: issue("DISPOSED", "$", "action boundary is disposed") };
    const parsedIntent = parseIntent(intentInput);
    if (!parsedIntent.ok) return parsedIntent;
    const intent = parsedIntent.value;
    if (intent.instanceId !== instanceId) {
      return { ok: false, issue: issue("INSTANCE_MISMATCH", "$.intent.instanceId", "ActionIntent belongs to a different instance") };
    }
    const definition = catalog.value.get(intent.action.type);
    if (!definition) {
      return { ok: false, issue: issue("ACTION_NOT_REGISTERED", "$.intent.action.type", "action type is not registered in the protected catalog") };
    }
    const decision = evaluateRuntimeActionPermission(policy, intent.action);
    if (!decision.ok) {
      return { ok: false, issue: issue("INVALID_INTENT", "$.intent.action", decision.issue.message) };
    }
    if (decision.value.effect === "deny") {
      return { ok: false, issue: issue("PERMISSION_DENIED", "$.intent.action.type", "protected action is denied by canonical permission policy") };
    }
    return {
      ok: true,
      value: Object.freeze({
        intent,
        definition,
        permission: decision.value.effect as ViraActionPreflightPermission,
      }),
    };
  };

  const boundary: ViraActionBoundary = {
    version: VIRA_ACTION_BOUNDARY_VERSION,
    instanceId,
    definition(actionType) {
      return catalog.value.get(actionType);
    },
    currentRevision() {
      return readRevision();
    },
    preflight(intentInput: ViraActionIntent): ViraActionBoundaryPreflightResult {
      const evaluated = evaluatePreflight(intentInput);
      if (!evaluated.ok) return evaluated;
      let currentRevision: number;
      try {
        currentRevision = readRevision(false);
      } catch {
        return { ok: false, issue: issue("INVALID_REVISION", "$.revisionProvider", "trusted revision provider returned an invalid or regressed revision") };
      }
      if (currentRevision !== evaluated.value.intent.expectedStateRevision) {
        return { ok: false, issue: issue("STALE_REVISION", "$.intent.expectedStateRevision", "ActionIntent was created from a stale state revision") };
      }
      return {
        ok: true,
        value: Object.freeze({
          intent: evaluated.value.intent,
          definition: evaluated.value.definition,
          permission: evaluated.value.permission,
          currentRevision,
          challenge: evaluated.value.permission === "confirm"
            ? challenge(evaluated.value.intent, evaluated.value.definition)
            : null,
        }),
      };
    },
    async execute(
      intentInput: ViraActionIntent,
      executor: ViraActionExecutor,
      confirmation?: ViraActionConfirmationGrant,
    ): Promise<ViraActionBoundaryExecutionResult> {
      if (disposed) return { ok: false, issue: issue("DISPOSED", "$", "action boundary is disposed") };
      if (typeof executor !== "function") {
        return { ok: false, issue: issue("INVALID_BOUNDARY", "$.executor", "trusted action adapter must be callable") };
      }

      const evaluated = evaluatePreflight(intentInput);
      if (!evaluated.ok) return evaluated;
      const { intent, definition, permission } = evaluated.value;
      if (permission === "confirm") {
        const expectedChallenge = challenge(intent, definition);
        if (confirmation === undefined) {
          return {
            ok: false,
            issue: issue("CONFIRMATION_REQUIRED", "$.confirmation", "protected action requires exact approval"),
            challenge: expectedChallenge,
          };
        }
        if (!confirmationMatches(confirmation, intent)) {
          return {
            ok: false,
            issue: issue("INVALID_CONFIRMATION", "$.confirmation", "confirmation grant does not match the exact ActionIntent"),
            challenge: expectedChallenge,
          };
        }
      }

      let currentRevision: number;
      try {
        currentRevision = readRevision();
      } catch {
        return { ok: false, issue: issue("INVALID_REVISION", "$.revisionProvider", "trusted revision provider returned an invalid or regressed revision") };
      }
      if (currentRevision !== intent.expectedStateRevision) {
        return { ok: false, issue: issue("STALE_REVISION", "$.intent.expectedStateRevision", "ActionIntent was created from a stale state revision") };
      }

      if (consumedActionIds.has(intent.action.id)) {
        return { ok: false, issue: issue("DUPLICATE_ACTION", "$.intent.action.id", "action id has already crossed this protected boundary") };
      }
      if (consumedIdempotencyKeys.has(intent.idempotencyKey)) {
        return { ok: false, issue: issue("DUPLICATE_IDEMPOTENCY_KEY", "$.intent.idempotencyKey", "idempotency key has already crossed this protected boundary") };
      }
      if (definition.effect !== "read" && reservedEffectRevisions.has(intent.expectedStateRevision)) {
        return { ok: false, issue: issue("REVISION_CONFLICT", "$.intent.expectedStateRevision", "another effectful action already owns this state revision") };
      }

      // Reserve all execution identities synchronously before crossing/awaiting the enterprise effect boundary.
      // Transport uncertainty can never prove that an external side effect did not happen, so action/idempotency
      // reservations are never rolled back. Effect-revision reservations are released only after a trusted,
      // deterministic no-effect result at the same revision, or when the trusted revision provider advances.
      consumedActionIds.add(intent.action.id);
      consumedIdempotencyKeys.add(intent.idempotencyKey);
      if (definition.effect !== "read") reservedEffectRevisions.add(intent.expectedStateRevision);
      const executionPermit = permit(intent, definition);

      let rawResult: unknown;
      try {
        rawResult = await executor(Object.freeze({
          permit: executionPermit,
          definition,
          intent,
          action: intent.action,
        }));
      } catch {
        return { ok: false, issue: issue("EXECUTOR_FAILED", "$.executor", "trusted action adapter failed with uncertain external effect state") };
      }
      if (disposed) {
        return { ok: false, issue: issue("DISPOSED", "$", "action boundary was disposed during protected execution") };
      }

      const adapterResult = parseAdapterResult(rawResult, intent, definition);
      if (!adapterResult.ok) return adapterResult;
      if (
        definition.effect !== "read"
        && adapterResult.value.outcome !== "success"
        && adapterResult.value.stateRevision === intent.expectedStateRevision
      ) {
        reservedEffectRevisions.delete(intent.expectedStateRevision);
      }

      const actionReceipt = receipt(intent, definition, adapterResult.value);
      return {
        ok: true,
        value: Object.freeze({
          permit: executionPermit,
          permission,
          receipt: actionReceipt,
        }),
      };
    },
    consumedAction(actionId) {
      return consumedActionIds.has(actionId);
    },
    consumedIdempotencyKey(idempotencyKey) {
      return consumedIdempotencyKeys.has(idempotencyKey);
    },
    dispose() {
      disposed = true;
    },
  };

  return { ok: true, value: Object.freeze(boundary) };
}
