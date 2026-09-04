import type { ViraApplicationExactReference } from "@vira-enterprise-genui/application-package";
import {
  parseViraCommercialUsageRating,
  type ViraCommercialUsageRating,
} from "@vira-enterprise-genui/commercial-metering";
import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  VIRA_COMMERCIAL_PRICING_BASES,
  VIRA_COMMERCIAL_PRICING_MAX_PLANS,
  VIRA_COMMERCIAL_PRICING_MAX_RATES_PER_PLAN,
  VIRA_COMMERCIAL_PRICING_MAX_RATINGS,
  VIRA_COMMERCIAL_PRICING_SCHEMA_VERSION,
  type ViraCommercialMeterRate,
  type ViraCommercialPriceCatalog,
  type ViraCommercialPriceCatalogResult,
  type ViraCommercialPriceLine,
  type ViraCommercialPricePlan,
  type ViraCommercialPriceQuote,
  type ViraCommercialPriceQuoteResult,
  type ViraCommercialPricingBasis,
  type ViraCommercialPricingIssue,
  type ViraCommercialPricingIssueCode,
  type ViraCommercialPricingRequest,
  type ViraCommercialPricingSerializationResult,
} from "./types.js";

const VERSION_REF = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const FLOATING_ALIASES = new Set(["latest", "current", "stable", "head", "main", "next"]);
const CURRENCY = /^[A-Z]{3}$/;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const CATALOG_FIELDS = ["schemaVersion", "plans"] as const;
const PLAN_FIELDS = ["planRef", "currency", "fixedAmountNanos", "rates"] as const;
const RATE_FIELDS = ["meteringRef", "basis", "amountNanosPerUnit"] as const;
const REQUEST_FIELDS = ["planRef", "asOf", "ratings"] as const;
const REFERENCE_FIELDS = ["id", "versionRef"] as const;

type Failure = { readonly ok: false; readonly issue: ViraCommercialPricingIssue };
type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function fail(code: ViraCommercialPricingIssueCode, path: string, message: string): Failure {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function object(value: JsonValue | undefined): JsonObject | null {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function shape(value: JsonObject, allowed: readonly string[]): string | null {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) return key;
  for (const key of allowed) if (!Object.hasOwn(value, key)) return key;
  return null;
}

function exactVersionRef(value: JsonValue | undefined): value is string {
  if (typeof value !== "string" || !VERSION_REF.test(value)) return false;
  if (FLOATING_ALIASES.has(value.toLowerCase())) return false;
  return !/(?:^|[._:+-])[xX](?:$|[._:+-])/.test(value)
    && !/\d[xX](?:$|[._:+-])/.test(value);
}

function floatingVersionRef(value: JsonValue | undefined): boolean {
  if (typeof value !== "string" || !VERSION_REF.test(value)) return false;
  return FLOATING_ALIASES.has(value.toLowerCase())
    || /(?:^|[._:+-])[xX](?:$|[._:+-])/.test(value)
    || /\d[xX](?:$|[._:+-])/.test(value);
}

function parseReference(value: JsonValue | undefined, path: string): Parsed<ViraApplicationExactReference> {
  const item = object(value);
  if (!item) return fail("INVALID_REFERENCE", path, "reference must be an exact object");
  const unexpected = shape(item, REFERENCE_FIELDS);
  if (unexpected) return fail("INVALID_REFERENCE", `${path}.${unexpected}`, "reference shape is invalid");
  if (typeof item.id !== "string" || !isSemanticNamespace(item.id)) {
    return fail("INVALID_REFERENCE", `${path}.id`, "reference id must be a canonical semantic namespace");
  }
  if (!exactVersionRef(item.versionRef)) {
    return fail(
      floatingVersionRef(item.versionRef) ? "FLOATING_REFERENCE" : "INVALID_REFERENCE",
      `${path}.versionRef`,
      "reference version must be exact and non-floating",
    );
  }
  return { ok: true, value: Object.freeze({ id: item.id, versionRef: item.versionRef }) };
}

function refKey(value: ViraApplicationExactReference): string {
  return `${value.id}\u0000${value.versionRef}`;
}

function compareRef(left: ViraApplicationExactReference, right: ViraApplicationExactReference): number {
  const leftKey = refKey(left);
  const rightKey = refKey(right);
  return leftKey === rightKey ? 0 : leftKey < rightKey ? -1 : 1;
}

function nonNegativeSafeInteger(value: JsonValue | undefined, path: string): Parsed<number> {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return fail("INVALID_AMOUNT", path, "monetary nanos must be a non-negative safe integer");
  }
  return { ok: true, value };
}

