import {
  isCanonicalExperienceRegistrySnapshot,
  lookupExperienceRegistryManifest,
} from "@vira-enterprise-genui/experience-registry";
import type { ExperienceRegistrySnapshot } from "@vira-enterprise-genui/experience-registry";
import type {
  ExperienceMarketplaceCatalog,
  ExperienceMarketplaceCatalogResult,
  ExperienceMarketplaceEntry,
  ExperienceMarketplaceValidationCode,
} from "./types.js";
import {
  EXPERIENCE_MARKETPLACE_LISTINGS_JSON_MAX_LENGTH,
  EXPERIENCE_MARKETPLACE_MAX_LISTINGS,
  EXPERIENCE_MARKETPLACE_SCHEMA_VERSION,
} from "./types.js";

const CANONICAL_CATALOGS = new WeakSet<object>();
const REFLECT_APPLY = Reflect.apply;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const WEAK_SET_ADD = WeakSet.prototype.add;
const WEAK_SET_HAS = WeakSet.prototype.has;

type RegistryManifest = ExperienceRegistrySnapshot["manifests"][number];

function failure(
  code: ExperienceMarketplaceValidationCode,
  path: string,
  message: string,
): ExperienceMarketplaceCatalogResult {
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

function weakSetAdd(set: WeakSet<object>, value: object): void {
  REFLECT_APPLY(WEAK_SET_ADD, set, [value]);
}

function weakSetHas(set: WeakSet<object>, value: object): boolean {
  return REFLECT_APPLY(WEAK_SET_HAS, set, [value]) as boolean;
}

function parsedObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function copyFrozenStrings(values: readonly string[]): readonly string[] | undefined {
  const length = ownArrayLength(values);
  if (length === undefined) return undefined;

  const result: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = ownData(values, String(index));
    if (!descriptor || typeof descriptor.value !== "string") return undefined;
    appendOwnArrayValue(result, descriptor.value);
  }
  return Object.freeze(result);
}

function compareEntry(left: ExperienceMarketplaceEntry, right: ExperienceMarketplaceEntry): number {
  if (left.id !== right.id) return left.id < right.id ? -1 : 1;
  if (left.version === right.version) return 0;
  return left.version < right.version ? -1 : 1;
}

function containsExactEntry(
  entries: readonly ExperienceMarketplaceEntry[],
  id: string,
  version: string,
): boolean {
  const length = ownArrayLength(entries);
  if (length === undefined) return true;
  for (let index = 0; index < length; index += 1) {
    const descriptor = ownData(entries, String(index));
    if (!descriptor) return true;
    const entry = descriptor.value as ExperienceMarketplaceEntry;
    if (entry.id === id && entry.version === version) return true;
  }
  return false;
}

function insertCanonicalEntry(
  entries: ExperienceMarketplaceEntry[],
  entry: ExperienceMarketplaceEntry,
): boolean {
  let insertAt = 0;
  while (insertAt < entries.length) {
    const current = ownData(entries, String(insertAt));
    if (!current) return false;
    if (compareEntry(entry, current.value as ExperienceMarketplaceEntry) < 0) break;
    insertAt += 1;
  }

  for (let index = entries.length; index > insertAt; index -= 1) {
    const previous = ownData(entries, String(index - 1));
    if (!previous) return false;
    defineOwnData(entries, String(index), previous.value);
  }
  defineOwnData(entries, String(insertAt), entry);
  return true;
}

function entryFromManifest(manifest: RegistryManifest): ExperienceMarketplaceEntry | undefined {
  const tags = copyFrozenStrings(manifest.metadata.tags);
  if (!tags) return undefined;

  const entry = Object.create(null) as Record<string, unknown>;
  defineOwnData(entry, "id", manifest.id);
  defineOwnData(entry, "version", manifest.version);
  defineOwnData(entry, "publisherId", manifest.publisher.id);
  defineOwnData(entry, "publisherName", manifest.publisher.name);
  defineOwnData(entry, "name", manifest.metadata.name);
  defineOwnData(entry, "tags", tags);
  defineOwnData(entry, "minViraVersion", manifest.compatibility.minViraVersion);

  const description = ownData(manifest.metadata, "description");
  if (description && typeof description.value === "string") {
    defineOwnData(entry, "description", description.value);
  }
  const maxViraVersion = ownData(manifest.compatibility, "maxViraVersion");
  if (maxViraVersion && typeof maxViraVersion.value === "string") {
    defineOwnData(entry, "maxViraVersion", maxViraVersion.value);
  }

  return Object.freeze(entry) as unknown as ExperienceMarketplaceEntry;
}

