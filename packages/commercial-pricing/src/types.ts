import type { ViraApplicationExactReference } from "@vira-enterprise-genui/application-package";
import type {
  ViraCommercialMeterUnit,
  ViraCommercialMeterWindow,
  ViraCommercialUsageRating,
} from "@vira-enterprise-genui/commercial-metering";

export const VIRA_COMMERCIAL_PRICING_SCHEMA_VERSION = "1" as const;
export const VIRA_COMMERCIAL_PRICING_MAX_PLANS = 256 as const;
export const VIRA_COMMERCIAL_PRICING_MAX_RATES_PER_PLAN = 64 as const;
export const VIRA_COMMERCIAL_PRICING_MAX_RATINGS = 64 as const;
export const VIRA_COMMERCIAL_PRICING_NANOS_PER_CURRENCY_UNIT = 1_000_000_000 as const;

export const VIRA_COMMERCIAL_PRICING_BASES = Object.freeze([
  "used",
  "excess",
] as const);

export type ViraCommercialPricingBasis = (typeof VIRA_COMMERCIAL_PRICING_BASES)[number];

export interface ViraCommercialMeterRate {
  readonly meteringRef: ViraApplicationExactReference;
  readonly basis: ViraCommercialPricingBasis;
  readonly amountNanosPerUnit: number;
}

export interface ViraCommercialPricePlan {
  readonly planRef: ViraApplicationExactReference;
  readonly currency: string;
  readonly fixedAmountNanos: number;
  readonly rates: readonly ViraCommercialMeterRate[];
}

export interface ViraCommercialPriceCatalog {
  readonly schemaVersion: typeof VIRA_COMMERCIAL_PRICING_SCHEMA_VERSION;
  readonly plans: readonly ViraCommercialPricePlan[];
}

export interface ViraCommercialPricingRequest {
  readonly planRef: ViraApplicationExactReference;
  readonly asOf: string;
  readonly ratings: readonly ViraCommercialUsageRating[];
}

export interface ViraCommercialPriceLine {
  readonly meteringRef: ViraApplicationExactReference;
  readonly unit: ViraCommercialMeterUnit;
  readonly window: ViraCommercialMeterWindow;
  readonly basis: ViraCommercialPricingBasis;
  readonly quantity: number;
  readonly amountNanosPerUnit: number;
  readonly amountNanos: number;
}

export interface ViraCommercialPriceQuote {
  readonly planRef: ViraApplicationExactReference;
  readonly currency: string;
  readonly asOf: string;
  readonly fixedAmountNanos: number;
  readonly lines: readonly ViraCommercialPriceLine[];
  readonly totalAmountNanos: number;
}

export type ViraCommercialPricingIssueCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_SCHEMA_VERSION"
  | "PLAN_LIMIT_EXCEEDED"
  | "INVALID_PLAN"
  | "INVALID_REFERENCE"
  | "FLOATING_REFERENCE"
  | "DUPLICATE_PLAN"
  | "RATE_LIMIT_EXCEEDED"
  | "INVALID_RATE"
  | "DUPLICATE_RATE"
  | "INVALID_CURRENCY"
  | "INVALID_AMOUNT"
  | "INVALID_REQUEST"
  | "PLAN_NOT_FOUND"
  | "RATING_LIMIT_EXCEEDED"
  | "INVALID_RATING"
  | "DUPLICATE_RATING"
  | "MISSING_RATING"
  | "UNPRICED_RATING"
  | "RATING_TIME_MISMATCH"
  | "INVALID_QUOTE"
  | "AMOUNT_OVERFLOW";

export interface ViraCommercialPricingIssue {
  readonly code: ViraCommercialPricingIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraCommercialPriceCatalogResult =
  | { readonly ok: true; readonly value: ViraCommercialPriceCatalog }
  | { readonly ok: false; readonly issue: ViraCommercialPricingIssue };

export type ViraCommercialPricingSerializationResult<T> =
  | { readonly ok: true; readonly value: string; readonly data: T }
  | { readonly ok: false; readonly issue: ViraCommercialPricingIssue };

export type ViraCommercialPriceQuoteResult =
  | { readonly ok: true; readonly value: ViraCommercialPriceQuote }
  | { readonly ok: false; readonly issue: ViraCommercialPricingIssue };