function canonicalUtc(value: JsonValue | undefined, path: string): Parsed<string> {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)) {
    return fail("INVALID_REQUEST", path, "asOf must be canonical UTC ISO-8601 with seconds and optional milliseconds");
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return fail("INVALID_REQUEST", path, "asOf is invalid");
  const canonical = new Date(milliseconds).toISOString();
  const normalizedInput = value.includes(".") ? value : value.replace("Z", ".000Z");
  if (canonical !== normalizedInput) return fail("INVALID_REQUEST", path, "asOf does not represent a valid canonical UTC instant");
  return { ok: true, value: canonical };
}

function pricingBasis(value: JsonValue | undefined): value is ViraCommercialPricingBasis {
  return typeof value === "string" && VIRA_COMMERCIAL_PRICING_BASES.includes(value as ViraCommercialPricingBasis);
}

function parseRate(value: JsonValue | undefined, path: string): Parsed<ViraCommercialMeterRate> {
  const item = object(value);
  if (!item) return fail("INVALID_RATE", path, "meter rate must be an exact object");
  const unexpected = shape(item, RATE_FIELDS);
  if (unexpected) return fail("INVALID_RATE", `${path}.${unexpected}`, "meter rate shape is invalid");
  const meteringRef = parseReference(item.meteringRef, `${path}.meteringRef`);
  if (!meteringRef.ok) return meteringRef;
  if (!pricingBasis(item.basis)) return fail("INVALID_RATE", `${path}.basis`, "rate basis must be used or excess");
  const amount = nonNegativeSafeInteger(item.amountNanosPerUnit, `${path}.amountNanosPerUnit`);
  if (!amount.ok) return amount;
  return {
    ok: true,
    value: Object.freeze({
      meteringRef: meteringRef.value,
      basis: item.basis,
      amountNanosPerUnit: amount.value,
    }),
  };
}

function parsePlan(value: JsonValue | undefined, path: string): Parsed<ViraCommercialPricePlan> {
  const item = object(value);
  if (!item) return fail("INVALID_PLAN", path, "price plan must be an exact object");
  const unexpected = shape(item, PLAN_FIELDS);
  if (unexpected) return fail("INVALID_PLAN", `${path}.${unexpected}`, "price plan shape is invalid");
  const planRef = parseReference(item.planRef, `${path}.planRef`);
  if (!planRef.ok) return planRef;
  if (typeof item.currency !== "string" || !CURRENCY.test(item.currency)) {
    return fail("INVALID_CURRENCY", `${path}.currency`, "currency must be exactly three uppercase ASCII letters");
  }
  const fixedAmount = nonNegativeSafeInteger(item.fixedAmountNanos, `${path}.fixedAmountNanos`);
  if (!fixedAmount.ok) return fixedAmount;
  if (!Array.isArray(item.rates)) return fail("INVALID_PLAN", `${path}.rates`, "rates must be an array");
  if (item.rates.length > VIRA_COMMERCIAL_PRICING_MAX_RATES_PER_PLAN) {
    return fail("RATE_LIMIT_EXCEEDED", `${path}.rates`, `rate count exceeds ${VIRA_COMMERCIAL_PRICING_MAX_RATES_PER_PLAN}`);
  }
  const rates: ViraCommercialMeterRate[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < item.rates.length; index += 1) {
    const parsed = parseRate(item.rates[index] as JsonValue, `${path}.rates[${index}]`);
    if (!parsed.ok) return parsed;
    const key = refKey(parsed.value.meteringRef);
    if (seen.has(key)) return fail("DUPLICATE_RATE", `${path}.rates[${index}].meteringRef`, "duplicate exact meteringRef rate");
    seen.add(key);
    rates.push(parsed.value);
  }
  rates.sort((left, right) => compareRef(left.meteringRef, right.meteringRef));
  return {
    ok: true,
    value: Object.freeze({
      planRef: planRef.value,
      currency: item.currency,
      fixedAmountNanos: fixedAmount.value,
      rates: Object.freeze(rates),
    }),
  };
}

