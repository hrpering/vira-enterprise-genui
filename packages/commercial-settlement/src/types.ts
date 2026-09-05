import type {
  ViraApplicationExactReference,
  ViraApplicationPackage,
} from "@vira-enterprise-genui/application-package";
import type {
  ViraCommercialPriceQuote,
} from "@vira-enterprise-genui/commercial-pricing";

export const VIRA_COMMERCIAL_SETTLEMENT_SCHEMA_VERSION = "1" as const;
export const VIRA_COMMERCIAL_SETTLEMENT_MAX_RULES = 2_048 as const;
export const VIRA_COMMERCIAL_SETTLEMENT_SHARE_BPS_DENOMINATOR = 10_000 as const;

export interface ViraCommercialSettlementRule {
  readonly settlementRef: ViraApplicationExactReference;
  readonly applicationId: string;
  readonly applicationVersion: string;
  readonly publisherId: string;
  readonly planRef: ViraApplicationExactReference;
  readonly publisherShareBps: number;
}

export interface ViraCommercialSettlementSchedule {
  readonly schemaVersion: typeof VIRA_COMMERCIAL_SETTLEMENT_SCHEMA_VERSION;
  readonly rules: readonly ViraCommercialSettlementRule[];
}

export interface ViraCommercialSettlementRequest {
  readonly application: ViraApplicationPackage;
  readonly settlementRef: ViraApplicationExactReference;
  readonly quote: ViraCommercialPriceQuote;
}

export interface ViraCommercialSettlementAllocation {
  readonly schemaVersion: typeof VIRA_COMMERCIAL_SETTLEMENT_SCHEMA_VERSION;
  readonly settlementRef: ViraApplicationExactReference;
  readonly applicationId: string;
  readonly applicationVersion: string;
  readonly publisherId: string;
  readonly publisherShareBps: number;
  readonly quote: ViraCommercialPriceQuote;
  readonly publisherAmountNanos: number;
  readonly platformAmountNanos: number;
}

export type ViraCommercialSettlementIssueCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_SCHEMA_VERSION"
  | "RULE_LIMIT_EXCEEDED"
  | "INVALID_RULE"
  | "INVALID_REFERENCE"
  | "FLOATING_REFERENCE"
  | "DUPLICATE_RULE"
  | "INVALID_APPLICATION_TARGET"
  | "INVALID_PUBLISHER"
  | "INVALID_SHARE"
  | "INVALID_REQUEST"
  | "INVALID_APPLICATION"
  | "INVALID_QUOTE"
  | "RULE_NOT_FOUND"
  | "APPLICATION_MISMATCH"
  | "PLAN_MISMATCH"
  | "INVALID_ALLOCATION"
  | "ALLOCATION_MISMATCH";

export interface ViraCommercialSettlementIssue {
  readonly code: ViraCommercialSettlementIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraCommercialSettlementScheduleResult =
  | { readonly ok: true; readonly value: ViraCommercialSettlementSchedule }
  | { readonly ok: false; readonly issue: ViraCommercialSettlementIssue };

export type ViraCommercialSettlementSerializationResult<T> =
  | { readonly ok: true; readonly value: string; readonly data: T }
  | { readonly ok: false; readonly issue: ViraCommercialSettlementIssue };

export type ViraCommercialSettlementAllocationResult =
  | { readonly ok: true; readonly value: ViraCommercialSettlementAllocation }
  | { readonly ok: false; readonly issue: ViraCommercialSettlementIssue };
