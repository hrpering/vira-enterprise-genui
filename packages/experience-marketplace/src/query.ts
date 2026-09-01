import { isCanonicalExperienceMarketplaceCatalog } from "./catalog.js";
import type {
  ExperienceMarketplaceEntry,
  ExperienceMarketplaceQuery,
  ExperienceMarketplaceQueryResult,
} from "./types.js";
import {
  EXPERIENCE_MARKETPLACE_QUERY_FILTER_MAX_LENGTH,
  EXPERIENCE_MARKETPLACE_QUERY_JSON_MAX_LENGTH,
  EXPERIENCE_MARKETPLACE_QUERY_LIMIT_MAX,
  EXPERIENCE_MARKETPLACE_QUERY_TEXT_MAX_LENGTH,
} from "./types.js";

const REFLECT_APPLY = Reflect.apply;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const STRING_INCLUDES = String.prototype.includes;
const STRING_TO_LOWER_CASE = String.prototype.toLowerCase;
const STRING_TRIM = String.prototype.trim;

function failure(
  code: "INVALID_CATALOG" | "INVALID_QUERY",
  path: "$.catalog" | "$.query",
  message: string,
): ExperienceMarketplaceQueryResult {
  return { ok: false, issue: { code, path, message } };
}

function ownData(object: object, key: PropertyKey): PropertyDescriptor | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && "value" in descriptor ? descriptor : undefined;
}

function defineOwnData(target: object, key: PropertyKey, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function parsedObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function trimString(value: string): string {
  return REFLECT_APPLY(STRING_TRIM, value, []) as string;
}

function lowerString(value: string): string {
  return REFLECT_APPLY(STRING_TO_LOWER_CASE, value, []) as string;
}

function stringIncludes(value: string, expected: string): boolean {
  return REFLECT_APPLY(STRING_INCLUDES, value, [expected]) as boolean;
}

function boundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && value === trimString(value);
}

function queryField(value: PropertyKey): boolean {
  return value === "text"
    || value === "publisherId"
    || value === "tag"
    || value === "limit";
}

function ownArrayLength(value: readonly unknown[]): number | undefined {
  const descriptor = ownData(value, "length");
  return descriptor
    && typeof descriptor.value === "number"
    && Number.isSafeInteger(descriptor.value)
    && descriptor.value >= 0
    ? descriptor.value
    : undefined;
}

function appendOwnArrayValue<T>(array: T[], value: T): void {
  defineOwnData(array, String(array.length), value);
}

function hasOwnStringValue(values: readonly string[], expected: string): boolean {
  const length = ownArrayLength(values);
  if (length === undefined) return false;
  for (let index = 0; index < length; index += 1) {
    const descriptor = ownData(values, String(index));
    if (!descriptor || typeof descriptor.value !== "string") return false;
    if (descriptor.value === expected) return true;
  }
  return false;
}

function parseQueryJson(input: unknown): ExperienceMarketplaceQuery | undefined {
  if (
    typeof input !== "string"
    || input.length === 0
    || input.length > EXPERIENCE_MARKETPLACE_QUERY_JSON_MAX_LENGTH
  ) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch {
    return undefined;
  }
  if (!parsedObject(parsed)) return undefined;

  const names = REFLECT_OWN_KEYS(parsed);
  for (let index = 0; index < names.length; index += 1) {
    if (!queryField(names[index])) return undefined;
  }

  const textDescriptor = ownData(parsed, "text");
  const publisherDescriptor = ownData(parsed, "publisherId");
  const tagDescriptor = ownData(parsed, "tag");
  const limitDescriptor = ownData(parsed, "limit");

  if (textDescriptor && !boundedString(textDescriptor.value, EXPERIENCE_MARKETPLACE_QUERY_TEXT_MAX_LENGTH)) {
    return undefined;
  }
  if (
    publisherDescriptor
    && !boundedString(publisherDescriptor.value, EXPERIENCE_MARKETPLACE_QUERY_FILTER_MAX_LENGTH)
  ) return undefined;
  if (tagDescriptor && !boundedString(tagDescriptor.value, EXPERIENCE_MARKETPLACE_QUERY_FILTER_MAX_LENGTH)) {
    return undefined;
  }
  if (
    limitDescriptor
    && (
      typeof limitDescriptor.value !== "number"
      || !Number.isSafeInteger(limitDescriptor.value)
      || limitDescriptor.value < 1
      || limitDescriptor.value > EXPERIENCE_MARKETPLACE_QUERY_LIMIT_MAX
    )
  ) return undefined;

  const normalized = Object.create(null) as Record<string, unknown>;
  if (textDescriptor) defineOwnData(normalized, "text", textDescriptor.value);
  if (publisherDescriptor) defineOwnData(normalized, "publisherId", publisherDescriptor.value);
  if (tagDescriptor) defineOwnData(normalized, "tag", tagDescriptor.value);
  if (limitDescriptor) defineOwnData(normalized, "limit", limitDescriptor.value);
  return Object.freeze(normalized) as unknown as ExperienceMarketplaceQuery;
}

export function queryExperienceMarketplaceCatalog(
  catalogInput: unknown,
  queryJsonInput: unknown,
): ExperienceMarketplaceQueryResult {
  if (!isCanonicalExperienceMarketplaceCatalog(catalogInput)) {
    return failure(
      "INVALID_CATALOG",
      "$.catalog",
      "experience marketplace queries require a canonical Marketplace catalog",
    );
  }
  const query = parseQueryJson(queryJsonInput);
  if (!query) return failure("INVALID_QUERY", "$.query", "experience marketplace query JSON is invalid");

  const text = query.text === undefined ? undefined : lowerString(query.text);
  const matches: ExperienceMarketplaceEntry[] = [];
  const entryCount = ownArrayLength(catalogInput.entries);
  if (entryCount === undefined) {
    return failure("INVALID_CATALOG", "$.catalog", "canonical Marketplace catalog could not be read safely");
  }

  for (let index = 0; index < entryCount; index += 1) {
    const descriptor = ownData(catalogInput.entries, String(index));
    if (!descriptor) {
      return failure("INVALID_CATALOG", "$.catalog", "canonical Marketplace catalog could not be read safely");
    }
    const entry = descriptor.value as ExperienceMarketplaceEntry;
    if (query.publisherId !== undefined && entry.publisherId !== query.publisherId) continue;
    if (query.tag !== undefined && !hasOwnStringValue(entry.tags, query.tag)) continue;
    if (
      text !== undefined
      && !stringIncludes(lowerString(entry.id), text)
      && !stringIncludes(lowerString(entry.name), text)
      && !stringIncludes(lowerString(entry.publisherName), text)
    ) continue;
    appendOwnArrayValue(matches, entry);
    if (query.limit !== undefined && matches.length >= query.limit) break;
  }

  return {
    ok: true,
    value: Object.freeze({ entries: Object.freeze(matches) }),
  };
}
