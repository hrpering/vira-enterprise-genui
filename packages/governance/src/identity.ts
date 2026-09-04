import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import { isViraPrincipalIssuer } from "./issuer.js";
import {
  VIRA_GOVERNANCE_VERSION,
  type ViraAgentIdentityProvider,
  type ViraAgentIdentityRequest,
  type ViraGovernanceIssue,
  type ViraPrincipal,
} from "./types.js";

const REQUEST_FIELDS = new Set(["version", "instanceId", "credentialRef"]);
const PRINCIPAL_FIELDS = new Set(["version", "kind", "id", "issuer"]);
const PRINCIPAL_OPTIONAL = new Set(["claims"]);

function issue(path: string, message: string): ViraGovernanceIssue {
  return Object.freeze({ code: "INVALID_PROVIDER", path, message });
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function exact(value: JsonObject, required: ReadonlySet<string>, optional: ReadonlySet<string> = new Set()): boolean {
  const keys = Object.keys(value);
  return keys.every((key) => required.has(key) || optional.has(key))
    && [...required].every((key) => Object.hasOwn(value, key));
}

function bounded(value: unknown, max = 4_096): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function parseRequest(input: unknown): ViraAgentIdentityRequest | undefined {
  const parsed = parseJsonValue(input, "$.identityRequest");
  if (!parsed.ok || !isObject(parsed.value) || !exact(parsed.value, REQUEST_FIELDS)) return undefined;
  if (
    parsed.value.version !== VIRA_GOVERNANCE_VERSION
    || !bounded(parsed.value.instanceId)
    || !bounded(parsed.value.credentialRef)
  ) return undefined;
  return Object.freeze({
    version: VIRA_GOVERNANCE_VERSION,
    instanceId: parsed.value.instanceId,
    credentialRef: parsed.value.credentialRef,
  });
}

export function parseViraPrincipal(input: unknown, expectedKind?: "user" | "agent"): ViraPrincipal | undefined {
  const parsed = parseJsonValue(input, "$.principal");
  if (!parsed.ok || !isObject(parsed.value) || !exact(parsed.value, PRINCIPAL_FIELDS, PRINCIPAL_OPTIONAL)) return undefined;
  if (
    parsed.value.version !== VIRA_GOVERNANCE_VERSION
    || (parsed.value.kind !== "user" && parsed.value.kind !== "agent")
    || (expectedKind !== undefined && parsed.value.kind !== expectedKind)
    || !bounded(parsed.value.id)
    || !isViraPrincipalIssuer(parsed.value.issuer)
  ) return undefined;
  let claims: JsonObject | undefined;
  if (Object.hasOwn(parsed.value, "claims")) {
    if (!isObject(parsed.value.claims)) return undefined;
    claims = parsed.value.claims;
  }
  return Object.freeze({
    version: VIRA_GOVERNANCE_VERSION,
    kind: parsed.value.kind,
    id: parsed.value.id,
    issuer: parsed.value.issuer,
    ...(claims === undefined ? {} : { claims }),
  });
}

export async function resolveViraAgentPrincipal(
  provider: ViraAgentIdentityProvider,
  requestInput: unknown,
): Promise<{ readonly ok: true; readonly value: ViraPrincipal } | { readonly ok: false; readonly issue: ViraGovernanceIssue }> {
  if (
    provider === null
    || typeof provider !== "object"
    || provider.version !== VIRA_GOVERNANCE_VERSION
    || typeof provider.id !== "string"
    || !isSemanticNamespace(provider.id)
    || typeof provider.resolve !== "function"
  ) {
    return { ok: false, issue: issue("$.identityProvider", "AgentIdentityProvider identity is invalid") };
  }
  const request = parseRequest(requestInput);
  if (!request) return { ok: false, issue: issue("$.identityRequest", "agent identity request is invalid") };

  let raw: unknown;
  try {
    raw = await provider.resolve(request);
  } catch {
    return {
      ok: false,
      issue: Object.freeze({ code: "PROVIDER_FAILED" as const, path: "$.identityProvider", message: "AgentIdentityProvider failed closed" }),
    };
  }
  const principal = parseViraPrincipal(raw, "agent");
  if (!principal) return { ok: false, issue: issue("$.identityProvider.result", "AgentIdentityProvider returned an invalid agent principal") };
  return { ok: true, value: principal };
}
