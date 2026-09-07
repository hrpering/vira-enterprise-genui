import {
  parseViraApplicationExactReference,
  parseViraApplicationReleaseReference,
  serializeViraApplicationExactReference,
  type ViraApplicationExactReference,
} from "@vira-enterprise-genui/application-package";
import {
  parseViraCommercialUsageBatch,
  type ViraCommercialUsageAttribution,
  type ViraCommercialUsageRecord,
} from "@vira-enterprise-genui/commercial-metering";
import {
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import { parseViraCommercialPriceQuote } from "./quote-evidence.js";
import type { ViraCommercialPriceLine, ViraCommercialPriceQuote } from "./types.js";

export const VIRA_COMMERCIAL_INVOICE_EXPORT_VERSION = "1" as const;
export const VIRA_COMMERCIAL_INVOICE_EXPORT_MAX_USAGE_LINES = 2_048 as const;
export const VIRA_COMMERCIAL_INVOICE_EXPORT_MAX_APPLICATIONS = 256 as const;
export const VIRA_COMMERCIAL_INVOICE_EXPORT_MAX_SETTLEMENT_REFS = 256 as const;

const SHA256_HEX = /^[a-f0-9]{64}$/;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CURRENCY = /^[A-Z]{3}$/;

type Scope = ViraCommercialUsageRecord["scope"];
type Principal = ViraCommercialUsageRecord["principal"];

export interface ViraCommercialInvoiceDigestProvider {
  readonly sha256: (canonicalInput: string) => Promise<unknown> | unknown;
}

export interface ViraCommercialInvoiceApplicationRef {
  readonly id: string;
  readonly version: string;
}

export interface ViraCommercialInvoiceUsageLine {
  readonly sourceEventId: string;
  readonly usage: ViraCommercialUsageRecord;
  readonly attribution: ViraCommercialUsageAttribution;
}

export interface ViraCommercialInvoiceExport {
  readonly version: typeof VIRA_COMMERCIAL_INVOICE_EXPORT_VERSION;
  readonly exportId: string;
  readonly revision: number;
  readonly scope: Scope;
  readonly customer: Principal;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly currency: string;
  readonly planRef: ViraApplicationExactReference;
  readonly applicationRefs: readonly ViraCommercialInvoiceApplicationRef[];
  readonly sourceSetDigest: string;
  readonly usageLines: readonly ViraCommercialInvoiceUsageLine[];
  readonly fixedAmountNanos: number;
  readonly priceLines: readonly ViraCommercialPriceLine[];
  readonly settlementEvidenceRefs: readonly ViraApplicationExactReference[];
  readonly subtotalNanos: number;
  readonly totalAmountNanos: number;
  readonly createdAt: string;
  readonly contentDigest: string;
}

export interface ViraCommercialInvoiceExportInput {
  readonly exportId: string;
  readonly revision: number;
  readonly scope: Scope;
  readonly customer: Principal;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly applicationRefs: readonly ViraCommercialInvoiceApplicationRef[];
  readonly usageLines: readonly ViraCommercialInvoiceUsageLine[];
  readonly quote: ViraCommercialPriceQuote;
  readonly settlementEvidenceRefs: readonly ViraApplicationExactReference[];
  readonly createdAt: string;
}

export type ViraCommercialInvoiceExportIssueCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_IDENTITY"
  | "INVALID_SCOPE"
  | "INVALID_PRINCIPAL"
  | "INVALID_TIMESTAMP"
  | "INVALID_PERIOD"
  | "INVALID_REFERENCE"
  | "FLOATING_REFERENCE"
  | "LIMIT_EXCEEDED"
  | "DUPLICATE_REFERENCE"
  | "INVALID_USAGE"
  | "USAGE_SCOPE_MISMATCH"
  | "USAGE_PERIOD_MISMATCH"
  | "DUPLICATE_USAGE"
  | "INVALID_ATTRIBUTION"
  | "INVALID_QUOTE"
  | "CURRENCY_MISMATCH"
  | "AMOUNT_OVERFLOW"
  | "DIGEST_FAILED"
  | "INVALID_DIGEST"
  | "CONTENT_DIGEST_MISMATCH";

export interface ViraCommercialInvoiceExportIssue {
  readonly code: ViraCommercialInvoiceExportIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraCommercialInvoiceExportResult =
  | { readonly ok: true; readonly value: ViraCommercialInvoiceExport }
  | { readonly ok: false; readonly issue: ViraCommercialInvoiceExportIssue };

export type ViraCommercialInvoiceExportSerializationResult =
  | { readonly ok: true; readonly value: string; readonly data: ViraCommercialInvoiceExport }
  | { readonly ok: false; readonly issue: ViraCommercialInvoiceExportIssue };

type Failure = { readonly ok: false; readonly issue: ViraCommercialInvoiceExportIssue };
type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

const ROOT_FIELDS = [
  "version", "exportId", "revision", "scope", "customer", "periodStart", "periodEnd", "currency",
  "planRef", "applicationRefs", "sourceSetDigest", "usageLines", "fixedAmountNanos", "priceLines", "settlementEvidenceRefs",
  "subtotalNanos", "totalAmountNanos", "createdAt", "contentDigest",
] as const;
const SCOPE_FIELDS = ["version", "organizationId", "projectId", "environment"] as const;
const PRINCIPAL_FIELDS = ["version", "kind", "id", "organizationId"] as const;
const APPLICATION_FIELDS = ["id", "version"] as const;
const USAGE_LINE_FIELDS = ["sourceEventId", "usage", "attribution"] as const;
const ATTRIBUTION_FIELDS = ["publisherId", "providerId", "modelId", "nodeId", "platformId"] as const;

function fail(code: ViraCommercialInvoiceExportIssueCode, path: string, message: string): Failure {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function object(value: JsonValue | undefined): JsonObject | null {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function exactShape(value: JsonObject, fields: readonly string[]): string | null {
  const expected = new Set(fields);
  for (const key of Object.keys(value)) if (!expected.has(key)) return key;
  for (const key of fields) if (!Object.hasOwn(value, key)) return key;
  return null;
}

function canonicalUtc(value: JsonValue | undefined, path: string): Parsed<string> {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)) {
    return fail("INVALID_TIMESTAMP", path, "timestamp must be canonical UTC ISO-8601");
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return fail("INVALID_TIMESTAMP", path, "timestamp is invalid");
  const canonical = new Date(milliseconds).toISOString();
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  return canonical === normalized
    ? { ok: true, value: canonical }
    : fail("INVALID_TIMESTAMP", path, "timestamp is not canonical");
}

function parseScope(value: JsonValue | undefined, path: string): Parsed<Scope> {
  const item = object(value);
  if (!item || exactShape(item, SCOPE_FIELDS)) return fail("INVALID_SCOPE", path, "scope shape is invalid");
  if (
    item.version !== "1"
    || typeof item.organizationId !== "string" || !SAFE_TOKEN.test(item.organizationId)
    || typeof item.projectId !== "string" || !SAFE_TOKEN.test(item.projectId)
    || !new Set(["dev", "staging", "production"]).has(String(item.environment))
  ) return fail("INVALID_SCOPE", path, "scope is invalid");
  return { ok: true, value: Object.freeze({
    version: "1",
    organizationId: item.organizationId,
    projectId: item.projectId,
    environment: item.environment as Scope["environment"],
  }) };
}

function parsePrincipal(value: JsonValue | undefined, path: string): Parsed<Principal> {
  const item = object(value);
  if (!item || exactShape(item, PRINCIPAL_FIELDS)) return fail("INVALID_PRINCIPAL", path, "principal shape is invalid");
  if (
    item.version !== "1"
    || !new Set(["user", "agent", "service"]).has(String(item.kind))
    || typeof item.id !== "string" || !SAFE_TOKEN.test(item.id)
    || typeof item.organizationId !== "string" || !SAFE_TOKEN.test(item.organizationId)
  ) return fail("INVALID_PRINCIPAL", path, "principal is invalid");
  return { ok: true, value: Object.freeze({
    version: "1", kind: item.kind as Principal["kind"], id: item.id, organizationId: item.organizationId,
  }) };
}

function sameScope(left: Scope, right: Scope): boolean {
  return left.version === right.version && left.organizationId === right.organizationId
    && left.projectId === right.projectId && left.environment === right.environment;
}

function samePrincipal(left: Principal, right: Principal): boolean {
  return left.version === right.version && left.kind === right.kind
    && left.id === right.id && left.organizationId === right.organizationId;
}

function refKey(value: ViraApplicationExactReference): string {
  return `${value.id}\u0000${value.versionRef}`;
}

function applicationKey(value: ViraCommercialInvoiceApplicationRef): string {
  return `${value.id}\u0000${value.version}`;
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function parseExactRef(value: JsonValue | undefined, path: string): Parsed<ViraApplicationExactReference> {
  const parsed = parseViraApplicationExactReference(value);
  if (!parsed.ok) return fail(
    parsed.issue.code === "FLOATING_REFERENCE" ? "FLOATING_REFERENCE" : "INVALID_REFERENCE",
    path,
    `exact reference is invalid: ${parsed.issue.code}`,
  );
  return { ok: true, value: parsed.value };
}

function parseApplicationRef(value: JsonValue | undefined, path: string): Parsed<ViraCommercialInvoiceApplicationRef> {
  const item = object(value);
  if (!item || exactShape(item, APPLICATION_FIELDS)) return fail("INVALID_REFERENCE", path, "Application ref shape is invalid");
  const parsed = parseViraApplicationReleaseReference(item);
  if (!parsed.ok) return fail("INVALID_REFERENCE", path, `Application ref is invalid: ${parsed.issue.code}`);
  return { ok: true, value: Object.freeze({ id: parsed.value.id, version: parsed.value.version }) };
}

function parseAttribution(value: JsonValue | undefined, path: string): Parsed<ViraCommercialUsageAttribution> {
  const item = object(value);
  if (!item || exactShape(item, ATTRIBUTION_FIELDS)) return fail("INVALID_ATTRIBUTION", path, "attribution shape is invalid");
  for (const field of ATTRIBUTION_FIELDS) {
    const candidate = item[field];
    if (candidate !== null && (typeof candidate !== "string" || !SAFE_TOKEN.test(candidate))) {
      return fail("INVALID_ATTRIBUTION", `${path}.${field}`, "attribution values must be null or safe canonical tokens");
    }
  }
  return { ok: true, value: Object.freeze({
    publisherId: item.publisherId as string | null,
    providerId: item.providerId as string | null,
    modelId: item.modelId as string | null,
    nodeId: item.nodeId as string | null,
    platformId: item.platformId as string | null,
  }) };
}

function parseUsageLine(value: JsonValue | undefined, path: string): Parsed<ViraCommercialInvoiceUsageLine> {
  const item = object(value);
  if (!item || exactShape(item, USAGE_LINE_FIELDS)) return fail("INVALID_USAGE", path, "usage line shape is invalid");
  if (typeof item.sourceEventId !== "string" || !SAFE_TOKEN.test(item.sourceEventId)) {
    return fail("INVALID_USAGE", `${path}.sourceEventId`, "sourceEventId is invalid");
  }
  const batch = parseViraCommercialUsageBatch({ schemaVersion: "1", records: [item.usage] });
  if (!batch.ok || batch.value.records.length !== 1) {
    return fail("INVALID_USAGE", `${path}.usage`, `usage is invalid${batch.ok ? "" : `: ${batch.issue.code}`}`);
  }
  if (batch.value.records[0]!.usageId !== item.sourceEventId) {
    return fail("INVALID_USAGE", `${path}.sourceEventId`, "sourceEventId must match canonical usage identity");
  }
  const attribution = parseAttribution(item.attribution, `${path}.attribution`);
  if (!attribution.ok) return attribution;
  return { ok: true, value: Object.freeze({
    sourceEventId: item.sourceEventId,
    usage: batch.value.records[0]!,
    attribution: attribution.value,
  }) };
}

function safeMoney(value: JsonValue | undefined, path: string): Parsed<number> {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? { ok: true, value }
    : fail("AMOUNT_OVERFLOW", path, "amount must be a non-negative safe integer in nanos");
}

function canonicalUsageLine(line: ViraCommercialInvoiceUsageLine): JsonObject {
  return { sourceEventId: line.sourceEventId, usage: line.usage, attribution: line.attribution } as unknown as JsonObject;
}

function canonicalBody(value: Omit<ViraCommercialInvoiceExport, "exportId" | "revision" | "createdAt" | "contentDigest">): string {
  const plan = serializeViraApplicationExactReference(value.planRef);
  if (!plan.ok) throw new TypeError("invoice export contains an invalid planRef");
  const settlements = value.settlementEvidenceRefs.map((ref) => {
    const serialized = serializeViraApplicationExactReference(ref);
    if (!serialized.ok) throw new TypeError("invoice export contains an invalid settlement evidence ref");
    return serialized.value;
  });
  return `{"version":"1","scope":${JSON.stringify(value.scope)},"customer":${JSON.stringify(value.customer)},"periodStart":${JSON.stringify(value.periodStart)},"periodEnd":${JSON.stringify(value.periodEnd)},"currency":${JSON.stringify(value.currency)},"planRef":${plan.value},"applicationRefs":${JSON.stringify(value.applicationRefs)},"sourceSetDigest":${JSON.stringify(value.sourceSetDigest)},"usageLines":${JSON.stringify(value.usageLines.map(canonicalUsageLine))},"fixedAmountNanos":${value.fixedAmountNanos},"priceLines":${JSON.stringify(value.priceLines)},"settlementEvidenceRefs":[${settlements.join(",")}],"subtotalNanos":${value.subtotalNanos},"totalAmountNanos":${value.totalAmountNanos}}`;
}

function contentOf(
  value: ViraCommercialInvoiceExport,
): Omit<ViraCommercialInvoiceExport, "exportId" | "revision" | "createdAt" | "contentDigest"> {
  return {
    version: value.version,
    scope: value.scope,
    customer: value.customer,
    periodStart: value.periodStart,
    periodEnd: value.periodEnd,
    currency: value.currency,
    planRef: value.planRef,
    applicationRefs: value.applicationRefs,
    sourceSetDigest: value.sourceSetDigest,
    usageLines: value.usageLines,
    fixedAmountNanos: value.fixedAmountNanos,
    priceLines: value.priceLines,
    settlementEvidenceRefs: value.settlementEvidenceRefs,
    subtotalNanos: value.subtotalNanos,
    totalAmountNanos: value.totalAmountNanos,
  };
}

async function digest(provider: ViraCommercialInvoiceDigestProvider, input: string): Promise<Parsed<string>> {
  if (provider === null || typeof provider !== "object" || typeof provider.sha256 !== "function") {
    return fail("DIGEST_FAILED", "$digestProvider", "digest provider is invalid");
  }
  let value: unknown;
  try { value = await provider.sha256(input); } catch { return fail("DIGEST_FAILED", "$digestProvider", "digest provider failed closed"); }
  return typeof value === "string" && SHA256_HEX.test(value)
    ? { ok: true, value }
    : fail("INVALID_DIGEST", "$digestProvider", "digest provider must return lowercase SHA-256 hex");
}

function parseCore(input: unknown): Parsed<ViraCommercialInvoiceExport> {
  const json = parseJsonValue(input);
  if (!json.ok) return fail("INVALID_INPUT", json.issue.path, json.issue.reason);
  const root = object(json.value);
  if (!root) return fail("INVALID_INPUT", "$", "invoice export must be an exact object");
  const unexpected = exactShape(root, ROOT_FIELDS);
  if (unexpected) return fail("UNKNOWN_FIELD", `$.${unexpected}`, "invoice export shape is invalid");
  if (root.version !== VIRA_COMMERCIAL_INVOICE_EXPORT_VERSION) return fail("INVALID_VERSION", "$.version", "invoice export version is invalid");
  if (typeof root.exportId !== "string" || !SAFE_TOKEN.test(root.exportId) || typeof root.revision !== "number" || !Number.isSafeInteger(root.revision) || root.revision < 1) {
    return fail("INVALID_IDENTITY", "$", "exportId and revision are invalid");
  }
  const scope = parseScope(root.scope, "$.scope"); if (!scope.ok) return scope;
  const customer = parsePrincipal(root.customer, "$.customer"); if (!customer.ok) return customer;
  if (customer.value.organizationId !== scope.value.organizationId) return fail("INVALID_PRINCIPAL", "$.customer.organizationId", "customer conflicts with scope");
  const periodStart = canonicalUtc(root.periodStart, "$.periodStart"); if (!periodStart.ok) return periodStart;
  const periodEnd = canonicalUtc(root.periodEnd, "$.periodEnd"); if (!periodEnd.ok) return periodEnd;
  const createdAt = canonicalUtc(root.createdAt, "$.createdAt"); if (!createdAt.ok) return createdAt;
  if (periodStart.value >= periodEnd.value) return fail("INVALID_PERIOD", "$.periodEnd", "periodEnd must be after periodStart");
  if (typeof root.currency !== "string" || !CURRENCY.test(root.currency)) return fail("CURRENCY_MISMATCH", "$.currency", "currency is invalid");
  const planRef = parseExactRef(root.planRef, "$.planRef"); if (!planRef.ok) return planRef;

  if (!Array.isArray(root.applicationRefs) || root.applicationRefs.length === 0 || root.applicationRefs.length > VIRA_COMMERCIAL_INVOICE_EXPORT_MAX_APPLICATIONS) return fail("LIMIT_EXCEEDED", "$.applicationRefs", "applicationRefs count is invalid");
  const applicationRefs: ViraCommercialInvoiceApplicationRef[] = [];
  const applicationKeys = new Set<string>();
  for (let index = 0; index < root.applicationRefs.length; index += 1) {
    const ref = parseApplicationRef(root.applicationRefs[index] as JsonValue, `$.applicationRefs[${index}]`); if (!ref.ok) return ref;
    const key = applicationKey(ref.value); if (applicationKeys.has(key)) return fail("DUPLICATE_REFERENCE", `$.applicationRefs[${index}]`, "duplicate Application ref");
    applicationKeys.add(key); applicationRefs.push(ref.value);
  }
  applicationRefs.sort((a, b) => compareText(applicationKey(a), applicationKey(b)));

  if (!Array.isArray(root.usageLines) || root.usageLines.length > VIRA_COMMERCIAL_INVOICE_EXPORT_MAX_USAGE_LINES) return fail("LIMIT_EXCEEDED", "$.usageLines", "usageLines count is invalid");
  const usageLines: ViraCommercialInvoiceUsageLine[] = [];
  const sourceIds = new Set<string>(); const usageIds = new Set<string>();
  for (let index = 0; index < root.usageLines.length; index += 1) {
    const line = parseUsageLine(root.usageLines[index] as JsonValue, `$.usageLines[${index}]`); if (!line.ok) return line;
    if (!sameScope(line.value.usage.scope, scope.value) || !samePrincipal(line.value.usage.principal, customer.value)) return fail("USAGE_SCOPE_MISMATCH", `$.usageLines[${index}].usage`, "usage scope or principal conflicts with export");
    if (line.value.usage.occurredAt < periodStart.value || line.value.usage.occurredAt >= periodEnd.value) return fail("USAGE_PERIOD_MISMATCH", `$.usageLines[${index}].usage.occurredAt`, "usage falls outside the half-open export period");
    if (!applicationKeys.has(`${line.value.usage.applicationId}\u0000${line.value.usage.applicationVersion}`)) return fail("INVALID_REFERENCE", `$.usageLines[${index}].usage.applicationId`, "usage Application is not declared by export");
    if (sourceIds.has(line.value.sourceEventId) || usageIds.has(line.value.usage.usageId)) return fail("DUPLICATE_USAGE", `$.usageLines[${index}]`, "duplicate source or usage identity");
    sourceIds.add(line.value.sourceEventId); usageIds.add(line.value.usage.usageId); usageLines.push(line.value);
  }
  usageLines.sort((a, b) => compareText(`${a.usage.occurredAt}\u0000${a.sourceEventId}\u0000${a.usage.usageId}`, `${b.usage.occurredAt}\u0000${b.sourceEventId}\u0000${b.usage.usageId}`));

  const fixedAmount = safeMoney(root.fixedAmountNanos, "$.fixedAmountNanos"); if (!fixedAmount.ok) return fixedAmount;
  const quote = parseViraCommercialPriceQuote({ planRef: root.planRef, currency: root.currency, asOf: root.periodEnd, fixedAmountNanos: fixedAmount.value, lines: root.priceLines, totalAmountNanos: root.subtotalNanos });
  if (!quote.ok) return fail("INVALID_QUOTE", "$.priceLines", `price lines are invalid: ${quote.issue.code}`);
  if (refKey(quote.value.planRef) !== refKey(planRef.value) || quote.value.currency !== root.currency) return fail("CURRENCY_MISMATCH", "$.currency", "quote identity conflicts with export");
  const subtotal = safeMoney(root.subtotalNanos, "$.subtotalNanos"); if (!subtotal.ok) return subtotal;
  const total = safeMoney(root.totalAmountNanos, "$.totalAmountNanos"); if (!total.ok) return total;
  if (subtotal.value !== quote.value.totalAmountNanos || total.value !== subtotal.value) return fail("INVALID_QUOTE", "$.totalAmountNanos", "invoice totals must exactly equal canonical quote evidence");

  if (!Array.isArray(root.settlementEvidenceRefs) || root.settlementEvidenceRefs.length > VIRA_COMMERCIAL_INVOICE_EXPORT_MAX_SETTLEMENT_REFS) return fail("LIMIT_EXCEEDED", "$.settlementEvidenceRefs", "settlement evidence ref count is invalid");
  const settlementEvidenceRefs: ViraApplicationExactReference[] = []; const settlementKeys = new Set<string>();
  for (let index = 0; index < root.settlementEvidenceRefs.length; index += 1) {
    const ref = parseExactRef(root.settlementEvidenceRefs[index] as JsonValue, `$.settlementEvidenceRefs[${index}]`); if (!ref.ok) return ref;
    const key = refKey(ref.value); if (settlementKeys.has(key)) return fail("DUPLICATE_REFERENCE", `$.settlementEvidenceRefs[${index}]`, "duplicate settlement evidence ref");
    settlementKeys.add(key); settlementEvidenceRefs.push(ref.value);
  }
  settlementEvidenceRefs.sort((a, b) => compareText(refKey(a), refKey(b)));
  if (typeof root.sourceSetDigest !== "string" || !SHA256_HEX.test(root.sourceSetDigest)) return fail("INVALID_DIGEST", "$.sourceSetDigest", "sourceSetDigest is invalid");
  if (typeof root.contentDigest !== "string" || !SHA256_HEX.test(root.contentDigest)) return fail("INVALID_DIGEST", "$.contentDigest", "contentDigest is invalid");

  return { ok: true, value: Object.freeze({
    version: "1", exportId: root.exportId, revision: root.revision, scope: scope.value, customer: customer.value,
    periodStart: periodStart.value, periodEnd: periodEnd.value, currency: root.currency, planRef: planRef.value,
    applicationRefs: Object.freeze(applicationRefs), sourceSetDigest: root.sourceSetDigest,
    usageLines: Object.freeze(usageLines), fixedAmountNanos: fixedAmount.value, priceLines: quote.value.lines,
    settlementEvidenceRefs: Object.freeze(settlementEvidenceRefs), subtotalNanos: subtotal.value,
    totalAmountNanos: total.value, createdAt: createdAt.value, contentDigest: root.contentDigest,
  }) };
}

export async function createViraCommercialInvoiceExport(
  input: ViraCommercialInvoiceExportInput,
  digestProvider: ViraCommercialInvoiceDigestProvider,
): Promise<ViraCommercialInvoiceExportResult> {
  const quote = parseViraCommercialPriceQuote(input.quote);
  if (!quote.ok) return fail("INVALID_QUOTE", "$input.quote", `quote is invalid: ${quote.issue.code}`);
  if (quote.value.asOf !== input.periodEnd) {
    return fail("INVALID_QUOTE", "$input.quote.asOf", "quote asOf must exactly match export periodEnd");
  }
  const provisional = {
    version: "1", exportId: input.exportId, revision: input.revision, scope: input.scope, customer: input.customer,
    periodStart: input.periodStart, periodEnd: input.periodEnd, currency: quote.value.currency, planRef: quote.value.planRef,
    applicationRefs: input.applicationRefs, sourceSetDigest: "0".repeat(64), usageLines: input.usageLines,
    fixedAmountNanos: quote.value.fixedAmountNanos, priceLines: quote.value.lines, settlementEvidenceRefs: input.settlementEvidenceRefs,
    subtotalNanos: quote.value.totalAmountNanos, totalAmountNanos: quote.value.totalAmountNanos,
    createdAt: input.createdAt, contentDigest: "0".repeat(64),
  } as const;
  const parsed = parseCore(provisional); if (!parsed.ok) return parsed;
  const sourceCanonical = JSON.stringify(parsed.value.usageLines.map((line) => canonicalUsageLine(line)));
  const sourceSetDigest = await digest(digestProvider, sourceCanonical); if (!sourceSetDigest.ok) return sourceSetDigest;
  const body = { ...parsed.value, sourceSetDigest: sourceSetDigest.value };
  const contentDigest = await digest(digestProvider, canonicalBody(contentOf(body))); if (!contentDigest.ok) return contentDigest;
  return parseCore({ ...body, contentDigest: contentDigest.value });
}

export function parseViraCommercialInvoiceExport(input: unknown): ViraCommercialInvoiceExportResult {
  return parseCore(input);
}

export async function verifyViraCommercialInvoiceExport(
  input: unknown,
  digestProvider: ViraCommercialInvoiceDigestProvider,
): Promise<ViraCommercialInvoiceExportResult> {
  const parsed = parseCore(input); if (!parsed.ok) return parsed;
  const sourceDigest = await digest(digestProvider, JSON.stringify(parsed.value.usageLines.map((line) => canonicalUsageLine(line))));
  if (!sourceDigest.ok) return sourceDigest;
  if (sourceDigest.value !== parsed.value.sourceSetDigest) return fail("CONTENT_DIGEST_MISMATCH", "$.sourceSetDigest", "source set digest does not match canonical usage evidence");
  const contentDigest = await digest(digestProvider, canonicalBody(contentOf(parsed.value))); if (!contentDigest.ok) return contentDigest;
  return contentDigest.value === parsed.value.contentDigest
    ? parsed
    : fail("CONTENT_DIGEST_MISMATCH", "$.contentDigest", "content digest does not match canonical export content");
}

export function serializeViraCommercialInvoiceExport(input: unknown): ViraCommercialInvoiceExportSerializationResult {
  const parsed = parseCore(input); if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value), data: parsed.value };
}
