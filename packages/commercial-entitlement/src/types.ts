import type {
  ViraApplicationExactReference,
  ViraApplicationPackage,
} from "@vira-enterprise-genui/application-package";
import type {
  ViraEnterpriseEnvironmentName,
  ViraEnterprisePrincipal,
  ViraEnterprisePrincipalKind,
  ViraEnterpriseScope,
} from "@vira-enterprise-genui/enterprise-context";

export const VIRA_COMMERCIAL_ENTITLEMENT_SCHEMA_VERSION = "1" as const;
export const VIRA_COMMERCIAL_ENTITLEMENT_MAX_ENTITLEMENTS = 2_048 as const;
export const VIRA_COMMERCIAL_ENTITLEMENT_MAX_LIMITS_PER_ENTITLEMENT = 32 as const;

export const VIRA_COMMERCIAL_ACCESS_STATES = Object.freeze([
  "enabled",
  "disabled",
] as const);

export const VIRA_COMMERCIAL_LIMIT_PERIODS = Object.freeze([
  "day",
  "month",
  "billing-cycle",
] as const);

export type ViraCommercialAccessState = (typeof VIRA_COMMERCIAL_ACCESS_STATES)[number];
export type ViraCommercialLimitPeriod = (typeof VIRA_COMMERCIAL_LIMIT_PERIODS)[number];

export interface ViraCommercialPrincipalSelector {
  readonly kind: ViraEnterprisePrincipalKind;
  readonly id: string;
}

export interface ViraCommercialEntitlementSubject {
  readonly organizationId: string;
  readonly principal: ViraCommercialPrincipalSelector | null;
}

export interface ViraCommercialEntitlementTarget {
  readonly applicationId: string;
  readonly applicationVersion: string;
  readonly capabilityRef: ViraApplicationExactReference | null;
}

export interface ViraCommercialEntitlementScope {
  readonly projectId: string | null;
  readonly environment: ViraEnterpriseEnvironmentName | null;
  readonly locationId: string | null;
}

export interface ViraCommercialEntitlementLimit {
  readonly meteringRef: ViraApplicationExactReference;
  readonly quantity: number;
  readonly period: ViraCommercialLimitPeriod;
}

export interface ViraCommercialEntitlement {
  readonly entitlementRef: ViraApplicationExactReference;
  readonly subject: ViraCommercialEntitlementSubject;
  readonly target: ViraCommercialEntitlementTarget;
  readonly scope: ViraCommercialEntitlementScope;
  readonly planRef: ViraApplicationExactReference;
  readonly limits: readonly ViraCommercialEntitlementLimit[];
  readonly commercialAccess: ViraCommercialAccessState;
}

export interface ViraCommercialEntitlementSet {
  readonly schemaVersion: typeof VIRA_COMMERCIAL_ENTITLEMENT_SCHEMA_VERSION;
  readonly entitlements: readonly ViraCommercialEntitlement[];
}

export interface ViraCommercialEntitlementRequest {
  readonly application: ViraApplicationPackage;
  readonly entitlementRef: ViraApplicationExactReference;
  readonly principal: ViraEnterprisePrincipal;
  readonly scope: ViraEnterpriseScope;
  readonly capabilityRef: ViraApplicationExactReference | null;
  readonly locationId: string | null;
}

export type ViraCommercialEntitlementDecisionKind = "entitled" | "not-entitled";
export type ViraCommercialEntitlementDecisionReason =
  | "MATCHED"
  | "NO_MATCH"
  | "COMMERCIAL_ACCESS_DISABLED";

export interface ViraCommercialEntitlementDecision {
  readonly decision: ViraCommercialEntitlementDecisionKind;
  readonly reason: ViraCommercialEntitlementDecisionReason;
  readonly entitlementRef: ViraApplicationExactReference;
  readonly matchedEntitlement: ViraCommercialEntitlement | null;
  readonly planRef: ViraApplicationExactReference | null;
  readonly limits: readonly ViraCommercialEntitlementLimit[];
}

export type ViraCommercialEntitlementIssueCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_SCHEMA_VERSION"
  | "ENTITLEMENT_LIMIT_EXCEEDED"
  | "INVALID_ENTITLEMENT"
  | "INVALID_REFERENCE"
  | "FLOATING_REFERENCE"
  | "DUPLICATE_ENTITLEMENT"
  | "INVALID_SUBJECT"
  | "INVALID_TARGET"
  | "INVALID_SCOPE"
  | "INVALID_PLAN"
  | "INVALID_LIMIT"
  | "LIMIT_EXCEEDED"
  | "INVALID_COMMERCIAL_ACCESS"
  | "INVALID_REQUEST"
  | "UNDECLARED_ENTITLEMENT"
  | "UNDECLARED_CAPABILITY"
  | "UNDECLARED_METERING"
  | "AMBIGUOUS_ENTITLEMENT";

export interface ViraCommercialEntitlementIssue {
  readonly code: ViraCommercialEntitlementIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraCommercialEntitlementParseResult =
  | { readonly ok: true; readonly value: ViraCommercialEntitlementSet }
  | { readonly ok: false; readonly issue: ViraCommercialEntitlementIssue };

export type ViraCommercialEntitlementSerializationResult =
  | {
      readonly ok: true;
      readonly value: string;
      readonly entitlementSet: ViraCommercialEntitlementSet;
    }
  | { readonly ok: false; readonly issue: ViraCommercialEntitlementIssue };

export type ViraCommercialEntitlementEvaluationResult =
  | { readonly ok: true; readonly value: ViraCommercialEntitlementDecision }
  | { readonly ok: false; readonly issue: ViraCommercialEntitlementIssue };
