import {
  parseViraCapabilityDefinition,
  parseViraCapabilityExactReference,
  type ViraCapabilityDefinition,
  type ViraCapabilityExactReference,
} from "@vira-enterprise-genui/capability-contract";
import {
  createViraEnterpriseContext,
  VIRA_ENTERPRISE_CONTEXT_VERSION,
  VIRA_ENTERPRISE_ENVIRONMENTS,
  type ViraEnterpriseEnvironmentName,
  type ViraEnterprisePrincipal,
  type ViraEnterpriseScope,
} from "@vira-enterprise-genui/enterprise-context";
import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonArray,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  parseViraWorkContext,
  type ViraWorkContext,
} from "@vira-enterprise-genui/work-context";
import {
  VIRA_HOSTED_CAPABILITY_FAILURE_CODE_MAX_LENGTH,
  VIRA_HOSTED_CAPABILITY_INVOCATION_ID_MAX_LENGTH,
  VIRA_HOSTED_CAPABILITY_MAX_CONTEXTS,
  VIRA_HOSTED_CAPABILITY_RUNTIME_VERSION,
  type ViraHostedCapabilityAdapter,
  type ViraHostedCapabilityAdapterResult,
  type ViraHostedCapabilityBinding,
  type ViraHostedCapabilityExecutionEvidence,
  type ViraHostedCapabilityExecutionResult,
  type ViraHostedCapabilityProviderFailure,
  type ViraHostedCapabilityRequest,
  type ViraHostedCapabilityRuntimeIssue,
  type ViraHostedCapabilityRuntimeIssueCode,
  type ViraHostedCapabilityValue,
} from "./types.js";

const INVOCATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/;
const FAILURE_CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

const BINDING_FIELDS = ["version", "bindingRef", "capabilityRef", "providerId", "locationId"] as const;
const REQUEST_FIELDS = ["version", "invocationId", "principal", "scope", "input", "contexts"] as const;
const SCOPE_FIELDS = ["version", "organizationId", "projectId", "environment"] as const;
const VALUE_FIELDS = ["typeRef", "value"] as const;
const FAILURE_FIELDS = ["code"] as const;

type Failure = { readonly ok: false; readonly issue: ViraHostedCapabilityRuntimeIssue };
type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function fail(
  code: ViraHostedCapabilityRuntimeIssueCode,
  path: string,
  message: string,
): Failure {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function object(value: JsonValue | undefined): JsonObject | null {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function jsonArray(value: JsonValue): value is JsonArray {
  return Array.isArray(value);
}

function array(value: JsonValue | undefined): JsonArray | null {
  return value !== undefined && jsonArray(value) ? value : null;
}

function shape(value: JsonObject, allowed: readonly string[], required: readonly string[] = allowed): string | null {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) return key;
  for (const key of required) if (!Object.hasOwn(value, key)) return key;
  return null;
}

function referencePath(ownerPath: string, path: string): string {
  if (ownerPath === "$" || ownerPath.length === 0) return path;
  if (ownerPath.startsWith("$.")) return `${path}${ownerPath.slice(1)}`;
  return path;
}

function parseReference(value: JsonValue | undefined, path: string): Parsed<ViraCapabilityExactReference> {
  const parsed = parseViraCapabilityExactReference(value);
  if (parsed.ok) return parsed;
  return fail(
    parsed.issue.code === "FLOATING_REFERENCE" ? "FLOATING_REFERENCE" : "INVALID_REFERENCE",
    referencePath(parsed.issue.path, path),
    parsed.issue.message,
  );
}

function refKey(value: ViraCapabilityExactReference): string {
  return `${value.id}\u0000${value.versionRef}`;
}

function sameRef(
  left: ViraCapabilityExactReference | null,
  right: ViraCapabilityExactReference | null,
): boolean {
  if (left === null || right === null) return left === right;
  return left.id === right.id && left.versionRef === right.versionRef;
}

function freezeJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (jsonArray(value)) {
    for (const item of value) freezeJson(item);
    return Object.freeze(value);
  }
  for (const key of Object.keys(value)) freezeJson(value[key]!);
  return Object.freeze(value);
}

function parseValue(value: JsonValue | undefined, path: string): Parsed<ViraHostedCapabilityValue> {
  const item = object(value);
  if (!item) return fail("INVALID_INPUT_VALUE", path, "hosted Capability value must be an exact object");
  const unexpected = shape(item, VALUE_FIELDS);
  if (unexpected) return fail("INVALID_INPUT_VALUE", `${path}.${unexpected}`, "hosted Capability value shape is invalid");
  let typeRef: ViraCapabilityExactReference | null = null;
  if (item.typeRef !== null) {
    const parsedRef = parseReference(item.typeRef, `${path}.typeRef`);
    if (!parsedRef.ok) return parsedRef;
    typeRef = parsedRef.value;
  }
  return {
    ok: true,
    value: Object.freeze({
      typeRef,
      value: freezeJson(item.value!),
    }),
  };
}

