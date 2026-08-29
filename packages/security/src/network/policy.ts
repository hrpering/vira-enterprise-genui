import {
  NETWORK_METHODS,
  NETWORK_POLICY_MAX_RULES,
  NETWORK_POLICY_VERSION,
} from "./types.js";
import type {
  NetworkMethod,
  NetworkPolicyResult,
  NetworkPolicyRule,
  NetworkPolicyValidationCode,
  NetworkRequest,
  NetworkRequestEvaluationResult,
} from "./types.js";

const policyFields = new Set(["version", "rules"]);
const ruleFields = new Set(["origin", "methods"]);
const requestFields = new Set(["url", "method"]);
const arrayIndexPattern = /^(0|[1-9]\d*)$/;

function policyFailure(
  code: NetworkPolicyValidationCode,
  path: string,
  message: string,
): NetworkPolicyResult {
  return { ok: false, issue: { code, path, message } };
}

function ownData(object: object, key: PropertyKey): PropertyDescriptor | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !("value" in descriptor)) return undefined;
  return descriptor;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function unexpectedArrayProperty(array: readonly unknown[]): string | symbol | undefined {
  const symbol = Object.getOwnPropertySymbols(array)[0];
  if (symbol) return symbol;
  return Object.getOwnPropertyNames(array).find((key) => {
    if (key === "length") return false;
    if (!arrayIndexPattern.test(key)) return true;
    return Number(key) >= array.length;
  });
}

function exactFields(
  object: object,
  allowed: ReadonlySet<string>,
): string | symbol | undefined {
  const symbol = Object.getOwnPropertySymbols(object)[0];
  if (symbol) return symbol;
  return Object.getOwnPropertyNames(object).sort().find((key) => !allowed.has(key));
}

function hasWildcardHostname(url: URL): boolean {
  return url.hostname.includes("*");
}

function parseHttpsOrigin(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username || url.password || hasWildcardHostname(url)) return undefined;
  if (url.pathname !== "/" || url.search || url.hash) return undefined;
  return url.origin;
}

function parseNetworkUrl(value: unknown): { readonly url: string; readonly origin: string } | undefined {
  if (typeof value !== "string") return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || hasWildcardHostname(url)) return undefined;
  return { url: url.href, origin: url.origin };
}

function isNetworkMethod(value: unknown): value is NetworkMethod {
  return typeof value === "string" && NETWORK_METHODS.includes(value as NetworkMethod);
}

function parseRule(value: unknown, index: number):
  | { readonly ok: true; readonly value: NetworkPolicyRule }
  | { readonly ok: false; readonly code: NetworkPolicyValidationCode; readonly path: string; readonly message: string } {
  const base = `$.rules[${index}]`;
  if (!plainObject(value)) return { ok: false, code: "INVALID_RULE", path: base, message: "network policy rule must be a plain object" };
  const extra = exactFields(value, ruleFields);
  if (extra !== undefined) {
    return { ok: false, code: "INVALID_RULE", path: typeof extra === "string" ? `${base}.${extra}` : base, message: "network policy rule contains an unsupported field" };
  }

  const originDescriptor = ownData(value, "origin");
  const origin = originDescriptor ? parseHttpsOrigin(originDescriptor.value) : undefined;
  if (!origin) return { ok: false, code: "INVALID_ORIGIN", path: `${base}.origin`, message: "origin must be an exact credential-free HTTPS origin without wildcard hostname, path, query, or fragment" };

  const methodsDescriptor = ownData(value, "methods");
  if (!methodsDescriptor || !Array.isArray(methodsDescriptor.value) || methodsDescriptor.value.length === 0) {
    return { ok: false, code: "INVALID_METHODS", path: `${base}.methods`, message: "methods must be a non-empty dense array of supported HTTP methods" };
  }
  if (methodsDescriptor.value.length > NETWORK_METHODS.length) {
    return { ok: false, code: "INVALID_METHODS", path: `${base}.methods`, message: `methods may contain at most ${NETWORK_METHODS.length} supported entries` };
  }
  const unexpected = unexpectedArrayProperty(methodsDescriptor.value);
  if (unexpected !== undefined) {
    return { ok: false, code: "INVALID_METHODS", path: typeof unexpected === "string" ? `${base}.methods.${unexpected}` : `${base}.methods`, message: "methods must not contain custom or symbol properties" };
  }

  const methods: NetworkMethod[] = [];
  const seen = new Set<NetworkMethod>();
  for (let methodIndex = 0; methodIndex < methodsDescriptor.value.length; methodIndex += 1) {
    const descriptor = ownData(methodsDescriptor.value, String(methodIndex));
    if (!descriptor || !isNetworkMethod(descriptor.value)) {
      return { ok: false, code: "INVALID_METHODS", path: `${base}.methods[${methodIndex}]`, message: "unsupported or accessor-backed HTTP method" };
    }
    if (seen.has(descriptor.value)) {
      return { ok: false, code: "DUPLICATE_METHOD", path: `${base}.methods[${methodIndex}]`, message: "network policy rule contains a duplicate method" };
    }
    seen.add(descriptor.value);
    methods.push(descriptor.value);
  }

  return {
    ok: true,
    value: Object.freeze({ origin, methods: Object.freeze(methods) }),
  };
}

