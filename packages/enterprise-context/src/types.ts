export const VIRA_ENTERPRISE_CONTEXT_VERSION = "1" as const;
export const VIRA_ENTERPRISE_ENVIRONMENTS = Object.freeze(["dev", "staging", "production"] as const);
export const VIRA_ENTERPRISE_PRINCIPAL_KINDS = Object.freeze(["user", "agent", "service"] as const);

export type ViraEnterpriseEnvironmentName = (typeof VIRA_ENTERPRISE_ENVIRONMENTS)[number];
export type ViraEnterprisePrincipalKind = (typeof VIRA_ENTERPRISE_PRINCIPAL_KINDS)[number];

export interface ViraOrganizationRef {
  readonly id: string;
}

export interface ViraProjectRef {
  readonly organizationId: string;
  readonly id: string;
}

export interface ViraEnvironmentRef {
  readonly organizationId: string;
  readonly projectId: string;
  readonly name: ViraEnterpriseEnvironmentName;
}

export interface ViraEnterpriseScope {
  readonly version: typeof VIRA_ENTERPRISE_CONTEXT_VERSION;
  readonly organizationId: string;
  readonly projectId: string;
  readonly environment: ViraEnterpriseEnvironmentName;
}

export interface ViraEnterprisePrincipal {
  readonly version: typeof VIRA_ENTERPRISE_CONTEXT_VERSION;
  readonly kind: ViraEnterprisePrincipalKind;
  readonly id: string;
  readonly organizationId: string;
}

export interface ViraSecretRef {
  readonly version: typeof VIRA_ENTERPRISE_CONTEXT_VERSION;
  readonly organizationId: string;
  readonly projectId: string;
  readonly environment: ViraEnterpriseEnvironmentName;
  readonly provider: string;
  readonly key: string;
  readonly versionRef?: string;
}

export interface ViraSecretResolver {
  readonly resolve: (input: {
    readonly scope: ViraEnterpriseScope;
    readonly secret: ViraSecretRef;
  }) => Promise<unknown> | unknown;
}

export interface ViraEnterpriseContextInput {
  readonly organizationId: string;
  readonly projectId: string;
  readonly environments: readonly ViraEnterpriseEnvironmentName[];
}

export type ViraEnterpriseContextIssueCode =
  | "INVALID_CONTEXT"
  | "INVALID_SCOPE"
  | "ENVIRONMENT_NOT_REGISTERED"
  | "INVALID_PRINCIPAL"
  | "CROSS_ORGANIZATION"
  | "INVALID_SECRET_REF"
  | "CROSS_PROJECT_SECRET"
  | "SECRET_RESOLUTION_FAILED"
  | "INVALID_SECRET_VALUE";

export interface ViraEnterpriseContextIssue {
  readonly code: ViraEnterpriseContextIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraEnterpriseContextResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: ViraEnterpriseContextIssue };

export interface ViraEnterpriseContext {
  readonly version: typeof VIRA_ENTERPRISE_CONTEXT_VERSION;
  readonly organizationId: string;
  readonly projectId: string;
  readonly scope: (environment: ViraEnterpriseEnvironmentName) => ViraEnterpriseContextResult<ViraEnterpriseScope>;
  readonly principal: (input: unknown) => ViraEnterpriseContextResult<ViraEnterprisePrincipal>;
  readonly secretRef: (input: unknown) => ViraEnterpriseContextResult<ViraSecretRef>;
  readonly resolveSecret: (
    secret: ViraSecretRef,
    resolver: ViraSecretResolver,
  ) => Promise<ViraEnterpriseContextResult<unknown>>;
}

export type ViraEnterpriseContextCreateResult =
  | { readonly ok: true; readonly value: ViraEnterpriseContext }
  | { readonly ok: false; readonly issue: ViraEnterpriseContextIssue };