export function parseViraHostedCapabilityBinding(input: unknown): Parsed<ViraHostedCapabilityBinding> {
  const json = parseJsonValue(input);
  if (!json.ok) return fail("INVALID_BINDING", json.issue.path, json.issue.reason);
  const root = object(json.value);
  if (!root) return fail("INVALID_BINDING", "$", "hosted Capability binding must be an exact object");
  const unexpected = shape(root, BINDING_FIELDS);
  if (unexpected) return fail("INVALID_BINDING", `$.${unexpected}`, "hosted Capability binding shape is invalid");
  if (root.version !== VIRA_HOSTED_CAPABILITY_RUNTIME_VERSION) {
    return fail("INVALID_BINDING", "$.version", `binding version must equal ${VIRA_HOSTED_CAPABILITY_RUNTIME_VERSION}`);
  }
  const bindingRef = parseReference(root.bindingRef, "$.bindingRef");
  if (!bindingRef.ok) return bindingRef;
  const capabilityRef = parseReference(root.capabilityRef, "$.capabilityRef");
  if (!capabilityRef.ok) return capabilityRef;
  if (typeof root.providerId !== "string" || !isSemanticNamespace(root.providerId)) {
    return fail("INVALID_BINDING", "$.providerId", "providerId must be a canonical semantic namespace");
  }
  if (root.locationId !== null && (typeof root.locationId !== "string" || !isSemanticNamespace(root.locationId))) {
    return fail("INVALID_BINDING", "$.locationId", "locationId must be null or a canonical semantic namespace");
  }
  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_HOSTED_CAPABILITY_RUNTIME_VERSION,
      bindingRef: bindingRef.value,
      capabilityRef: capabilityRef.value,
      providerId: root.providerId,
      locationId: root.locationId as string | null,
    }),
  };
}

function parseEnterprise(
  principalValue: JsonValue | undefined,
  scopeValue: JsonValue | undefined,
): Parsed<{ readonly principal: ViraEnterprisePrincipal; readonly scope: ViraEnterpriseScope }> {
  const scopeObject = object(scopeValue);
  if (!scopeObject) return fail("INVALID_PRINCIPAL_SCOPE", "$.scope", "scope must be an exact enterprise scope");
  const unexpected = shape(scopeObject, SCOPE_FIELDS);
  if (unexpected) return fail("INVALID_PRINCIPAL_SCOPE", `$.scope.${unexpected}`, "enterprise scope shape is invalid");
  if (
    scopeObject.version !== VIRA_ENTERPRISE_CONTEXT_VERSION
    || typeof scopeObject.organizationId !== "string"
    || typeof scopeObject.projectId !== "string"
    || typeof scopeObject.environment !== "string"
    || !VIRA_ENTERPRISE_ENVIRONMENTS.includes(scopeObject.environment as ViraEnterpriseEnvironmentName)
  ) {
    return fail("INVALID_PRINCIPAL_SCOPE", "$.scope", "enterprise scope values are invalid");
  }
  const context = createViraEnterpriseContext({
    organizationId: scopeObject.organizationId,
    projectId: scopeObject.projectId,
    environments: [scopeObject.environment as ViraEnterpriseEnvironmentName],
  });
  if (!context.ok) return fail("INVALID_PRINCIPAL_SCOPE", "$.scope", context.issue.message);
  const scope = context.value.scope(scopeObject.environment as ViraEnterpriseEnvironmentName);
  if (!scope.ok) return fail("INVALID_PRINCIPAL_SCOPE", "$.scope", scope.issue.message);
  const principal = context.value.principal(principalValue);
  if (!principal.ok) return fail("INVALID_PRINCIPAL_SCOPE", "$.principal", principal.issue.message);
  if (principal.value.organizationId !== scope.value.organizationId) {
    return fail("INVALID_PRINCIPAL_SCOPE", "$.principal.organizationId", "principal organization must match invocation scope");
  }
  return { ok: true, value: Object.freeze({ principal: principal.value, scope: scope.value }) };
}

function contextCompare(left: ViraWorkContext, right: ViraWorkContext): number {
  const leftKey = `${refKey(left.typeRef)}\u0000${left.id}`;
  const rightKey = `${refKey(right.typeRef)}\u0000${right.id}`;
  return leftKey === rightKey ? 0 : leftKey < rightKey ? -1 : 1;
}

