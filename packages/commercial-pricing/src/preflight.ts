import {
  parseViraApplicationExactReference,
  type ViraApplicationExactReference,
} from "@vira-enterprise-genui/application-package";
import {
  parseViraCommercialUsageRating,
  type ViraCommercialUsageRating,
} from "@vira-enterprise-genui/commercial-metering";
import {
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import { priceViraCommercialUsage } from "./pricing.js";
import type { ViraCommercialPriceQuote } from "./types.js";

export const VIRA_COMMERCIAL_PREFLIGHT_VERSION = "1" as const;
export const VIRA_COMMERCIAL_PREFLIGHT_DECISIONS = Object.freeze([
  "allowed",
  "limit-reached",
  "over-budget",
  "insufficient-evidence",
] as const);

export type ViraCommercialPreflightDecision =
  (typeof VIRA_COMMERCIAL_PREFLIGHT_DECISIONS)[number];

export type ViraCommercialPreflightReason =
  | "WITHIN_QUOTA_AND_BUDGET"
  | "CURRENT_QUOTA_EXHAUSTED"
  | "PROJECTED_QUOTA_EXCEEDED"
  | "PROJECTED_BUDGET_EXCEEDED"
  | "MISSING_CANONICAL_RATING";

export interface ViraCommercialBudgetPolicy {
  readonly currency: string;
  readonly maxAmountNanos: number;
}

export interface ViraCommercialPreflightPolicy {
  readonly planRef: ViraApplicationExactReference;
  readonly budget: ViraCommercialBudgetPolicy;
}

export interface ViraCommercialPreflightPolicySource {
  readonly resolve: (input: Readonly<{
    readonly meteringRef: ViraApplicationExactReference;
    readonly asOf: string;
  }>) => Promise<unknown> | unknown;
}

export interface ViraCommercialBudgetQuotaPreflightDependencies {
  readonly policySource: ViraCommercialPreflightPolicySource;
}

export interface ViraCommercialUsageProposal {
  readonly meteringRef: ViraApplicationExactReference;
  readonly quantity: number;
}

export interface ViraCommercialBudgetQuotaPreflight {
  readonly version: typeof VIRA_COMMERCIAL_PREFLIGHT_VERSION;
  readonly decision: ViraCommercialPreflightDecision;
  readonly reason: ViraCommercialPreflightReason;
  readonly planRef: ViraApplicationExactReference;
  readonly meteringRef: ViraApplicationExactReference;
  readonly asOf: string;
  readonly proposedQuantity: number;
  readonly currentRating: ViraCommercialUsageRating | null;
  readonly projectedRating: ViraCommercialUsageRating | null;
  readonly currentQuote: ViraCommercialPriceQuote | null;
  readonly projectedQuote: ViraCommercialPriceQuote | null;
  readonly budget: ViraCommercialBudgetPolicy;
}

export type ViraCommercialBudgetQuotaPreflightIssueCode =
  | "INVALID_INPUT"
  | "INVALID_REFERENCE"
  | "INVALID_TIMESTAMP"
  | "INVALID_RATING"
  | "DUPLICATE_RATING"
  | "INVALID_QUANTITY"
  | "POLICY_SOURCE_FAILED"
  | "INVALID_POLICY"
  | "CURRENCY_MISMATCH"
  | "QUANTITY_OVERFLOW"
  | "PRICING_FAILED";

export interface ViraCommercialBudgetQuotaPreflightIssue {
  readonly code: ViraCommercialBudgetQuotaPreflightIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraCommercialBudgetQuotaPreflightResult =
  | { readonly ok: true; readonly value: ViraCommercialBudgetQuotaPreflight }
  | { readonly ok: false; readonly issue: ViraCommercialBudgetQuotaPreflightIssue };

const REQUEST_FIELDS = new Set(["asOf", "ratings", "proposal"]);
const PROPOSAL_FIELDS = new Set(["meteringRef", "quantity"]);
const POLICY_FIELDS = new Set(["planRef", "budget"]);
const BUDGET_FIELDS = new Set(["currency", "maxAmountNanos"]);
const CURRENCY = /^[A-Z]{3}$/;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function fail(
  code: ViraCommercialBudgetQuotaPreflightIssueCode,
  path: string,
  message: string,
): ViraCommercialBudgetQuotaPreflightResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactFields(value: JsonObject, fields: ReadonlySet<string>): boolean {
  const keys = Object.keys(value);
  return keys.length === fields.size && keys.every((key) => fields.has(key));
}

function canonicalUtc(value: JsonValue | undefined): string | null {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const canonical = new Date(milliseconds).toISOString();
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  return canonical === normalized ? canonical : null;
}

function sameRef(left: ViraApplicationExactReference, right: ViraApplicationExactReference): boolean {
  return left.id === right.id && left.versionRef === right.versionRef;
}

function parsePolicy(input: unknown): ViraCommercialPreflightPolicy | null {
  const parsed = parseJsonValue(input, "$policy");
  if (!parsed.ok || !object(parsed.value) || !exactFields(parsed.value, POLICY_FIELDS)) return null;
  const planRef = parseViraApplicationExactReference(parsed.value.planRef);
  if (!planRef.ok) return null;
  if (!object(parsed.value.budget) || !exactFields(parsed.value.budget, BUDGET_FIELDS)) return null;
  if (typeof parsed.value.budget.currency !== "string" || !CURRENCY.test(parsed.value.budget.currency)) return null;
  if (
    typeof parsed.value.budget.maxAmountNanos !== "number"
    || !Number.isSafeInteger(parsed.value.budget.maxAmountNanos)
    || parsed.value.budget.maxAmountNanos < 0
  ) return null;
  return Object.freeze({
    planRef: planRef.value,
    budget: Object.freeze({
      currency: parsed.value.budget.currency,
      maxAmountNanos: parsed.value.budget.maxAmountNanos,
    }),
  });
}

function projectedRating(
  rating: ViraCommercialUsageRating,
  proposedQuantity: number,
): ViraCommercialBudgetQuotaPreflightResult | ViraCommercialUsageRating {
  if (rating.usedQuantity > Number.MAX_SAFE_INTEGER - proposedQuantity) {
    return fail("QUANTITY_OVERFLOW", "$request.proposal.quantity", "projected usage exceeds safe integer range");
  }
  if (rating.includedRecordCount === Number.MAX_SAFE_INTEGER) {
    return fail("QUANTITY_OVERFLOW", "$request.ratings", "projected usage record count exceeds safe integer range");
  }
  const usedQuantity = rating.usedQuantity + proposedQuantity;
  const includedRecordCount = rating.includedRecordCount + 1;
  const limit = rating.limitQuantity;
  const remainingQuantity = limit === null ? null : Math.max(0, limit - usedQuantity);
  const excessQuantity = limit === null ? 0 : Math.max(0, usedQuantity - limit);
  const status = limit === null
    ? "unlimited" as const
    : usedQuantity < limit
      ? "within-limit" as const
      : usedQuantity === limit
        ? "limit-reached" as const
        : "over-limit" as const;
  const candidate = {
    ...rating,
    includedRecordCount,
    usedQuantity,
    remainingQuantity,
    excessQuantity,
    status,
  };
  const parsed = parseViraCommercialUsageRating(candidate);
  if (!parsed.ok) {
    return fail("INVALID_RATING", "$request.ratings", `projected rating failed canonical validation: ${parsed.issue.code}`);
  }
  return parsed.value;
}

export async function evaluateViraCommercialBudgetQuotaPreflight(
  priceCatalogInput: unknown,
  requestInput: unknown,
  dependencies: ViraCommercialBudgetQuotaPreflightDependencies,
): Promise<ViraCommercialBudgetQuotaPreflightResult> {
  const parsed = parseJsonValue(requestInput, "$request");
  if (!parsed.ok || !object(parsed.value) || !exactFields(parsed.value, REQUEST_FIELDS)) {
    return fail("INVALID_INPUT", "$request", "preflight request must contain exact asOf/ratings/proposal fields");
  }
  const root = parsed.value;
  const asOf = canonicalUtc(root.asOf);
  if (!asOf) return fail("INVALID_TIMESTAMP", "$request.asOf", "asOf must be canonical UTC");

  if (!Array.isArray(root.ratings)) {
    return fail("INVALID_INPUT", "$request.ratings", "ratings must be an array");
  }
  const ratings: ViraCommercialUsageRating[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < root.ratings.length; index += 1) {
    const rating = parseViraCommercialUsageRating(root.ratings[index]);
    if (!rating.ok) return fail("INVALID_RATING", `$request.ratings[${index}]`, `rating is invalid: ${rating.issue.code}`);
    if (rating.value.asOf !== asOf) {
      return fail("INVALID_RATING", `$request.ratings[${index}].asOf`, "rating asOf must match preflight asOf");
    }
    const key = `${rating.value.meteringRef.id}\u0000${rating.value.meteringRef.versionRef}`;
    if (seen.has(key)) return fail("DUPLICATE_RATING", `$request.ratings[${index}]`, "duplicate exact meteringRef rating");
    seen.add(key);
    ratings.push(rating.value);
  }

  if (!object(root.proposal) || !exactFields(root.proposal, PROPOSAL_FIELDS)) {
    return fail("INVALID_INPUT", "$request.proposal", "proposal shape is invalid");
  }
  const proposalRef = parseViraApplicationExactReference(root.proposal.meteringRef);
  if (!proposalRef.ok) return fail("INVALID_REFERENCE", "$request.proposal.meteringRef", "proposal meteringRef must be exact");
  if (typeof root.proposal.quantity !== "number" || !Number.isSafeInteger(root.proposal.quantity) || root.proposal.quantity <= 0) {
    return fail("INVALID_QUANTITY", "$request.proposal.quantity", "proposal quantity must be a positive safe integer");
  }

  if (
    dependencies === null
    || typeof dependencies !== "object"
    || dependencies.policySource === null
    || typeof dependencies.policySource !== "object"
    || typeof dependencies.policySource.resolve !== "function"
  ) return fail("INVALID_INPUT", "$dependencies", "trusted preflight policy source is required");

  let rawPolicy: unknown;
  try {
    rawPolicy = await dependencies.policySource.resolve(Object.freeze({
      meteringRef: proposalRef.value,
      asOf,
    }));
  } catch {
    return fail("POLICY_SOURCE_FAILED", "$dependencies.policySource", "preflight policy source failed closed");
  }
  const policy = parsePolicy(rawPolicy);
  if (!policy) return fail("INVALID_POLICY", "$dependencies.policySource", "preflight policy source returned invalid policy evidence");

  const currentQuote = priceViraCommercialUsage(priceCatalogInput, {
    planRef: policy.planRef,
    asOf,
    ratings,
  });
  if (!currentQuote.ok) {
    if (currentQuote.issue.code === "MISSING_RATING") {
      return {
        ok: true,
        value: Object.freeze({
          version: VIRA_COMMERCIAL_PREFLIGHT_VERSION,
          decision: "insufficient-evidence",
          reason: "MISSING_CANONICAL_RATING",
          planRef: policy.planRef,
          meteringRef: proposalRef.value,
          asOf,
          proposedQuantity: root.proposal.quantity,
          currentRating: null,
          projectedRating: null,
          currentQuote: null,
          projectedQuote: null,
          budget: policy.budget,
        }),
      };
    }
    return fail("PRICING_FAILED", "$request", `current pricing failed: ${currentQuote.issue.code}`);
  }
  if (currentQuote.value.currency !== policy.budget.currency) {
    return fail("CURRENCY_MISMATCH", "$dependencies.policySource", "budget currency does not match exact price plan currency");
  }

  const currentRating = ratings.find((candidate) => sameRef(candidate.meteringRef, proposalRef.value));
  if (!currentRating) {
    return {
      ok: true,
      value: Object.freeze({
        version: VIRA_COMMERCIAL_PREFLIGHT_VERSION,
        decision: "insufficient-evidence",
        reason: "MISSING_CANONICAL_RATING",
        planRef: policy.planRef,
        meteringRef: proposalRef.value,
        asOf,
        proposedQuantity: root.proposal.quantity,
        currentRating: null,
        projectedRating: null,
        currentQuote: currentQuote.value,
        projectedQuote: null,
        budget: policy.budget,
      }),
    };
  }

  const projected = projectedRating(currentRating, root.proposal.quantity);
  if ("ok" in projected) return projected;
  const projectedRatings = ratings.map((rating) => sameRef(rating.meteringRef, proposalRef.value) ? projected : rating);
  const projectedQuote = priceViraCommercialUsage(priceCatalogInput, {
    planRef: policy.planRef,
    asOf,
    ratings: projectedRatings,
  });
  if (!projectedQuote.ok) {
    if (projectedQuote.issue.code === "MISSING_RATING") {
      return {
        ok: true,
        value: Object.freeze({
          version: VIRA_COMMERCIAL_PREFLIGHT_VERSION,
          decision: "insufficient-evidence",
          reason: "MISSING_CANONICAL_RATING",
          planRef: policy.planRef,
          meteringRef: proposalRef.value,
          asOf,
          proposedQuantity: root.proposal.quantity,
          currentRating,
          projectedRating: projected,
          currentQuote: currentQuote.value,
          projectedQuote: null,
          budget: policy.budget,
        }),
      };
    }
    return fail("PRICING_FAILED", "$request", `projected pricing failed: ${projectedQuote.issue.code}`);
  }
  if (projectedQuote.value.currency !== policy.budget.currency) {
    return fail("CURRENCY_MISMATCH", "$dependencies.policySource", "projected quote currency does not match budget currency");
  }

  const quotaBlocked = currentRating.limitQuantity !== null
    && (currentRating.usedQuantity >= currentRating.limitQuantity || projected.usedQuantity > currentRating.limitQuantity);
  const decision: ViraCommercialPreflightDecision = quotaBlocked
    ? "limit-reached"
    : projectedQuote.value.totalAmountNanos > policy.budget.maxAmountNanos
      ? "over-budget"
      : "allowed";
  const reason: ViraCommercialPreflightReason = quotaBlocked
    ? currentRating.limitQuantity !== null && currentRating.usedQuantity >= currentRating.limitQuantity
      ? "CURRENT_QUOTA_EXHAUSTED"
      : "PROJECTED_QUOTA_EXCEEDED"
    : decision === "over-budget"
      ? "PROJECTED_BUDGET_EXCEEDED"
      : "WITHIN_QUOTA_AND_BUDGET";

  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_COMMERCIAL_PREFLIGHT_VERSION,
      decision,
      reason,
      planRef: policy.planRef,
      meteringRef: proposalRef.value,
      asOf,
      proposedQuantity: root.proposal.quantity,
      currentRating,
      projectedRating: projected,
      currentQuote: currentQuote.value,
      projectedQuote: projectedQuote.value,
      budget: policy.budget,
    }),
  };
}
