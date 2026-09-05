import {
  VIRA_COMMERCIAL_SETTLEMENT_SHARE_BPS_DENOMINATOR,
} from "./types.js";

export interface ViraCommercialSettlementSplit {
  readonly publisherAmountNanos: number;
  readonly platformAmountNanos: number;
}

export function splitCommercialSettlementAmount(
  grossAmountNanos: number,
  publisherShareBps: number,
): ViraCommercialSettlementSplit | null {
  if (!Number.isSafeInteger(grossAmountNanos) || grossAmountNanos < 0) return null;
  if (
    !Number.isSafeInteger(publisherShareBps)
    || publisherShareBps < 0
    || publisherShareBps > VIRA_COMMERCIAL_SETTLEMENT_SHARE_BPS_DENOMINATOR
  ) {
    return null;
  }

  const quotient = Math.floor(grossAmountNanos / VIRA_COMMERCIAL_SETTLEMENT_SHARE_BPS_DENOMINATOR);
  const remainder = grossAmountNanos % VIRA_COMMERCIAL_SETTLEMENT_SHARE_BPS_DENOMINATOR;
  const publisherAmountNanos = (
    quotient * publisherShareBps
    + Math.floor((remainder * publisherShareBps) / VIRA_COMMERCIAL_SETTLEMENT_SHARE_BPS_DENOMINATOR)
  );
  const platformAmountNanos = grossAmountNanos - publisherAmountNanos;

  if (
    !Number.isSafeInteger(publisherAmountNanos)
    || !Number.isSafeInteger(platformAmountNanos)
    || publisherAmountNanos < 0
    || platformAmountNanos < 0
  ) {
    return null;
  }

  return Object.freeze({ publisherAmountNanos, platformAmountNanos });
}