function parseContexts(
  input: JsonValue | undefined,
  capability: ViraCapabilityDefinition,
): Parsed<readonly ViraWorkContext[]> {
  const items = array(input);
  if (!items) return fail("INVALID_CONTEXT", "$.contexts", "contexts must be an array");
  if (items.length > VIRA_HOSTED_CAPABILITY_MAX_CONTEXTS) {
    return fail("CONTEXT_LIMIT_EXCEEDED", "$.contexts", `context count exceeds ${VIRA_HOSTED_CAPABILITY_MAX_CONTEXTS}`);
  }

  const required = new Set(capability.contextRequirements.map(refKey));
  const supplied = new Set<string>();
  const contexts: ViraWorkContext[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const parsed = parseViraWorkContext(items[index]);
    if (!parsed.ok) return fail("INVALID_CONTEXT", `$.contexts[${index}]`, parsed.issue.message);
    const key = refKey(parsed.value.typeRef);
    if (supplied.has(key)) {
      return fail("DUPLICATE_CONTEXT", `$.contexts[${index}].typeRef`, "duplicate WorkContext typeRef");
    }
    if (!required.has(key)) {
      return fail("UNDECLARED_CONTEXT", `$.contexts[${index}].typeRef`, "WorkContext type was not declared by Capability requirements");
    }
    supplied.add(key);
    contexts.push(parsed.value);
  }

  for (const requiredRef of capability.contextRequirements) {
    if (!supplied.has(refKey(requiredRef))) {
      return fail("MISSING_CONTEXT", "$.contexts", `missing required WorkContext ${requiredRef.id}@${requiredRef.versionRef}`);
    }
  }

  contexts.sort(contextCompare);
  return { ok: true, value: Object.freeze(contexts) };
}

function parseRequest(
  input: unknown,
  capability: ViraCapabilityDefinition,
): Parsed<ViraHostedCapabilityRequest> {
  const json = parseJsonValue(input);
  if (!json.ok) return fail("INVALID_REQUEST", json.issue.path, json.issue.reason);
  const root = object(json.value);
  if (!root) return fail("INVALID_REQUEST", "$", "hosted Capability request must be an exact object");
  const unexpected = shape(root, REQUEST_FIELDS);
  if (unexpected) return fail("INVALID_REQUEST", `$.${unexpected}`, "hosted Capability request shape is invalid");
  if (root.version !== VIRA_HOSTED_CAPABILITY_RUNTIME_VERSION) {
    return fail("INVALID_REQUEST", "$.version", `request version must equal ${VIRA_HOSTED_CAPABILITY_RUNTIME_VERSION}`);
  }
  if (
    typeof root.invocationId !== "string"
    || root.invocationId.length === 0
    || root.invocationId.length > VIRA_HOSTED_CAPABILITY_INVOCATION_ID_MAX_LENGTH
    || !INVOCATION_ID.test(root.invocationId)
  ) {
    return fail("INVALID_REQUEST", "$.invocationId", "invocationId is invalid");
  }
  const enterprise = parseEnterprise(root.principal, root.scope);
  if (!enterprise.ok) return enterprise;
  const inputValue = parseValue(root.input, "$.input");
  if (!inputValue.ok) return inputValue;
  if (!sameRef(inputValue.value.typeRef, capability.input.typeRef)) {
    return fail("INPUT_TYPE_MISMATCH", "$.input.typeRef", "input typeRef must exactly match CapabilityDefinition.input.typeRef");
  }
  const contexts = parseContexts(root.contexts, capability);
  if (!contexts.ok) return contexts;
  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_HOSTED_CAPABILITY_RUNTIME_VERSION,
      invocationId: root.invocationId,
      principal: enterprise.value.principal,
      scope: enterprise.value.scope,
      input: inputValue.value,
      contexts: contexts.value,
    }),
  };
}

function parseProviderFailure(value: JsonValue | undefined): Parsed<ViraHostedCapabilityProviderFailure> {
  const item = object(value);
  if (!item) return fail("INVALID_ADAPTER_RESULT", "$.failure", "adapter failure must be an exact object");
  const unexpected = shape(item, FAILURE_FIELDS);
  if (unexpected) return fail("INVALID_ADAPTER_RESULT", `$.failure.${unexpected}`, "adapter failure shape is invalid");
  if (
    typeof item.code !== "string"
    || item.code.length === 0
    || item.code.length > VIRA_HOSTED_CAPABILITY_FAILURE_CODE_MAX_LENGTH
    || !FAILURE_CODE.test(item.code)
  ) {
    return fail("INVALID_ADAPTER_RESULT", "$.failure.code", "adapter failure code is invalid");
  }
  return { ok: true, value: Object.freeze({ code: item.code }) };
}

