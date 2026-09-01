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

const ARRAY_IS_ARRAY = Array.isArray;
const JSON_PARSE = JSON.parse;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const OBJECT_CREATE = Object.create;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const OBJECT_HAS_OWN = Object.hasOwn;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const STRING_CONVERT = String;
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
  const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(object, key);
  return descriptor && OBJECT_HAS_OWN(descriptor, "value") ? descriptor : undefined;
}

function defineOwnData(target: object, key: PropertyKey, value: unknown): void {
  OBJECT_DEFINE_PROPERTY(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function parsedObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !ARRAY_IS_ARRAY(value);
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
    && NUMBER_IS_SAFE_INTEGER(descriptor.value)
    && descriptor.value >= 0
    ? descriptor.value
    : undefined;
}

function appendOwnArrayValue<T>(array: T[], value: T): void {
  defineOwnData(array, STRING_CONVERT(array.length), value);
}

function hasOwnStringValue(values: readonly string[], expected: string): boolean {
  const length = ownArrayLength(values);
  if (length === undefined) return false;
  for (let index = 0; index < length; index += 1) {
    const descriptor = ownData(values, STRING_CONVERT(index));
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
    parsed = JSON_PARSE(input) as unknown;
  } catch {
    return undefined;
  }
  if (!parsedObject(parsed)) return undefined;

  const names = REFLECT_OWN_KEYS(parsed);
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    if (name === undefined || !queryField(name)) return undefined;
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
      || !NUMBER_IS_SAFE_INTEGER(limitDescriptor.value)
      || limitDescriptor.value < 1
      || limitDescriptor.value > EXPERIENCE_MARKETPLACE_QUERY_LIMIT_MAX
    )
  ) return undefined;

  const normalized = OBJECT_CREATE(null) as Record<string, unknown>;
  if (textDescriptor) defineOwnData(normalized, "text", textDescriptor.value);
  if (publisherDescriptor) defineOwnData(normalized, "publisherId", publisherDescriptor.value);
  if (tagDescriptor) defineOwnData(normalized, "tag", tagDescriptor.value);
  if (limitDescriptor) defineOwnData(normalized, "limit", limitDescriptor.value);
  return OBJECT_FREEZE(normalized) as unknown as ExperienceMarketplaceQuery;
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
    const descriptor = ownData(catalogInput.entries, STRING_CONVERT(index));
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
    value: OBJECT_FREEZE({ entries: OBJECT_FREEZE(matches) }),
  };
}
