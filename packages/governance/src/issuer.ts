import { isSemanticNamespace } from "@vira-enterprise-genui/protocol";

function bounded(value: unknown, max = 4_096): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

export function isSecureOidcIssuer(value: unknown): value is string {
  if (!bounded(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.host.length > 0
      && url.username === ""
      && url.password === ""
      && url.search === ""
      && url.hash === "";
  } catch {
    return false;
  }
}

export function isViraPrincipalIssuer(value: unknown): value is string {
  return typeof value === "string"
    && (isSemanticNamespace(value) || isSecureOidcIssuer(value));
}
