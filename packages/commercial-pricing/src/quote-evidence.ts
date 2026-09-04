import type { ViraApplicationExactReference } from "@vira-enterprise-genui/application-package";
import {
  VIRA_COMMERCIAL_METER_UNITS,
  VIRA_COMMERCIAL_METER_WINDOWS,
  type ViraCommercialMeterUnit,
  type ViraCommercialMeterWindow,
} from "@vira-enterprise-genui/commercial-metering";
import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  VIRA_COMMERCIAL_PRICING_BASES,
  VIRA_COMMERCIAL_PRICING_MAX_RATES_PER_PLAN,
  type ViraCommercialPriceLine,
  type ViraCommercialPriceQuote,
  type ViraCommercialPriceQuoteResult,
  type ViraCommercialPricingBasis,
  type ViraCommercialPricingIssue,
  type ViraCommercialPricingIssueCode,
  type ViraCommercialPricingSerializationResult,
} from "./types.js";

const VERSION_REF = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const FLOATING_ALIASES = new Set(["latest", "current", "stable", "head", "main", "next"]);
const CURRENCY = /^[A-Z]{3}$/;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const QUOTE_FIELDS = ["planRef", "currency", "asOf", "fixedAmountNanos", "lines", "totalAmountNanos"] as const;
const LINE_FIELDS = ["meteringRef", "unit", "window", "basis", "quantity", "amountNanosPerUnit", "amountNanos"] as const;
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
    return fail("INVALID_AMOUNT", path, "quote monetary/quantity value must be a non-negative safe integer");
  }
  return { ok: true, value };
}

function canonicalUtc(value: JsonValue | undefined, path: string): Parsed<string> {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)) {
    return fail("INVALID_QUOTE", path, "quote asOf must be canonical UTC ISO-8601 with seconds and optional milliseconds");
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return fail("INVALID_QUOTE", path, "quote asOf is invalid");
  const canonical = new Date(milliseconds).toISOString();
  const normalizedInput = value.includes(".") ? value : value.replace("Z", ".000Z");
  if (canonical !== normalizedInput) return fail("INVALID_QUOTE", path, "quote asOf does not represent a valid canonical UTC instant");
  return { ok: true, value: canonical };
}

function unit(value: JsonValue | undefined): value is ViraCommercialMeterUnit {
  return typeof value === "string" && VIRA_COMMERCIAL_METER_UNITS.includes(value as ViraCommercialMeterUnit);
}

function window(value: JsonValue | undefined): value is ViraCommercialMeterWindow {
  return typeof value === "string" && VIRA_COMMERCIAL_METER_WINDOWS.includes(value as ViraCommercialMeterWindow);
}

function basis(value: JsonValue | undefined): value is ViraCommercialPricingBasis {
  return typeof value === "string" && VIRA_COMMERCIAL_PRICING_BASES.includes(value as ViraCommercialPricingBasis);
}

function safeMultiply(quantity: number, perUnit: number, path: string): Parsed<number> {
  if (quantity !== 0 && perUnit > Math.floor(Number.MAX_SAFE_INTEGER / quantity)) {
    return fail("AMOUNT_OVERFLOW", path, "quote line multiplication exceeds safe integer range");
  }
  return { ok: true, value: quantity * perUnit };
}

function safeAdd(left: number, right: number, path: string): Parsed<number> {
  if (right > Number.MAX_SAFE_INTEGER - left) {
    return fail("AMOUNT_OVERFLOW", path, "quote total exceeds safe integer range");
  }
  return { ok: true, value: left + right };
}

