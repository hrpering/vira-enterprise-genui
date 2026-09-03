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
  type RuntimeAction,
  type RuntimePermissionPolicy,
} from "@vira-enterprise-genui/runtime-core";
import {
  VIRA_ACTION_BOUNDARY_MAX_CATALOG,
  VIRA_ACTION_BOUNDARY_VERSION,
  type ViraActionBoundary,
  type ViraActionBoundaryCreateResult,
  type ViraActionBoundaryExecutionResult,
  type ViraActionBoundaryIssue,
  type ViraActionBoundaryIssueCode,
  type ViraActionBoundaryProposal,
  type ViraActionConfirmationChallenge,
  type ViraActionConfirmationGrant,
  type ViraActionDefinition,
  type ViraActionExecutionPermit,
  type ViraActionExecutor,
} from "./types.js";

const LOCAL_RUNTIME_ACTIONS = new Set(["runtime.patch.apply", "runtime.lifecycle.transition"]);
const DEFINITION_FIELDS = new Set(["actionType", "effect", "idempotency"]);
const PROPOSAL_FIELDS = new Set(["version", "instanceId", "action"]);
const CONFIRMATION_FIELDS = new Set(["version", "instanceId", "actionId", "actionType"]);
const EFFECTS = new Set(["read", "write", "irreversible"]);
const IDEMPOTENCY = new Set(["none", "action-id"]);

