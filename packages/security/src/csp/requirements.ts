import { createNetworkPolicy } from "../network/index.js";
import {
  CSP_FORBIDDEN_SCRIPT_SOURCES,
  CSP_HOST_REQUIREMENTS_VERSION,
} from "./types.js";
import type { CspHostRequirementsResult } from "./types.js";

function nestedNetworkPolicyPath(path: string): string {
  return path === "$" ? "$.networkPolicy" : `$.networkPolicy${path.slice(1)}`;
}

export function createCspHostRequirements(networkPolicyInput: unknown): CspHostRequirementsResult {
  const networkPolicy = createNetworkPolicy(networkPolicyInput);
  if (!networkPolicy.ok) {
    return {
      ok: false,
      issue: {
        code: "INVALID_NETWORK_POLICY",
        path: nestedNetworkPolicyPath(networkPolicy.issue.path),
        message: "network policy is invalid",
      },
    };
  }

  const origins = networkPolicy.value.rules
    .map((rule) => rule.origin)
    .sort();

  return {
    ok: true,
    value: Object.freeze({
      version: CSP_HOST_REQUIREMENTS_VERSION,
      scriptSrc: Object.freeze({
        directive: "script-src" as const,
        mode: "forbid-sources" as const,
        sources: CSP_FORBIDDEN_SCRIPT_SOURCES,
      }),
      scriptSrcAttr: Object.freeze({
        directive: "script-src-attr" as const,
        mode: "deny-all" as const,
      }),
      objectSrc: Object.freeze({
        directive: "object-src" as const,
        mode: "deny-all" as const,
      }),
      connectSrc: Object.freeze({
        directive: "connect-src" as const,
        mode: "require-origins" as const,
        origins: Object.freeze(origins),
      }),
    }),
  };
}
