export const BRAND_PROFILE_VERSION = "1" as const;
export const BRAND_DISPLAY_NAME_MAX_LENGTH = 120 as const;
export const BRAND_TOKEN_ROLES = Object.freeze([
  "accent",
  "surface",
  "text",
  "muted-text",
  "border",
  "body-font",
  "heading-font",
  "control-radius",
  "container-radius",
] as const);

export type BrandTokenRole = (typeof BRAND_TOKEN_ROLES)[number];
export type BrandTokenRefs = Readonly<Partial<Record<BrandTokenRole, string>>>;

export interface BrandProfile {
  readonly version: typeof BRAND_PROFILE_VERSION;
  readonly id: string;
  readonly displayName: string;
  readonly tokenRefs: BrandTokenRefs;
}

export type BrandProfileValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_ID"
  | "INVALID_DISPLAY_NAME"
  | "INVALID_TOKEN_REFS"
  | "UNKNOWN_TOKEN_ROLE"
  | "INVALID_TOKEN_REFERENCE";

export interface BrandProfileValidationIssue {
  readonly code: BrandProfileValidationCode;
  readonly path: string;
  readonly message: string;
}

export type BrandProfileResult =
  | { readonly ok: true; readonly value: BrandProfile }
  | { readonly ok: false; readonly issue: BrandProfileValidationIssue };
