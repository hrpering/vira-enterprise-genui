export const CONNECTOR_KIT_VERSION = "1" as const;
export const CONNECTOR_MAX_AUTH_PROFILES = 16 as const;
export const CONNECTOR_MAX_OPERATIONS = 256 as const;
export const CONNECTOR_MAX_SCOPES = 128 as const;
export const CONNECTOR_TEXT_MAX_LENGTH = 2_048 as const;

export const CONNECTOR_IMPORT_KINDS = Object.freeze(["openapi", "mcp", "rest", "sdk"] as const);
export const CONNECTOR_AUTH_KINDS = Object.freeze([
  "oauth2-pkce",
  "api-key",
  "service-account",
  "signed-jwt",
  "oidc",
] as const);
export const CONNECTOR_OPERATION_CLASSIFICATIONS = Object.freeze(["query", "effect"] as const);
export const CONNECTOR_PROVIDER_EFFECTS = Object.freeze(["read", "write"] as const);
export const CONNECTOR_HTTP_METHODS = Object.freeze(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const);
export const CONNECTOR_PAGINATION_KINDS = Object.freeze(["none", "cursor", "page", "link"] as const);
export const CONNECTOR_RATE_LIMIT_KINDS = Object.freeze(["none", "provider-headers", "declared"] as const);
export const CONNECTOR_COMPLETION_KINDS = Object.freeze(["inline", "poll", "webhook"] as const);
export const CONNECTOR_IDEMPOTENCY_KINDS = Object.freeze(["none", "provider-key", "conditional"] as const);
export const CONNECTOR_RETRY_KINDS = Object.freeze(["never", "query-safe", "provider-declared"] as const);
export const CONNECTOR_VERIFICATION_KINDS = Object.freeze(["response", "postcondition"] as const);
export const CONNECTOR_ERROR_NORMALIZATION_KINDS = Object.freeze(["canonical"] as const);

export type ConnectorImportKind = (typeof CONNECTOR_IMPORT_KINDS)[number];
export type ConnectorAuthKind = (typeof CONNECTOR_AUTH_KINDS)[number];
export type ConnectorOperationClassification = (typeof CONNECTOR_OPERATION_CLASSIFICATIONS)[number];
export type ConnectorProviderEffect = (typeof CONNECTOR_PROVIDER_EFFECTS)[number];
export type ConnectorHttpMethod = (typeof CONNECTOR_HTTP_METHODS)[number];
export type ConnectorPaginationKind = (typeof CONNECTOR_PAGINATION_KINDS)[number];
export type ConnectorRateLimitKind = (typeof CONNECTOR_RATE_LIMIT_KINDS)[number];
export type ConnectorCompletionKind = (typeof CONNECTOR_COMPLETION_KINDS)[number];
export type ConnectorIdempotencyKind = (typeof CONNECTOR_IDEMPOTENCY_KINDS)[number];
export type ConnectorRetryKind = (typeof CONNECTOR_RETRY_KINDS)[number];
export type ConnectorVerificationKind = (typeof CONNECTOR_VERIFICATION_KINDS)[number];
export type ConnectorErrorNormalizationKind = (typeof CONNECTOR_ERROR_NORMALIZATION_KINDS)[number];

export interface ConnectorSourceDeclaration {
  readonly kind: ConnectorImportKind;
  readonly reference: string;
}

export interface ConnectorAuthProfile {
  readonly id: string;
  readonly kind: ConnectorAuthKind;
  readonly scopes: readonly string[];
}

export interface ConnectorOperationDeclaration {
  readonly id: string;
  readonly providerEffect: ConnectorProviderEffect;
  readonly classification: ConnectorOperationClassification;
  readonly authProfileId: string;
  readonly requiredScopes: readonly string[];
  readonly method: ConnectorHttpMethod;
  readonly path: string;
  readonly resourceType: string;
  readonly inputSchemaRef: string | null;
  readonly outputSchemaRef: string | null;
  readonly pagination: ConnectorPaginationKind;
  readonly rateLimit: ConnectorRateLimitKind;
  readonly completion: ConnectorCompletionKind;
  readonly idempotency: ConnectorIdempotencyKind;
  readonly retry: ConnectorRetryKind;
  readonly verification: ConnectorVerificationKind;
  readonly errorNormalization: ConnectorErrorNormalizationKind;
}

export interface ConnectorSandboxDeclaration {
  readonly testOperationId: string;
}

export interface ConnectorKitContract {
  readonly version: typeof CONNECTOR_KIT_VERSION;
  readonly id: string;
  readonly providerId: string;
  readonly source: ConnectorSourceDeclaration;
  readonly authProfiles: readonly ConnectorAuthProfile[];
  readonly operations: readonly ConnectorOperationDeclaration[];
  readonly sandbox: ConnectorSandboxDeclaration;
}

export type ConnectorKitValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_ID"
  | "INVALID_PROVIDER_ID"
  | "INVALID_SOURCE"
  | "INVALID_AUTH_PROFILES"
  | "AUTH_PROFILE_LIMIT_EXCEEDED"
  | "INVALID_AUTH_PROFILE"
  | "DUPLICATE_AUTH_PROFILE"
  | "SCOPE_LIMIT_EXCEEDED"
  | "INVALID_SCOPE"
  | "DUPLICATE_SCOPE"
  | "INVALID_OPERATIONS"
  | "OPERATION_LIMIT_EXCEEDED"
  | "INVALID_OPERATION"
  | "DUPLICATE_OPERATION"
  | "UNKNOWN_AUTH_PROFILE"
  | "UNDECLARED_SCOPE"
  | "WRITE_AS_QUERY"
  | "METHOD_EFFECT_MISMATCH"
  | "UNSAFE_EFFECT_POLICY"
  | "INVALID_SANDBOX"
  | "UNSAFE_SANDBOX_OPERATION";

export interface ConnectorKitValidationIssue {
  readonly code: ConnectorKitValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ConnectorKitContractResult =
  | { readonly ok: true; readonly value: ConnectorKitContract }
  | { readonly ok: false; readonly issue: ConnectorKitValidationIssue };