function issue(code: ViraActionBoundaryIssueCode, path: string, message: string): ViraActionBoundaryIssue {
  return Object.freeze({ code, path, message });
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactFields(value: JsonObject, expected: ReadonlySet<string>): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function validInstanceId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4_096;
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

function parseProposal(input: unknown):
  | { readonly ok: true; readonly instanceId: string; readonly action: RuntimeAction }
  | { readonly ok: false; readonly issue: ViraActionBoundaryIssue } {
  const parsed = parseJsonValue(input, "$.proposal");
  if (!parsed.ok || !isJsonObject(parsed.value) || !exactFields(parsed.value, PROPOSAL_FIELDS)) {
    return { ok: false, issue: issue("INVALID_PROPOSAL", "$.proposal", "action proposal must be canonical exact-shape JSON") };
  }
  if (parsed.value.version !== VIRA_ACTION_BOUNDARY_VERSION || !validInstanceId(parsed.value.instanceId)) {
    return { ok: false, issue: issue("INVALID_PROPOSAL", "$.proposal", "action proposal version or instance identity is invalid") };
  }
  const action = createRuntimeAction(parsed.value.action);
  if (!action.ok) {
    return { ok: false, issue: issue("INVALID_PROPOSAL", `$.proposal.action${action.issue.path === "$" ? "" : action.issue.path.slice(1)}`, action.issue.message) };
  }
  return { ok: true, instanceId: parsed.value.instanceId, action: action.value };
}

function confirmationMatches(
  input: unknown,
  instanceId: string,
  action: RuntimeAction,
): boolean {
  const parsed = parseJsonValue(input, "$.confirmation");
  if (!parsed.ok || !isJsonObject(parsed.value) || !exactFields(parsed.value, CONFIRMATION_FIELDS)) return false;
  return parsed.value.version === VIRA_ACTION_BOUNDARY_VERSION
    && parsed.value.instanceId === instanceId
    && parsed.value.actionId === action.id
    && parsed.value.actionType === action.type;
}

function permit(
  instanceId: string,
  action: RuntimeAction,
  definition: ViraActionDefinition,
): ViraActionExecutionPermit {
  return Object.freeze({
    version: VIRA_ACTION_BOUNDARY_VERSION,
    instanceId,
    actionId: action.id,
    actionType: action.type,
    effect: definition.effect,
    idempotency: definition.idempotency,
  });
}

function challenge(
  instanceId: string,
  action: RuntimeAction,
  definition: ViraActionDefinition,
): ViraActionConfirmationChallenge {
  return Object.freeze({
    version: VIRA_ACTION_BOUNDARY_VERSION,
    instanceId,
    actionId: action.id,
    actionType: action.type,
    effect: definition.effect,
  });
}

export function createViraActionBoundary(input: unknown): ViraActionBoundaryCreateResult {
  const parsedInput = parseJsonValue(input, "$" );
  if (!parsedInput.ok || !isJsonObject(parsedInput.value)) {
    return { ok: false, issue: issue("INVALID_BOUNDARY", "$", "action boundary input must be canonical JSON") };
  }
  const keys = Object.keys(parsedInput.value);
  if (keys.length !== 3 || !keys.every((key) => key === "instanceId" || key === "catalog" || key === "permissionPolicy")) {
    return { ok: false, issue: issue("INVALID_BOUNDARY", "$", "action boundary input shape is invalid") };
  }
  if (!validInstanceId(parsedInput.value.instanceId)) {
    return { ok: false, issue: issue("INVALID_BOUNDARY", "$.instanceId", "action boundary requires an exact bounded instanceId") };
  }

  const catalog = parseCatalog(parsedInput.value.catalog);
  if (!catalog.ok) return catalog;

  const policyResult = createRuntimePermissionPolicy(parsedInput.value.permissionPolicy);
  if (!policyResult.ok) {
    return { ok: false, issue: issue("INVALID_PERMISSION_POLICY", `$.permissionPolicy${policyResult.issue.path === "$" ? "" : policyResult.issue.path.slice(1)}`, policyResult.issue.message) };
  }
  const policy: RuntimePermissionPolicy = policyResult.value;
  const instanceId = parsedInput.value.instanceId;
  const consumed = new Set<string>();
  let disposed = false;

  const boundary: ViraActionBoundary = {
    version: VIRA_ACTION_BOUNDARY_VERSION,
    instanceId,
    definition(actionType) {
      return catalog.value.get(actionType);
    },
    async execute(
      proposalInput: ViraActionBoundaryProposal,
      executor: ViraActionExecutor,
      confirmation?: ViraActionConfirmationGrant,
    ): Promise<ViraActionBoundaryExecutionResult> {
      if (disposed) return { ok: false, issue: issue("DISPOSED", "$", "action boundary is disposed") };
      if (typeof executor !== "function") {
        return { ok: false, issue: issue("INVALID_BOUNDARY", "$.executor", "protected action executor must be callable") };
      }

      const proposal = parseProposal(proposalInput);
      if (!proposal.ok) return proposal;
      if (proposal.instanceId !== instanceId) {
        return { ok: false, issue: issue("INSTANCE_MISMATCH", "$.proposal.instanceId", "action proposal belongs to a different instance") };
      }

      const definition = catalog.value.get(proposal.action.type);
      if (!definition) {
        return { ok: false, issue: issue("ACTION_NOT_REGISTERED", "$.proposal.action.type", "action type is not registered in the protected catalog") };
      }

      const decision = evaluateRuntimeActionPermission(policy, proposal.action);
      if (!decision.ok) {
        return { ok: false, issue: issue("INVALID_PROPOSAL", "$.proposal.action", decision.issue.message) };
      }
      if (decision.value.effect === "deny") {
        return { ok: false, issue: issue("PERMISSION_DENIED", "$.proposal.action.type", "protected action is denied by canonical permission policy") };
      }
      if (decision.value.effect === "confirm") {
        const expectedChallenge = challenge(instanceId, proposal.action, definition);
        if (confirmation === undefined) {
          return {
            ok: false,
            issue: issue("CONFIRMATION_REQUIRED", "$.confirmation", "protected action requires exact user confirmation"),
            challenge: expectedChallenge,
          };
        }
        if (!confirmationMatches(confirmation, instanceId, proposal.action)) {
          return {
            ok: false,
            issue: issue("INVALID_CONFIRMATION", "$.confirmation", "confirmation grant does not match the exact protected action"),
            challenge: expectedChallenge,
          };
        }
      }

      if (consumed.has(proposal.action.id)) {
        return { ok: false, issue: issue("DUPLICATE_ACTION", "$.proposal.action.id", "protected action id has already crossed this boundary") };
      }

      // Reserve synchronously before crossing/awaiting the external effect boundary.
      // A rejected/throwing executor cannot prove that the external effect did not happen,
      // therefore this reservation is terminal and is intentionally never rolled back.
      consumed.add(proposal.action.id);
      const executionPermit = permit(instanceId, proposal.action, definition);

      try {
        const result = await executor(Object.freeze({
          permit: executionPermit,
          definition,
          action: proposal.action,
        }));
        if (disposed) {
          return { ok: false, issue: issue("DISPOSED", "$", "action boundary was disposed during protected execution") };
        }
        return {
          ok: true,
          value: Object.freeze({
            permit: executionPermit,
            permission: decision.value.effect,
            result,
          }),
        };
      } catch {
        return { ok: false, issue: issue("EXECUTOR_FAILED", "$.executor", "protected action executor failed with uncertain external effect state") };
      }
    },
    consumed(actionId) {
      return consumed.has(actionId);
    },
    dispose() {
      disposed = true;
    },
  };

  return { ok: true, value: Object.freeze(boundary) };
}
