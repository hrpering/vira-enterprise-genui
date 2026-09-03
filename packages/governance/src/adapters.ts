import { isSemanticNamespace, parseJsonValue, type JsonObject, type JsonValue } from "@vira-enterprise-genui/protocol";
import { VIRA_GOVERNANCE_VERSION, type ViraAgentIdentityProvider, type ViraGovernanceContext, type ViraGovernanceProvider } from "./types.js";

function object(value: JsonValue | undefined): JsonObject | undefined {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}
function bounded(value: unknown, max = 4_096): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}
function providerId(value: string): boolean { return isSemanticNamespace(value); }
function oidcIssuer(value: unknown): value is string {
  if (!bounded(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

export interface ViraAgtClient {
  readonly evaluate: (context: ViraGovernanceContext) => Promise<unknown> | unknown;
}
export function createViraAgtGovernanceProvider(id: string, client: ViraAgtClient): ViraGovernanceProvider {
  if (!providerId(id) || typeof client?.evaluate !== "function") throw new TypeError("invalid AGT adapter configuration");
  return Object.freeze({
    version: VIRA_GOVERNANCE_VERSION,
    id,
    async evaluate(context) {
      const raw = await client.evaluate(context);
      const parsed = parseJsonValue(raw, "$.agt");
      const root = parsed.ok ? object(parsed.value) : undefined;
      if (!root || typeof root.verdict !== "string") throw new Error("invalid AGT verdict");
      const reason = bounded(root.reason, 256) ? root.reason : "agt-verdict";
      const evidence = root.evidenceRef;
      if (evidence !== undefined && !bounded(evidence)) throw new Error("invalid AGT evidence reference");
      const base = {
        version: "1" as const,
        reasonCode: reason,
        obligations: [],
        provider: id,
        ...(evidence === undefined ? {} : { evidenceRef: evidence }),
      };
      switch (root.verdict) {
        case "allow": return { ...base, effect: "allow" as const };
        case "warn": return { ...base, effect: "allow" as const, reasonCode: bounded(root.reason, 256) ? root.reason : "agt-warn" };
        case "deny": return { ...base, effect: "deny" as const };
        case "escalate": return { ...base, effect: "challenge" as const };
        case "transform": {
          const transformed = object(root.transformedPayload);
          if (!transformed) throw new Error("AGT transform requires canonical transformedPayload");
          return { ...base, effect: "transform" as const, transformedPayload: transformed };
        }
        default: throw new Error("unknown AGT verdict");
      }
    },
  });
}

export interface ViraOpaClient {
  readonly evaluate: (context: ViraGovernanceContext) => Promise<unknown> | unknown;
}
export function createViraOpaGovernanceProvider(id: string, client: ViraOpaClient): ViraGovernanceProvider {
  if (!providerId(id) || typeof client?.evaluate !== "function") throw new TypeError("invalid OPA adapter configuration");
  return Object.freeze({
    version: VIRA_GOVERNANCE_VERSION,
    id,
    async evaluate(context) {
      const raw = await client.evaluate(context);
      const parsed = parseJsonValue(raw, "$.opa");
      if (!parsed.ok) throw new Error("invalid OPA result");
      if (typeof parsed.value === "boolean") {
        return { version: "1", effect: parsed.value ? "allow" : "deny", reasonCode: parsed.value ? "opa-allow" : "opa-deny", obligations: [], provider: id };
      }
      const root = object(parsed.value);
      if (!root || typeof root.effect !== "string") throw new Error("invalid OPA decision object");
      if (root.effect !== "allow" && root.effect !== "deny" && root.effect !== "challenge") throw new Error("unsupported OPA effect");
      return {
        version: "1",
        effect: root.effect,
        reasonCode: bounded(root.reasonCode, 256) ? root.reasonCode : `opa-${root.effect}`,
        obligations: Array.isArray(root.obligations) ? root.obligations : [],
        provider: id,
        ...(bounded(root.evidenceRef) ? { evidenceRef: root.evidenceRef } : {}),
      };
    },
  });
}

export interface ViraCedarClient {
  readonly authorize: (context: ViraGovernanceContext) => Promise<unknown> | unknown;
}
export function createViraCedarGovernanceProvider(id: string, client: ViraCedarClient): ViraGovernanceProvider {
  if (!providerId(id) || typeof client?.authorize !== "function") throw new TypeError("invalid Cedar adapter configuration");
  return Object.freeze({
    version: VIRA_GOVERNANCE_VERSION,
    id,
    async evaluate(context) {
      const raw = await client.authorize(context);
      const parsed = parseJsonValue(raw, "$.cedar");
      const root = parsed.ok ? object(parsed.value) : undefined;
      if (!root || (root.decision !== "Allow" && root.decision !== "Deny")) throw new Error("invalid Cedar authorization response");
      return {
        version: "1",
        effect: root.decision === "Allow" ? "allow" : "deny",
        reasonCode: bounded(root.reasonCode, 256) ? root.reasonCode : (root.decision === "Allow" ? "cedar-allow" : "cedar-deny"),
        obligations: [],
        provider: id,
        ...(bounded(root.evidenceRef) ? { evidenceRef: root.evidenceRef } : {}),
      };
    },
  });
}

export interface ViraOidcClaimsClient {
  readonly resolveClaims: (credentialRef: string) => Promise<unknown> | unknown;
}
export function createViraOidcAgentIdentityProvider(id: string, client: ViraOidcClaimsClient): ViraAgentIdentityProvider {
  if (!providerId(id) || typeof client?.resolveClaims !== "function") throw new TypeError("invalid OIDC identity adapter configuration");
  return Object.freeze({
    version: VIRA_GOVERNANCE_VERSION,
    id,
    async resolve(request) {
      const raw = await client.resolveClaims(request.credentialRef);
      const parsed = parseJsonValue(raw, "$.oidcClaims");
      const claims = parsed.ok ? object(parsed.value) : undefined;
      if (!claims || !bounded(claims.sub) || !oidcIssuer(claims.iss)) throw new Error("OIDC claims require bounded sub and URL issuer");
      return {
        version: "1",
        kind: "agent",
        id: claims.sub,
        issuer: claims.iss,
        claims,
      };
    },
  });
}
