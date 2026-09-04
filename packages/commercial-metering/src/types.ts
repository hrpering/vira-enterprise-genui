import type {
  ViraApplicationExactReference,
  ViraApplicationPackage,
} from "@vira-enterprise-genui/application-package";
import type {
  ViraEnterprisePrincipal,
  ViraEnterpriseScope,
} from "@vira-enterprise-genui/enterprise-context";

export const VIRA_COMMERCIAL_METERING_SCHEMA_VERSION = "1" as const;
export const VIRA_COMMERCIAL_METERING_MAX_METERS = 256 as const;
export const VIRA_COMMERCIAL_METERING_MAX_USAGE_RECORDS = 2_048 as const;

export const VIRA_COMMERCIAL_METER_UNITS = Object.freeze([
  "count",
  "token",
  "byte",
  "millisecond",
] as const);

export const VIRA_COMMERCIAL_METER_WINDOWS = Object.freeze([
  "lifetime",
  "utc-day",
  "utc-month",
] as const);

export const VIRA_COMMERCIAL_USAGE_RATING_STATUSES = Object.freeze([
  "unlimited",
  "within-limit",
  "limit-reached",
  "over-limit",
] as const);

export type ViraCommercialMeterUnit = (typeof VIRA_COMMERCIAL_METER_UNITS)[number];
export type ViraCommercialMeterWindow = (typeof VIRA_COMMERCIAL_METER_WINDOWS)[number];
export type ViraCommercialUsageRatingStatus = (typeof VIRA_COMMERCIAL_USAGE_RATING_STATUSES)[number];

export interface ViraCommercialMeterDefinition {
  readonly meteringRef: ViraApplicationExactReference;
  readonly unit: ViraCommercialMeterUnit;
  readonly window: ViraCommercialMeterWindow;
}

export interface ViraCommercialMeterCatalog {
  readonly schemaVersion: typeof VIRA_COMMERCIAL_METERING_SCHEMA_VERSION;
  readonly meters: readonly ViraCommercialMeterDefinition[];
}

export interface ViraCommercialUsageRecord {
  readonly usageId: string;
  readonly sourceId: string;
  readonly occurredAt: string;
  readonly applicationId: string;
  readonly applicationVersion: string;
  readonly entitlementRef: ViraApplicationExactReference;
  readonly meteringRef: ViraApplicationExactReference;
  readonly principal: ViraEnterprisePrincipal;
  readonly scope: ViraEnterpriseScope;
  readonly capabilityRef: ViraApplicationExactReference | null;
  readonly locationId: string | null;
  readonly quantity: number;
}

export interface ViraCommercialUsageBatch {
  readonly schemaVersion: typeof VIRA_COMMERCIAL_METERING_SCHEMA_VERSION;
  readonly records: readonly ViraCommercialUsageRecord[];
}

export interface ViraCommercialUsageLedger {
  readonly version: typeof VIRA_COMMERCIAL_METERING_SCHEMA_VERSION;
  readonly append: (input: unknown) => ViraCommercialUsageLedgerResult<ViraCommercialUsageRecord>;
  readonly snapshot: () => ViraCommercialUsageBatch;
}

export interface ViraCommercialUsageRatingRequest {
  readonly application: ViraApplicationPackage;
  readonly entitlementRef: ViraApplicationExactReference;
  readonly principal: ViraEnterprisePrincipal;
  readonly scope: ViraEnterpriseScope;
  readonly capabilityRef: ViraApplicationExactReference | null;
  readonly locationId: string | null;
  readonly meteringRef: ViraApplicationExactReference;
  readonly asOf: string;
  readonly usage: ViraCommercialUsageBatch;
}

export interface ViraCommercialUsageRating {
  readonly meteringRef: ViraApplicationExactReference;
  readonly unit: ViraCommercialMeterUnit;
  readonly window: ViraCommercialMeterWindow;
  readonly windowStart: string | null;
  readonly windowEnd: string | null;
  readonly asOf: string;
  readonly includedRecordCount: number;
  readonly usedQuantity: number;
  readonly limitQuantity: number | null;
  readonly remainingQuantity: number | null;
  readonly excessQuantity: number;
  readonly status: ViraCommercialUsageRatingStatus;
}

export type ViraCommercialMeteringIssueCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_SCHEMA_VERSION"
  | "METER_LIMIT_EXCEEDED"
  | "INVALID_METER"
  | "INVALID_REFERENCE"
  | "FLOATING_REFERENCE"
  | "DUPLICATE_METER"
  | "INVALID_USAGE_BATCH"
  | "USAGE_LIMIT_EXCEEDED"
  | "INVALID_USAGE_RECORD"
  | "DUPLICATE_USAGE_ID"
  | "INVALID_TIMESTAMP"
  | "INVALID_QUANTITY"
  | "INVALID_REQUEST"
  | "UNDECLARED_METERING"
  | "METER_NOT_FOUND"
  | "NOT_ENTITLED"
  | "USAGE_SCOPE_MISMATCH"
  | "QUANTITY_OVERFLOW";

export interface ViraCommercialMeteringIssue {
  readonly code: ViraCommercialMeteringIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraCommercialMeterCatalogResult =
  | { readonly ok: true; readonly value: ViraCommercialMeterCatalog }
  | { readonly ok: false; readonly issue: ViraCommercialMeteringIssue };

export type ViraCommercialUsageBatchResult =
  | { readonly ok: true; readonly value: ViraCommercialUsageBatch }
  | { readonly ok: false; readonly issue: ViraCommercialMeteringIssue };

export type ViraCommercialUsageLedgerResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: ViraCommercialMeteringIssue };

export type ViraCommercialMeteringSerializationResult<T> =
  | { readonly ok: true; readonly value: string; readonly data: T }
  | { readonly ok: false; readonly issue: ViraCommercialMeteringIssue };

export type ViraCommercialUsageRatingResult =
  | { readonly ok: true; readonly value: ViraCommercialUsageRating }
  | { readonly ok: false; readonly issue: ViraCommercialMeteringIssue };
