export const CSP_HOST_REQUIREMENTS_VERSION = "1" as const;

export const CSP_FORBIDDEN_SCRIPT_SOURCES = Object.freeze([
  "'unsafe-inline'",
  "'unsafe-eval'",
] as const);

export interface CspForbiddenScriptSourcesRequirement {
  readonly directive: "script-src";
  readonly mode: "forbid-sources";
  readonly sources: typeof CSP_FORBIDDEN_SCRIPT_SOURCES;
}

export interface CspDenyAllDirectiveRequirement {
  readonly directive: "script-src-attr" | "object-src";
  readonly mode: "deny-all";
}

export interface CspConnectOriginsRequirement {
  readonly directive: "connect-src";
  readonly mode: "require-origins";
  readonly origins: readonly string[];
}

export interface CspHostRequirements {
  readonly version: typeof CSP_HOST_REQUIREMENTS_VERSION;
  readonly scriptSrc: CspForbiddenScriptSourcesRequirement;
  readonly scriptSrcAttr: CspDenyAllDirectiveRequirement & { readonly directive: "script-src-attr" };
  readonly objectSrc: CspDenyAllDirectiveRequirement & { readonly directive: "object-src" };
  readonly connectSrc: CspConnectOriginsRequirement;
}

export type CspHostRequirementsValidationCode = "INVALID_NETWORK_POLICY";

export interface CspHostRequirementsValidationIssue {
  readonly code: CspHostRequirementsValidationCode;
  readonly path: string;
  readonly message: string;
}

export type CspHostRequirementsResult =
  | { readonly ok: true; readonly value: CspHostRequirements }
  | { readonly ok: false; readonly issue: CspHostRequirementsValidationIssue };