function parseLine(value: JsonValue | undefined, path: string): Parsed<ViraCommercialPriceLine> {
  const item = object(value);
  if (!item) return fail("INVALID_QUOTE", path, "quote line must be an exact object");
  const unexpected = shape(item, LINE_FIELDS);
  if (unexpected) return fail("INVALID_QUOTE", `${path}.${unexpected}`, "quote line shape is invalid");
  const meteringRef = parseReference(item.meteringRef, `${path}.meteringRef`);
  if (!meteringRef.ok) return meteringRef;
  if (!unit(item.unit)) return fail("INVALID_QUOTE", `${path}.unit`, "quote line unit is invalid");
  if (!window(item.window)) return fail("INVALID_QUOTE", `${path}.window`, "quote line window is invalid");
  if (!basis(item.basis)) return fail("INVALID_QUOTE", `${path}.basis`, "quote line basis is invalid");
  const quantity = nonNegativeSafeInteger(item.quantity, `${path}.quantity`);
  if (!quantity.ok) return quantity;
  const perUnit = nonNegativeSafeInteger(item.amountNanosPerUnit, `${path}.amountNanosPerUnit`);
  if (!perUnit.ok) return perUnit;
  const amount = nonNegativeSafeInteger(item.amountNanos, `${path}.amountNanos`);
  if (!amount.ok) return amount;
  const expected = safeMultiply(quantity.value, perUnit.value, `${path}.amountNanos`);
  if (!expected.ok) return expected;
  if (amount.value !== expected.value) {
    return fail("INVALID_QUOTE", `${path}.amountNanos`, "quote line amount does not equal quantity × amountNanosPerUnit");
  }
  return {
    ok: true,
    value: Object.freeze({
      meteringRef: meteringRef.value,
      unit: item.unit,
      window: item.window,
      basis: item.basis,
      quantity: quantity.value,
      amountNanosPerUnit: perUnit.value,
      amountNanos: amount.value,
    }),
  };
}

export function parseViraCommercialPriceQuote(input: unknown): ViraCommercialPriceQuoteResult {
  const json = parseJsonValue(input);
  if (!json.ok) return fail("INVALID_QUOTE", json.issue.path, json.issue.reason);
  const root = object(json.value);
  if (!root) return fail("INVALID_QUOTE", "$", "price quote must be an exact object");
  const unexpected = shape(root, QUOTE_FIELDS);
  if (unexpected) return fail("INVALID_QUOTE", `$.${unexpected}`, "price quote shape is invalid");
  const planRef = parseReference(root.planRef, "$.planRef");
  if (!planRef.ok) return planRef;
  if (typeof root.currency !== "string" || !CURRENCY.test(root.currency)) {
    return fail("INVALID_CURRENCY", "$.currency", "currency must be exactly three uppercase ASCII letters");
  }
  const asOf = canonicalUtc(root.asOf, "$.asOf");
  if (!asOf.ok) return asOf;
  const fixed = nonNegativeSafeInteger(root.fixedAmountNanos, "$.fixedAmountNanos");
  if (!fixed.ok) return fixed;
  const total = nonNegativeSafeInteger(root.totalAmountNanos, "$.totalAmountNanos");
  if (!total.ok) return total;
  if (!Array.isArray(root.lines)) return fail("INVALID_QUOTE", "$.lines", "quote lines must be an array");
  if (root.lines.length > VIRA_COMMERCIAL_PRICING_MAX_RATES_PER_PLAN) {
    return fail("INVALID_QUOTE", "$.lines", `quote line count exceeds ${VIRA_COMMERCIAL_PRICING_MAX_RATES_PER_PLAN}`);
  }

  const lines: ViraCommercialPriceLine[] = [];
  const seen = new Set<string>();
  let expectedTotal = fixed.value;
  for (let index = 0; index < root.lines.length; index += 1) {
    const line = parseLine(root.lines[index] as JsonValue, `$.lines[${index}]`);
    if (!line.ok) return line;
    const key = refKey(line.value.meteringRef);
    if (seen.has(key)) return fail("INVALID_QUOTE", `$.lines[${index}].meteringRef`, "duplicate exact meteringRef quote line");
    seen.add(key);
    const accumulated = safeAdd(expectedTotal, line.value.amountNanos, "$.totalAmountNanos");
    if (!accumulated.ok) return accumulated;
    expectedTotal = accumulated.value;
    lines.push(line.value);
  }
  if (total.value !== expectedTotal) {
    return fail("INVALID_QUOTE", "$.totalAmountNanos", "quote total does not equal fixed amount plus line amounts");
  }
  lines.sort((left, right) => compareRef(left.meteringRef, right.meteringRef));

  const quote: ViraCommercialPriceQuote = Object.freeze({
    planRef: planRef.value,
    currency: root.currency,
    asOf: asOf.value,
    fixedAmountNanos: fixed.value,
    lines: Object.freeze(lines),
    totalAmountNanos: total.value,
  });
  return { ok: true, value: quote };
}

export function serializeViraCommercialPriceQuote(
  input: unknown,
): ViraCommercialPricingSerializationResult<ViraCommercialPriceQuote> {
  const parsed = parseViraCommercialPriceQuote(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value), data: parsed.value };
}