function parseAdapterResult(
  input: unknown,
  capability: ViraCapabilityDefinition,
): Parsed<ViraHostedCapabilityAdapterResult> {
  const json = parseJsonValue(input);
  if (!json.ok) return fail("INVALID_ADAPTER_RESULT", json.issue.path, json.issue.reason);
  const root = object(json.value);
  if (!root || typeof root.outcome !== "string") {
    return fail("INVALID_ADAPTER_RESULT", "$", "adapter result must be an exact outcome object");
  }

  if (root.outcome === "success") {
    const unexpected = shape(root, ["outcome", "output"]);
    if (unexpected) return fail("INVALID_ADAPTER_RESULT", `$.${unexpected}`, "success adapter result shape is invalid");
    const output = parseValue(root.output, "$.output");
    if (!output.ok) return fail("INVALID_ADAPTER_RESULT", output.issue.path, output.issue.message);
    if (!sameRef(output.value.typeRef, capability.output.typeRef)) {
      return fail("OUTPUT_TYPE_MISMATCH", "$.output.typeRef", "output typeRef must exactly match CapabilityDefinition.output.typeRef");
    }
    return { ok: true, value: Object.freeze({ outcome: "success" as const, output: output.value }) };
  }

  if (root.outcome === "empty") {
    const unexpected = shape(root, ["outcome"]);
    if (unexpected) return fail("INVALID_ADAPTER_RESULT", `$.${unexpected}`, "empty adapter result shape is invalid");
    return { ok: true, value: Object.freeze({ outcome: "empty" as const }) };
  }

  if (root.outcome === "error") {
    const unexpected = shape(root, ["outcome", "failure"]);
    if (unexpected) return fail("INVALID_ADAPTER_RESULT", `$.failure.${unexpected}`, "error adapter result shape is invalid");
    const failure = parseProviderFailure(root.failure);
    if (!failure.ok) return failure;
    return { ok: true, value: Object.freeze({ outcome: "error" as const, failure: failure.value }) };
  }

  return fail("INVALID_ADAPTER_RESULT", "$.outcome", "adapter outcome must be success, empty or error");
}

function capabilityRef(capability: ViraCapabilityDefinition): ViraCapabilityExactReference {
  return Object.freeze({ id: capability.id, versionRef: capability.version });
}

function evidence(
  request: ViraHostedCapabilityRequest,
  binding: ViraHostedCapabilityBinding,
  capability: ViraCapabilityDefinition,
  result: ViraHostedCapabilityAdapterResult,
): ViraHostedCapabilityExecutionEvidence {
  const base = {
    version: VIRA_HOSTED_CAPABILITY_RUNTIME_VERSION,
    invocationId: request.invocationId,
    capabilityRef: capabilityRef(capability),
    bindingRef: binding.bindingRef,
    providerId: binding.providerId,
    locationId: binding.locationId,
    outcome: result.outcome,
  } as const;
  if (result.outcome === "success") return Object.freeze({ ...base, output: result.output });
  if (result.outcome === "error") return Object.freeze({ ...base, failure: result.failure });
  return Object.freeze(base);
}

export async function invokeViraHostedCapability(
  capabilityInput: unknown,
  bindingInput: unknown,
  requestInput: unknown,
  adapter: ViraHostedCapabilityAdapter,
): Promise<ViraHostedCapabilityExecutionResult> {
  const capability = parseViraCapabilityDefinition(capabilityInput);
  if (!capability.ok) return fail("INVALID_CAPABILITY", capability.issue.path, capability.issue.message);

  const binding = parseViraHostedCapabilityBinding(bindingInput);
  if (!binding.ok) return binding;

  const exactCapabilityRef = capabilityRef(capability.value);
  if (!sameRef(binding.value.capabilityRef, exactCapabilityRef)) {
    return fail("CAPABILITY_MISMATCH", "$.capabilityRef", "binding capabilityRef must exactly match CapabilityDefinition id and version");
  }

  if (capability.value.invocation.kind === "action") {
    return fail(
      "ACTION_BOUNDARY_REQUIRED",
      "$.capability.invocation",
      "action Capability execution must remain behind the canonical Action Boundary",
    );
  }

  if (typeof adapter !== "function") return fail("INVALID_REQUEST", "$.adapter", "trusted provider adapter must be a function");

  const request = parseRequest(requestInput, capability.value);
  if (!request.ok) return request;

  let rawResult: unknown;
  try {
    rawResult = await adapter(Object.freeze({
      invocationId: request.value.invocationId,
      capability: capability.value,
      binding: binding.value,
      principal: request.value.principal,
      scope: request.value.scope,
      input: request.value.input,
      contexts: request.value.contexts,
    }));
  } catch {
    return fail("ADAPTER_FAILED", "$.adapter", "trusted provider adapter threw or rejected");
  }

  const parsedResult = parseAdapterResult(rawResult, capability.value);
  if (!parsedResult.ok) return parsedResult;
  return { ok: true, value: evidence(request.value, binding.value, capability.value, parsedResult.value) };
}