function exactListingFields(listing: Record<string, unknown>): boolean {
  const keys = REFLECT_OWN_KEYS(listing);
  if (keys.length !== 2) return false;
  let hasId = false;
  let hasVersion = false;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === "id") {
      hasId = true;
      continue;
    }
    if (key === "version") {
      hasVersion = true;
      continue;
    }
    return false;
  }
  return hasId && hasVersion;
}

function parseListingsJson(input: unknown):
  | { readonly ok: true; readonly value: readonly unknown[] }
  | { readonly ok: false; readonly result: ExperienceMarketplaceCatalogResult } {
  if (
    typeof input !== "string"
    || input.length === 0
    || input.length > EXPERIENCE_MARKETPLACE_LISTINGS_JSON_MAX_LENGTH
  ) {
    return {
      ok: false,
      result: failure(
        "INVALID_LISTINGS",
        "$.listings",
        `marketplace listings must be JSON text of at most ${EXPERIENCE_MARKETPLACE_LISTINGS_JSON_MAX_LENGTH} characters`,
      ),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch {
    return {
      ok: false,
      result: failure("INVALID_LISTINGS", "$.listings", "marketplace listings must be valid JSON"),
    };
  }
  if (!Array.isArray(parsed)) {
    return {
      ok: false,
      result: failure("INVALID_LISTINGS", "$.listings", "marketplace listings JSON root must be an array"),
    };
  }
  if (parsed.length > EXPERIENCE_MARKETPLACE_MAX_LISTINGS) {
    return {
      ok: false,
      result: failure(
        "LISTING_LIMIT_EXCEEDED",
        "$.listings",
        `marketplace may contain at most ${EXPERIENCE_MARKETPLACE_MAX_LISTINGS} listings`,
      ),
    };
  }
  return { ok: true, value: parsed };
}

export function createExperienceMarketplaceCatalog(
  registryInput: unknown,
  listingsJsonInput: unknown,
): ExperienceMarketplaceCatalogResult {
  if (!isCanonicalExperienceRegistrySnapshot(registryInput)) {
    return failure(
      "INVALID_REGISTRY",
      "$.registry",
      "experience marketplace requires a canonical Experience Registry snapshot",
    );
  }

  const parsedListings = parseListingsJson(listingsJsonInput);
  if (!parsedListings.ok) return parsedListings.result;

  const entries: ExperienceMarketplaceEntry[] = [];
  for (let index = 0; index < parsedListings.value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(parsedListings.value, String(index));
    if (!descriptor || !("value" in descriptor) || !parsedObject(descriptor.value)) {
      return failure("INVALID_LISTING", `$.listings[${index}]`, "marketplace listing must be an object");
    }
    const listing = descriptor.value;
    if (!exactListingFields(listing)) {
      return failure("INVALID_LISTING", `$.listings[${index}]`, "marketplace listing must contain only id and version");
    }

    const idDescriptor = ownData(listing, "id");
    const versionDescriptor = ownData(listing, "version");
    if (
      !idDescriptor
      || !versionDescriptor
      || typeof idDescriptor.value !== "string"
      || typeof versionDescriptor.value !== "string"
    ) {
      return failure("INVALID_LISTING", `$.listings[${index}]`, "marketplace listing id and version must be strings");
    }

    const lookup = lookupExperienceRegistryManifest(
      registryInput,
      idDescriptor.value,
      versionDescriptor.value,
    );
    if (!lookup.ok) {
      return failure("INVALID_LISTING", `$.listings[${index}]`, "marketplace listing reference is invalid");
    }
    if (!lookup.value.manifest) {
      return failure("MISSING_LISTING", `$.listings[${index}]`, "marketplace listing does not resolve in Registry");
    }

    const manifest = lookup.value.manifest;
    if (containsExactEntry(entries, manifest.id, manifest.version)) {
      return failure("DUPLICATE_LISTING", `$.listings[${index}]`, "marketplace contains a duplicate exact listing reference");
    }

    const entry = entryFromManifest(manifest);
    if (!entry || !insertCanonicalEntry(entries, entry)) {
      return failure("INVALID_REGISTRY", "$.registry", "canonical Registry snapshot could not be projected safely");
    }
  }

  const catalog: ExperienceMarketplaceCatalog = Object.freeze({
    schemaVersion: EXPERIENCE_MARKETPLACE_SCHEMA_VERSION,
    entries: Object.freeze(entries),
  });
  weakSetAdd(CANONICAL_CATALOGS, catalog);
  return { ok: true, value: catalog };
}

export function isCanonicalExperienceMarketplaceCatalog(
  input: unknown,
): input is ExperienceMarketplaceCatalog {
  return input !== null
    && typeof input === "object"
    && weakSetHas(CANONICAL_CATALOGS, input as object);
}