export function createNetworkPolicy(input: unknown): NetworkPolicyResult {
  if (!plainObject(input)) return policyFailure("INVALID_INPUT", "$", "network policy must be a plain object");
  const extra = exactFields(input, policyFields);
  if (extra !== undefined) {
    return policyFailure("UNKNOWN_FIELD", typeof extra === "string" ? `$.${extra}` : "$", "network policy contains an unsupported field");
  }

  const version = ownData(input, "version");
  if (!version || version.value !== NETWORK_POLICY_VERSION) {
    return policyFailure("INVALID_VERSION", "$.version", `network policy version must be ${NETWORK_POLICY_VERSION}`);
  }
  const rulesDescriptor = ownData(input, "rules");
  if (!rulesDescriptor || !Array.isArray(rulesDescriptor.value)) {
    return policyFailure("INVALID_RULES", "$.rules", "rules must be a dense array");
  }
  if (rulesDescriptor.value.length > NETWORK_POLICY_MAX_RULES) {
    return policyFailure("RULE_LIMIT_EXCEEDED", "$.rules", `network policy may contain at most ${NETWORK_POLICY_MAX_RULES} rules`);
  }
  const unexpected = unexpectedArrayProperty(rulesDescriptor.value);
  if (unexpected !== undefined) {
    return policyFailure("INVALID_RULES", typeof unexpected === "string" ? `$.rules.${unexpected}` : "$.rules", "rules must not contain custom or symbol properties");
  }

  const rules: NetworkPolicyRule[] = [];
  const origins = new Set<string>();
  for (let index = 0; index < rulesDescriptor.value.length; index += 1) {
    const descriptor = ownData(rulesDescriptor.value, String(index));
    if (!descriptor) return policyFailure("INVALID_RULES", `$.rules[${index}]`, "rules must be dense own data properties");
    const parsed = parseRule(descriptor.value, index);
    if (!parsed.ok) return policyFailure(parsed.code, parsed.path, parsed.message);
    if (origins.has(parsed.value.origin)) {
      return policyFailure("DUPLICATE_ORIGIN", `$.rules[${index}].origin`, "network policy contains a duplicate normalized origin");
    }
    origins.add(parsed.value.origin);
    rules.push(parsed.value);
  }

  return {
    ok: true,
    value: Object.freeze({ version: NETWORK_POLICY_VERSION, rules: Object.freeze(rules) }),
  };
}

function parseRequest(input: unknown):
  | { readonly ok: true; readonly value: NetworkRequest }
  | { readonly ok: false; readonly code: "INVALID_REQUEST" | "INVALID_URL" | "INVALID_METHOD"; readonly path: string; readonly message: string } {
  if (!plainObject(input)) return { ok: false, code: "INVALID_REQUEST", path: "$.request", message: "network request must be a plain object" };
  const extra = exactFields(input, requestFields);
  if (extra !== undefined) return { ok: false, code: "INVALID_REQUEST", path: typeof extra === "string" ? `$.request.${extra}` : "$.request", message: "network request contains an unsupported field" };

  const urlDescriptor = ownData(input, "url");
  const parsedUrl = urlDescriptor ? parseNetworkUrl(urlDescriptor.value) : undefined;
  if (!parsedUrl) return { ok: false, code: "INVALID_URL", path: "$.request.url", message: "request URL must be credential-free HTTPS without wildcard hostname or fragment" };
  const methodDescriptor = ownData(input, "method");
  if (!methodDescriptor || !isNetworkMethod(methodDescriptor.value)) {
    return { ok: false, code: "INVALID_METHOD", path: "$.request.method", message: "request method must be one explicitly supported canonical HTTP method" };
  }

  return {
    ok: true,
    value: Object.freeze({ url: parsedUrl.url, origin: parsedUrl.origin, method: methodDescriptor.value }),
  };
}

export function evaluateNetworkRequest(
  policyInput: unknown,
  requestInput: unknown,
): NetworkRequestEvaluationResult {
  const policy = createNetworkPolicy(policyInput);
  if (!policy.ok) {
    return {
      ok: false,
      issue: {
        code: "INVALID_POLICY",
        path: policy.issue.path === "$" ? "$.policy" : `$.policy${policy.issue.path.slice(1)}`,
        message: "network policy is invalid",
      },
    };
  }

  const request = parseRequest(requestInput);
  if (!request.ok) {
    return {
      ok: false,
      issue: { code: request.code, path: request.path, message: request.message },
    };
  }

  const rule = policy.value.rules.find((candidate) => candidate.origin === request.value.origin);
  if (!rule) {
    return {
      ok: true,
      value: Object.freeze({ request: request.value, decision: "deny", reason: "origin-not-allowed" }),
    };
  }
  if (!rule.methods.includes(request.value.method)) {
    return {
      ok: true,
      value: Object.freeze({ request: request.value, decision: "deny", reason: "method-not-allowed" }),
    };
  }

  return {
    ok: true,
    value: Object.freeze({ request: request.value, decision: "allow", reason: "allowed" }),
  };
}