export function parseViraCommercialPriceCatalog(input: unknown): ViraCommercialPriceCatalogResult {
  const json = parseJsonValue(input);
  if (!json.ok) return fail("INVALID_INPUT", json.issue.path, json.issue.reason);
  const root = object(json.value);
  if (!root) return fail("INVALID_INPUT", "$", "price catalog must be an exact object");
  const unexpected = shape(root, CATALOG_FIELDS);
  if (unexpected) return fail("UNKNOWN_FIELD", `$.${unexpected}`, "price catalog shape is invalid");
  if (root.schemaVersion !== VIRA_COMMERCIAL_PRICING_SCHEMA_VERSION) {
    return fail("INVALID_SCHEMA_VERSION", "$.schemaVersion", `schemaVersion must be ${VIRA_COMMERCIAL_PRICING_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(root.plans)) return fail("INVALID_INPUT", "$.plans", "plans must be an array");
  if (root.plans.length > VIRA_COMMERCIAL_PRICING_MAX_PLANS) {
    return fail("PLAN_LIMIT_EXCEEDED", "$.plans", `plan count exceeds ${VIRA_COMMERCIAL_PRICING_MAX_PLANS}`);
  }
  const plans: ViraCommercialPricePlan[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < root.plans.length; index += 1) {
    const parsed = parsePlan(root.plans[index] as JsonValue, `$.plans[${index}]`);
    if (!parsed.ok) return parsed;
    const key = refKey(parsed.value.planRef);
    if (seen.has(key)) return fail("DUPLICATE_PLAN", `$.plans[${index}].planRef`, "duplicate exact planRef");
    seen.add(key);
    plans.push(parsed.value);
  }
  plans.sort((left, right) => compareRef(left.planRef, right.planRef));
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: VIRA_COMMERCIAL_PRICING_SCHEMA_VERSION,
      plans: Object.freeze(plans),
    }),
  };
}

export function serializeViraCommercialPriceCatalog(
  input: unknown,
): ViraCommercialPricingSerializationResult<ViraCommercialPriceCatalog> {
  const parsed = parseViraCommercialPriceCatalog(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value), data: parsed.value };
}

function parsePricingRequest(input: unknown): Parsed<ViraCommercialPricingRequest> {
  const json = parseJsonValue(input, "$request");
  if (!json.ok) return fail("INVALID_REQUEST", json.issue.path, json.issue.reason);
  const root = object(json.value);
  if (!root) return fail("INVALID_REQUEST", "$request", "pricing request must be an exact object");
  const unexpected = shape(root, REQUEST_FIELDS);
  if (unexpected) return fail("INVALID_REQUEST", `$request.${unexpected}`, "pricing request shape is invalid");
  const planRef = parseReference(root.planRef, "$request.planRef");
  if (!planRef.ok) return planRef;
  const asOf = canonicalUtc(root.asOf, "$request.asOf");
  if (!asOf.ok) return asOf;
  if (!Array.isArray(root.ratings)) return fail("INVALID_REQUEST", "$request.ratings", "ratings must be an array");
  if (root.ratings.length > VIRA_COMMERCIAL_PRICING_MAX_RATINGS) {
    return fail("RATING_LIMIT_EXCEEDED", "$request.ratings", `rating count exceeds ${VIRA_COMMERCIAL_PRICING_MAX_RATINGS}`);
  }
  const ratings: ViraCommercialUsageRating[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < root.ratings.length; index += 1) {
    const rating = parseViraCommercialUsageRating(root.ratings[index]);
    if (!rating.ok) {
      return fail("INVALID_RATING", `$request.ratings[${index}]`, `commercial metering rejected rating: ${rating.issue.code}`);
    }
    if (rating.value.asOf !== asOf.value) {
      return fail("RATING_TIME_MISMATCH", `$request.ratings[${index}].asOf`, "rating asOf must exactly match pricing request asOf");
    }
    const key = refKey(rating.value.meteringRef);
    if (seen.has(key)) return fail("DUPLICATE_RATING", `$request.ratings[${index}].meteringRef`, "duplicate exact meteringRef rating");
    seen.add(key);
    ratings.push(rating.value);
  }
  ratings.sort((left, right) => compareRef(left.meteringRef, right.meteringRef));
  return {
    ok: true,
    value: Object.freeze({
      planRef: planRef.value,
      asOf: asOf.value,
      ratings: Object.freeze(ratings),
    }),
  };
}

function safeMultiply(quantity: number, amountNanosPerUnit: number, path: string): Parsed<number> {
  if (quantity !== 0 && amountNanosPerUnit > Math.floor(Number.MAX_SAFE_INTEGER / quantity)) {
    return fail("AMOUNT_OVERFLOW", path, "pricing multiplication exceeds safe integer range");
  }
  return { ok: true, value: quantity * amountNanosPerUnit };
}

function safeAdd(left: number, right: number, path: string): Parsed<number> {
  if (right > Number.MAX_SAFE_INTEGER - left) {
    return fail("AMOUNT_OVERFLOW", path, "pricing total exceeds safe integer range");
  }
  return { ok: true, value: left + right };
}

export function priceViraCommercialUsage(
  catalogInput: unknown,
  requestInput: unknown,
): ViraCommercialPriceQuoteResult {
  const catalog = parseViraCommercialPriceCatalog(catalogInput);
  if (!catalog.ok) return catalog;
  const request = parsePricingRequest(requestInput);
  if (!request.ok) return request;
  const plan = catalog.value.plans.find((candidate) => refKey(candidate.planRef) === refKey(request.value.planRef));
  if (!plan) return fail("PLAN_NOT_FOUND", "$request.planRef", "exact planRef is not present in the price catalog");

  const rateKeys = new Set(plan.rates.map((rate) => refKey(rate.meteringRef)));
  for (let index = 0; index < request.value.ratings.length; index += 1) {
    if (!rateKeys.has(refKey(request.value.ratings[index]!.meteringRef))) {
      return fail("UNPRICED_RATING", `$request.ratings[${index}].meteringRef`, "rating meteringRef is not declared by the exact plan");
    }
  }

  const lines: ViraCommercialPriceLine[] = [];
  let total = plan.fixedAmountNanos;
  for (let index = 0; index < plan.rates.length; index += 1) {
    const rate = plan.rates[index]!;
    const rating = request.value.ratings.find((candidate) => refKey(candidate.meteringRef) === refKey(rate.meteringRef));
    if (!rating) return fail("MISSING_RATING", `$request.ratings`, `missing canonical rating for ${rate.meteringRef.id}@${rate.meteringRef.versionRef}`);
    const quantity = rate.basis === "used" ? rating.usedQuantity : rating.excessQuantity;
    const amount = safeMultiply(quantity, rate.amountNanosPerUnit, `$request.ratings[${index}]`);
    if (!amount.ok) return amount;
    const accumulated = safeAdd(total, amount.value, "$request.ratings");
    if (!accumulated.ok) return accumulated;
    total = accumulated.value;
    lines.push(Object.freeze({
      meteringRef: rate.meteringRef,
      unit: rating.unit,
      window: rating.window,
      basis: rate.basis,
      quantity,
      amountNanosPerUnit: rate.amountNanosPerUnit,
      amountNanos: amount.value,
    }));
  }

  const quote: ViraCommercialPriceQuote = Object.freeze({
    planRef: plan.planRef,
    currency: plan.currency,
    asOf: request.value.asOf,
    fixedAmountNanos: plan.fixedAmountNanos,
    lines: Object.freeze(lines),
    totalAmountNanos: total,
  });
  return { ok: true, value: quote };
}
