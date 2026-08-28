export const RESPONSIVE_POLICY_VERSION = "1" as const;
export const RESPONSIVE_POLICY_STRATEGY = "container" as const;
export const RESPONSIVE_MAX_BANDS = 8 as const;
export const RESPONSIVE_MAX_THRESHOLD_PX = 20_000 as const;

export interface ResponsiveBand {
  readonly id: string;
  readonly minInlineSizePx: number;
}

export interface ResponsivePolicy {
  readonly version: typeof RESPONSIVE_POLICY_VERSION;
  readonly strategy: typeof RESPONSIVE_POLICY_STRATEGY;
  readonly bands: readonly ResponsiveBand[];
}

export type ResponsiveValidationCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_STRATEGY"
  | "INVALID_BANDS"
  | "BAND_LIMIT_EXCEEDED"
  | "INVALID_BAND"
  | "DUPLICATE_BAND_ID"
  | "INVALID_THRESHOLD_ORDER"
  | "INVALID_CONTAINER_SIZE";

export interface ResponsiveValidationIssue {
  readonly code: ResponsiveValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ResponsivePolicyResult =
  | { readonly ok: true; readonly value: ResponsivePolicy }
  | { readonly ok: false; readonly issue: ResponsiveValidationIssue };

export type ResponsiveBandResolutionResult =
  | { readonly ok: true; readonly value: ResponsiveBand }
  | { readonly ok: false; readonly issue: ResponsiveValidationIssue };
